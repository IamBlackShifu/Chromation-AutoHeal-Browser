import { Reporter } from '../src/reporter/Reporter';
import { ExecutionResult } from '../src/executor/types';

describe('Reporter', () => {
  let reporter: Reporter;

  beforeEach(() => {
    reporter = new Reporter();
  });

  test('should map ScriptExecutor result into ExecutionReport', () => {
    const execution: ExecutionResult = {
      runId: 'run_test_1',
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      status: 'failed',
      options: {
        continueOnFailure: false,
        defaultStepTimeoutMs: 5000,
      },
      steps: [
        {
          index: 0,
          action: { type: 'navigate', selector: 'window', value: 'https://example.com', timestamp: 1000 },
          status: 'passed',
          startedAt: 1000,
          endedAt: 1200,
          durationMs: 200,
          retries: 0,
        },
        {
          index: 1,
          action: { type: 'click', selector: '#submit', timestamp: 1200 },
          status: 'failed',
          startedAt: 1200,
          endedAt: 1500,
          durationMs: 300,
          retries: 1,
          error: 'Element not found',
          evidence: {
            screenshotBase64: 'ZmFrZQ==',
            domSnapshot: '<html></html>',
          },
        },
      ],
      summary: {
        total: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        durationMs: 1000,
      },
      consoleLogs: ['[error] boom'],
      networkSummary: [{ url: 'https://example.com', method: 'GET', status: 200, timestamp: 1100 }],
    };

    const report = reporter.fromExecutionResult('Smoke Test', execution);

    expect(report.runId).toBe('run_test_1');
    expect(report.testName).toBe('Smoke Test');
    expect(report.status).toBe('failed');
    expect(report.steps).toHaveLength(2);
    expect(report.screenshots).toHaveLength(1);
    expect(report.networkLogs).toHaveLength(1);
    expect(report.consoleLogs).toHaveLength(1);
  });

  test('should export junit, har, and allure formats', async () => {
    reporter.startReport('Sample Test');
    reporter.addStep({ name: 'step-1', status: 'passed', duration: 50 });
    reporter.addStep({ name: 'step-2', status: 'failed', duration: 100, error: 'oops' });
    const report = reporter.endReport();

    expect(report).toBeDefined();
    if (!report) {
      return;
    }

    report.runId = 'run_sample';
    report.networkLogs = [{ url: 'https://example.com', method: 'GET', status: 200, timestamp: Date.now() }];

    const junit = await reporter.exportReport(report, 'junit');
    const har = await reporter.exportReport(report, 'har');
    const allure = await reporter.exportReport(report, 'allure');

    expect(junit).toContain('<testsuite');
    expect(junit).toContain('failures="1"');
    expect(har).toContain('"log"');
    expect(har).toContain('"entries"');
    expect(allure).toContain('"uuid"');
    expect(allure).toContain('"steps"');
  });
});
