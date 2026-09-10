import fs from 'fs';
import path from 'path';

describe('Electron E2E certification foundation', () => {
  const root = process.cwd();
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const smoke = fs.readFileSync(path.join(root, 'tests', 'e2e', 'electron-smoke.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');

  it('provides an explicit Playwright Electron smoke gate with failure evidence and cleanup', () => {
    expect(packageJson.scripts['test:e2e:electron']).toContain('electron-smoke.js');
    expect(packageJson.scripts['test:e2e:electron:packaged']).toContain('electron-smoke.js');
    expect(smoke).toContain("require('playwright-core')");
    expect(smoke).toContain('electron.launch');
    expect(smoke).toContain('app.firstWindow');
    expect(smoke).toContain('chromation-electron-smoke-failure.png');
    expect(smoke).toContain('recordEditSaveRestartReopen: true');
    expect(smoke).toContain('inspectorAuthoring: true');
    expect(smoke).toContain("selectOption('webview')");
    expect(smoke).toContain(".report-issue.healed");
    expect(smoke).toContain('scriptExport: true');
    expect(smoke).toContain('reportExport: true');
    expect(smoke).toContain('failureEvidence: true');
    expect(smoke).toContain('recovery: true');
    expect(smoke).toContain('popupRecovery: true');
    expect(smoke).toContain('downloadRecovery: true');
    expect(smoke).toContain('navigationRecovery: true');
    expect(smoke).toContain('rendererCrashRecovery: true');
    expect(smoke).toContain('permissionRecovery: true');
    expect(smoke).toContain('missing-without-fingerprint');
    expect(smoke).toContain('data-remediation="edit-step"');
    expect(smoke).toContain('CHROMATION_E2E_EXECUTABLE');
    expect(smoke).toContain("window.chromationAPI.ipc.send('window-close')");
    expect(smoke).toContain('await closeApplication(app, page)');
  });

  it('keeps guest failures observable and recoverable through allowlisted events', () => {
    expect(main).toContain("guestSession.on('will-download'");
    expect(main).toContain("contents.setWindowOpenHandler");
    expect(main).toContain("guest-popup-blocked");
    expect(main).toContain("guest-permission-result");
    expect(preload).toContain("'guest-download-blocked'");
    expect(renderer).toContain("'render-process-gone'");
    expect(renderer).toContain("showBrowserRecovery('navigation'");
    expect(renderer).toContain("showBrowserRecovery('crash'");
    expect(renderer).toContain('browserRecoveryTarget');
  });
});
