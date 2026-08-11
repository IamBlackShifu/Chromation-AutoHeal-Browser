import fs from 'fs';
import path from 'path';

describe('Mobile Electron IPC bridge', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'electron-main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(process.cwd(), 'preload.js'), 'utf8');

  test('allowlists every mobile request in preload', () => {
    for (const channel of ['mobile-connect', 'mobile-status', 'mobile-inspect', 'mobile-action', 'mobile-disconnect']) {
      expect(preload).toContain(`'${channel}'`);
    }
  });

  test('validates renderer origin, local Appium URL, platform, and device name', () => {
    expect(main).toContain('function assertTrustedRenderer(event)');
    expect(main).toContain("request.platform !== 'android'");
    expect(main).toContain("['127.0.0.1', 'localhost', '::1']");
    expect(main).toContain("throw new Error('Device name is required')");
    expect(main).toContain("'appium:udid': udid");
  });

  test('owns connect, status, inspect, and disconnect lifecycle in the main process', () => {
    for (const channel of ['mobile-connect', 'mobile-status', 'mobile-inspect', 'mobile-action', 'mobile-disconnect']) {
      expect(main).toContain(`ipcMain.handle('${channel}'`);
    }
    expect(main).toContain('new AndroidAutomationDriver(config)');
    expect(main).toContain('mobileDriver.inspectHierarchy()');
  });
});
