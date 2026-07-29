import { SuiteManager } from '../src/suite/SuiteManager';
import { MatrixRunner } from '../src/executor/MatrixRunner';
import type { ExecutionResult } from '../src/executor/types';

const click = { type: 'click' as const, selector: '#run', timestamp: 1 };
const result = (status: 'passed' | 'failed' = 'passed'): ExecutionResult => ({
  runId: Math.random().toString(), startedAt: 1, endedAt: 2, durationMs: 1, status,
  options: { continueOnFailure: false, defaultStepTimeoutMs: 1000, globalTimeoutMs: 10000 },
  steps: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 1 },
  consoleLogs: [], networkSummary: [],
});

describe('P2 suite and matrix execution', () => {
  test('organizes tests into suites and filters by inherited tags, text, exclusions, and enabled state', () => {
    const manager = new SuiteManager();
    const suite = manager.createSuite('Checkout', { tags: ['E2E', 'commerce'] });
    manager.addTest(suite.id, { name: 'Card payment', actions: [click], tags: ['smoke'], enabled: true });
    manager.addTest(suite.id, { name: 'Disabled draft', actions: [click], tags: ['draft'], enabled: false });
    expect(manager.filter({ tags: ['e2e', 'smoke'], enabledOnly: true })).toHaveLength(1);
    expect(manager.filter({ text: 'payment', excludeTags: ['draft'] })[0].test.name).toBe('Card payment');
    const restored = new SuiteManager();
    restored.import(manager.export());
    expect(restored.listSuites()[0].tests).toHaveLength(2);
  });

  test('expands cartesian matrices and respects bounded concurrency', async () => {
    let active = 0;
    let peak = 0;
    const runner = new MatrixRunner(async (job) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return result(job.dimensions.browser === 'webkit' ? 'failed' : 'passed');
    });
    const jobs = runner.expand([{ id: 't1', name: 'Login', actions: [click] }], {
      browser: ['chrome', 'webkit'],
      locale: ['en', 'fr'],
    });
    expect(jobs).toHaveLength(4);
    const run = await runner.run(jobs, 2);
    expect(peak).toBeLessThanOrEqual(2);
    expect(run.summary).toEqual({ total: 4, passed: 2, failed: 2 });
    expect(run.jobs[0].dimensions).toEqual({ browser: 'chrome', locale: 'en' });
  });

  test('captures worker errors without aborting the remaining matrix', async () => {
    const runner = new MatrixRunner(async (job) => {
      if (job.dimensions.region === 'bad') throw new Error('Worker unavailable');
      return result();
    });
    const jobs = runner.expand([{ id: 't', name: 'Test', actions: [click] }], { region: ['good', 'bad'] });
    const run = await runner.run(jobs);
    expect(run.summary).toEqual({ total: 2, passed: 1, failed: 1 });
    expect(run.jobs[1].error).toBe('Worker unavailable');
  });
});
