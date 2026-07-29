import { TestProject } from '../src/project/TestProject';
import { ScraperStudio } from '../src/scraper/ScraperStudio';
import { RunHistoryStore } from '../src/reporter/RunHistoryStore';
import { Reporter, ExecutionReport } from '../src/reporter/Reporter';
import { ShortcutManager } from '../src/ui/ShortcutManager';

const action = (type: 'input' | 'navigate', selector: string, value: string) => ({
  type, selector, value, timestamp: 1,
});

describe('P1 daily workflow capabilities', () => {
  test('resolves variables, environment profiles, reusable flows, and hooks', () => {
    const project = new TestProject();
    project.setVariable('user', 'default');
    project.setEnvironment({ name: 'staging', baseUrl: 'https://staging.example.test', values: { user: 'staging-user' } });
    project.setFlow('login', [action('input', '#user', '{{user}}')]);
    project.setHook('beforeEach', [action('navigate', 'page', '/reset')]);
    const resolved = project.resolve({
      environment: 'staging', useFlows: ['login'],
      variables: { password: 'safe-data' },
      actions: [action('input', '#password', '{{password}}')],
    });
    expect(resolved.beforeEach[0].value).toBe('https://staging.example.test/reset');
    expect(resolved.actions.map((item) => item.value)).toEqual(['staging-user', 'safe-data']);
    const imported = new TestProject();
    imported.import(project.export());
    expect(imported.resolve({ actions: [], environment: 'staging' }).baseUrl).toContain('staging');
  });

  test('extracts, cleans, deduplicates, reports progress, and exports CSV/Excel', async () => {
    const studio = new ScraperStudio();
    const page = {
      evaluate: jest.fn()
        .mockResolvedValueOnce([{ name: ' Alpha ', price: '12' }, { name: ' Alpha ', price: '12' }]),
    };
    const result = await studio.scrapeTable({
      selector: '.row', fields: [{ name: 'name' }, { name: 'price', type: 'number' }],
      pagination: false, infiniteScroll: false, deduplicateBy: ['name'],
    }, page);
    expect(result.records).toEqual([{ name: 'Alpha', price: 12 }]);
    expect(studio.getProgress()).toMatchObject({ done: true, records: 1 });
    expect(await studio.exportData('csv')).toContain('"Alpha","12"');
    expect(await studio.exportData('excel')).toContain('<Workbook');
  });

  test('stores searchable history and calculates trends and flaky steps', () => {
    const store = new RunHistoryStore();
    const report = (status: 'passed' | 'failed', stepStatus: 'passed' | 'failed', startTime: number): ExecutionReport => ({
      runId: String(startTime), testName: 'Checkout', startTime, endTime: startTime + 10,
      duration: 10, status, screenshots: [], healingEvents: status === 'passed' ? 1 : 0,
      steps: [{ name: 'Submit order', status: stepStatus, duration: 10 }],
    });
    store.add(report('passed', 'passed', 1));
    store.add(report('failed', 'failed', 2));
    expect(store.search({ status: 'failed', text: 'submit' })).toHaveLength(1);
    expect(store.analytics().flakySteps[0]).toMatchObject({ name: 'Submit order', failures: 1, passes: 1 });
  });

  test('generates a real PDF payload and supports editable conflict-safe shortcuts', async () => {
    const reporter = new Reporter();
    const report: ExecutionReport = {
      testName: 'PDF test', startTime: 1, endTime: 2, duration: 1, status: 'passed',
      steps: [{ name: 'Open', status: 'passed', duration: 1 }], screenshots: [], healingEvents: 0,
    };
    expect(await reporter.exportReport(report, 'pdf')).toMatch(/^%PDF-1\.4/);
    const shortcuts = new ShortcutManager();
    shortcuts.set({ command: 'test.run', keys: 'Alt+R', description: 'Run test' });
    expect(shortcuts.find('alt+r')?.command).toBe('test.run');
    expect(() => shortcuts.set({ command: 'other', keys: 'Alt+R', description: 'Conflict' })).toThrow(/already assigned/);
  });
});
