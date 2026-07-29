import fs from 'fs';
import path from 'path';
import { Reporter } from '../src/reporter/Reporter';

describe('Reports center reliability', () => {
  test('accepts completed in-browser reports into searchable history', () => {
    const reporter = new Reporter();
    reporter.recordReport({
      runId: 'webview-1',
      testName: 'Checkout flow',
      startTime: 10,
      endTime: 30,
      duration: 20,
      status: 'failed',
      steps: [{ name: 'Submit order', status: 'failed', duration: 10, error: 'Button missing' }],
      screenshots: [],
      healingEvents: 0,
    });
    expect(reporter.searchHistory({ text: 'button missing' })).toHaveLength(1);
    expect(reporter.getRunAnalytics().runs).toBe(1);
  });

  test('separates run and step pass rates and excludes cancelled runs', () => {
    const reporter = new Reporter();
    const report = (status: 'passed' | 'failed' | 'cancelled', steps: Array<'passed' | 'failed' | 'cancelled'>, id: string) => ({
      runId: id, testName: id, startTime: 1, endTime: 2, duration: 1, status,
      steps: steps.map((stepStatus, index) => ({ name: `step-${index}`, status: stepStatus, duration: 1 })),
      screenshots: [], healingEvents: 0,
    });
    reporter.recordReport(report('passed', ['passed', 'passed'], 'passed'));
    reporter.recordReport(report('failed', ['passed', 'failed'], 'failed'));
    reporter.recordReport(report('cancelled', ['cancelled'], 'cancelled'));
    const analytics = reporter.getRunAnalytics();
    expect(analytics.runs).toBe(3);
    expect(analytics.completedRuns).toBe(2);
    expect(analytics.passRate).toBe(0.5);
    expect(analytics.stepPassRate).toBe(0.75);
  });

  test('persists history and opens actionable report details', () => {
    const root = process.cwd();
    const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
    const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
    const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
    expect(renderer).toContain('reporter.recordReport(buildWebviewExecutionReport())');
    expect(renderer).toContain('function persistRunHistory()');
    expect(renderer).toContain('function hydrateRunHistory()');
    expect(renderer).toContain('function openHistoricalReport(report)');
    expect(renderer).toContain('data-run-history-index');
    expect(preload).toContain("'save-run-history'");
    expect(preload).toContain("'load-run-history'");
    expect(main).toContain("ipcMain.handle('save-run-history'");
    expect(main).toContain("ipcMain.handle('load-run-history'");
  });
});
