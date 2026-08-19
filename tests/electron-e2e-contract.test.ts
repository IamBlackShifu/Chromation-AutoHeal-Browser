import fs from 'fs';
import path from 'path';

describe('Electron E2E certification foundation', () => {
  const root = process.cwd();
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const smoke = fs.readFileSync(path.join(root, 'tests', 'e2e', 'electron-smoke.js'), 'utf8');

  it('provides an explicit Playwright Electron smoke gate with failure evidence and cleanup', () => {
    expect(packageJson.scripts['test:e2e:electron']).toContain('electron-smoke.js');
    expect(smoke).toContain("require('playwright-core')");
    expect(smoke).toContain('electron.launch');
    expect(smoke).toContain('app.firstWindow');
    expect(smoke).toContain('chromation-electron-smoke-failure.png');
    expect(smoke).toContain('recordEditSaveRestartReopen: true');
    expect(smoke).toContain("selectOption('webview')");
    expect(smoke).toContain(".report-issue.healed");
    expect(smoke).toContain('scriptExport: true');
    expect(smoke).toContain('reportExport: true');
    expect(smoke).toContain('await app.close()');
  });
});
