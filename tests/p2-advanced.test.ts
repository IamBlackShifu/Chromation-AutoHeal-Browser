import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AdvancedPageTesting, ResultArtifactStore, VisualRegressionService,
} from '../src/advanced/AdvancedTesting';
import { ReviewedTestGenerator } from '../src/advanced/TestGeneration';
import { RunScheduler } from '../src/advanced/Scheduling';
import { CIResultSynchronizer, RemoteWorkerCoordinator } from '../src/advanced/RemoteExecution';
import { parseCliArguments, parseMatrix } from '../src/cli';

describe('P2 advanced testing capabilities', () => {
  test('creates and compares durable visual baselines with thresholds', () => {
    const visual = new VisualRegressionService();
    visual.setBaseline('home', Buffer.from([1, 2, 3, 4]));
    expect(visual.compare('home', Buffer.from([1, 2, 3, 4])).passed).toBe(true);
    expect(visual.compare('home', Buffer.from([1, 2, 9, 4]), 0.2).passed).toBe(false);
    const restored = new VisualRegressionService();
    restored.import(visual.export());
    expect(restored.getBaseline('home')?.hash).toHaveLength(64);
  });

  test('executes API assertions and installs deterministic network mocks', async () => {
    const fulfill = jest.fn();
    const page = {
      route: jest.fn(async (_pattern, handler) => handler({ fulfill })),
      request: {
        fetch: jest.fn().mockResolvedValue({
          status: () => 201, headers: () => ({ 'content-type': 'application/json' }),
          text: () => Promise.resolve('{"created":true}'),
        }),
      },
    };
    const advanced = new AdvancedPageTesting();
    await advanced.installMocks(page as never, [{ urlPattern: '**/api/user', status: 200, body: '{"mock":true}' }]);
    expect(fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    const result = await advanced.runApiStep(page as never, {
      method: 'POST', url: 'https://example.test/api', expectedStatus: 201, expectedBodyContains: 'created',
    });
    expect(result.passed).toBe(true);
  });

  test('returns accessibility findings and enforces Web Vitals budgets', async () => {
    const page = {
      evaluate: jest.fn()
        .mockResolvedValueOnce([
          { rule: 'image-alt', severity: 'serious', selector: 'img', message: 'Missing alt' },
        ])
        .mockResolvedValueOnce({
          loadMs: 900, firstContentfulPaintMs: 400, largestContentfulPaintMs: 700,
          cumulativeLayoutShift: 0.03, interactionToNextPaintMs: 100,
        }),
    };
    const advanced = new AdvancedPageTesting();
    const accessibility = await advanced.scanAccessibility(page as never);
    expect(accessibility).toMatchObject({ passed: false, counts: { serious: 1 } });
    const performance = await advanced.measurePerformance(page as never, {
      loadMs: 800, cumulativeLayoutShift: 0.1,
    });
    expect(performance.passed).toBe(false);
    expect(performance.violations[0].metric).toBe('loadMs');
  });

  test('requires explicit review before generated tests can execute', () => {
    const generator = new ReviewedTestGenerator();
    const draft = generator.generate('Go to https://example.test then click login then verify dashboard is visible');
    expect(draft.actions).toHaveLength(3);
    expect(() => generator.executableActions(draft.id)).toThrow(/explicit approval/);
    generator.approve(draft.id, 'Reviewed selectors');
    expect(generator.executableActions(draft.id)).toHaveLength(3);
  });

  test('schedules due runs and persists headless/CI artifacts', async () => {
    const scheduler = new RunScheduler();
    const schedule = scheduler.create('Hourly smoke', 60, { tags: ['smoke'] }, 100);
    expect(scheduler.due(100)[0].id).toBe(schedule.id);
    expect(scheduler.markRun(schedule.id, 200).nextRunAt).toBe(3_600_200);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chromation-results-'));
    const store = new ResultArtifactStore(directory);
    await store.save('ci', 'passed', { total: 2 });
    expect(await store.list()).toHaveLength(1);
    const executions = await scheduler.runDue(async (due) => due.payload, 3_600_200);
    expect(executions[0].result).toEqual({ tags: ['smoke'] });
  });

  test('synchronizes CI results and queues transient failures for retry', async () => {
    const request = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, status: 200 });
    const synchronizer = new CIResultSynchronizer(
      'https://ci.example.test/results', 'token', request as never
    );
    const result = {
      jobId: 'job', workerId: 'worker', status: 'passed' as const, payload: {},
      completedAt: Date.now(),
    };
    expect(await synchronizer.synchronize(result)).toBe(false);
    expect(synchronizer.pendingCount()).toBe(1);
    expect(await synchronizer.retryPending()).toEqual({ synchronized: 1, remaining: 0 });
  });

  test('authenticates remote workers and synchronizes CI results', () => {
    const coordinator = new RemoteWorkerCoordinator('1234567890abcdef');
    const workerId = 'worker-1';
    coordinator.register(workerId, ['chrome', 'linux'], coordinator.sign(`register:${workerId}`));
    const job = coordinator.enqueue({ testId: 'checkout' });
    expect(coordinator.claim(workerId, ['chrome'])?.id).toBe(job.id);
    const message = `result:${job.id}:${workerId}:passed`;
    coordinator.synchronize({ jobId: job.id, workerId, status: 'passed', payload: { duration: 10 } }, coordinator.sign(message));
    expect(coordinator.getResult(job.id)?.status).toBe('passed');
  });

  test('parses headless CLI filters, matrices, concurrency, and result paths', () => {
    const options = parseCliArguments([
      '--suite', './suite.json', '--tags', 'smoke,e2e', '--exclude-tags', 'slow',
      '--matrix', '{"browser":["chrome","msedge"]}', '--concurrency', '4', '--results', './results',
    ]);
    expect(options.tags).toEqual(['smoke', 'e2e']);
    expect(options.matrix.browser).toEqual(['chrome', 'msedge']);
    expect(options.concurrency).toBe(4);
    expect(path.isAbsolute(options.resultDirectory)).toBe(true);
    expect(parseMatrix('{browser:[chrome,msedge]}')).toEqual({ browser: ['chrome', 'msedge'] });
  });
});
