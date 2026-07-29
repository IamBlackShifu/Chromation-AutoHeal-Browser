import fs from 'fs';
import path from 'path';
import vm from 'vm';

describe('instant replay report workspace', () => {
  test('renders actionable failure, healing, timing, diagnostics, and export controls', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'ui', 'report-workspace.js'),
      'utf8'
    );
    const browserWindow: Record<string, unknown> = {};
    vm.runInNewContext(source, { window: browserWindow });
    const workspace = browserWindow.ChromationReportWorkspace as {
      render(container: { innerHTML: string }, report: unknown): void;
    };
    const container = { innerHTML: '', querySelectorAll: () => [] };

    workspace.render(container, {
      runId: 'run-1',
      status: 'failed',
      startedAt: 100,
      durationMs: 1750,
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      healed: 1,
      passRate: 50,
      consoleLogs: ['failure'],
      networkSummary: [{ status: 500 }],
      steps: [
        {
          index: 0,
          action: { type: 'click', selector: '#save' },
          status: 'passed',
          durationMs: 250,
          retries: 0,
          healing: {
            originalSelector: '#old',
            healedSelector: '[data-testid="save"]',
            confidence: 0.91,
            strategy: 'fingerprint',
          },
        },
        {
          index: 1,
          action: { type: 'input', selector: '#name<script>' },
          status: 'failed',
          durationMs: 1500,
          retries: 1,
          error: 'Timeout waiting for element',
          evidence: { screenshotBase64: 'ZmFrZQ==' },
        },
      ],
    });

    expect(container.innerHTML).toContain('Replay executive summary');
    expect(container.innerHTML).toContain('Action required');
    expect(container.innerHTML).toContain('Timeout waiting for element');
    expect(container.innerHTML).toContain('deterministic wait');
    expect(container.innerHTML).toContain('Healing events');
    expect(container.innerHTML).toContain('1.75 s');
    expect(container.innerHTML).toContain('Console entries');
    expect(container.innerHTML).toContain('data-report-format="html"');
    expect(container.innerHTML).toContain('data-export-all-reports');
    expect(container.innerHTML).toContain('src="data:image/png;base64,ZmFrZQ=="');
    expect(container.innerHTML).toContain('<details open>');
    expect(container.innerHTML).toContain('#name&lt;script&gt;');
    expect(container.innerHTML).not.toContain('#name<script>');
  });

  test('accepts data URL and legacy screenshot representations and surfaces capture errors', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'ui', 'report-workspace.js'), 'utf8');
    const browserWindow: Record<string, unknown> = {};
    vm.runInNewContext(source, { window: browserWindow, btoa: (value: string) => Buffer.from(value, 'binary').toString('base64') });
    const workspace = browserWindow.ChromationReportWorkspace as {
      render(container: { innerHTML: string; querySelectorAll(): never[] }, report: unknown): void;
    };
    const base = {
      status: 'failed', startedAt: 1, durationMs: 1, total: 1, passed: 0, failed: 1,
      skipped: 0, healed: 0, passRate: 0, consoleLogs: [], networkSummary: [],
    };
    const dataUrlContainer = { innerHTML: '', querySelectorAll: () => [] as never[] };
    workspace.render(dataUrlContainer, {
      ...base,
      steps: [{ index: 0, action: { type: 'click', selector: '#x' }, status: 'failed', durationMs: 1, retries: 0,
        screenshot: 'data:image/png;base64,ZmFrZQ==' }],
    });
    expect(dataUrlContainer.innerHTML).toContain('src="data:image/png;base64,ZmFrZQ=="');

    const errorContainer = { innerHTML: '', querySelectorAll: () => [] as never[] };
    workspace.render(errorContainer, {
      ...base,
      steps: [{ index: 0, action: { type: 'click', selector: '#x' }, status: 'failed', durationMs: 1, retries: 0,
        evidence: { screenshotError: 'Page was closed' } }],
    });
    expect(errorContainer.innerHTML).toContain('Screenshot unavailable: Page was closed');
  });
});
