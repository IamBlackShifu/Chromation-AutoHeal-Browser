import fs from 'fs';
import path from 'path';

describe('Mobile Electron IPC bridge', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'electron-main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(process.cwd(), 'preload.js'), 'utf8');

  test('allowlists every mobile request in preload', () => {
    for (const channel of ['mobile-connect', 'mobile-doctor', 'mobile-list-devices', 'mobile-preflight', 'mobile-load-profiles', 'mobile-save-profile', 'mobile-delete-profile', 'mobile-status', 'mobile-inspect', 'mobile-action', 'mobile-replay', 'mobile-cancel-replay', 'mobile-replay-status', 'mobile-disconnect', 'mobile-touch-capture-status']) {
      expect(preload).toContain(`'${channel}'`);
    }
  });

  test('provides setup diagnostics, profiles, preflight, and the Phase 2 compatibility matrix', () => {
    for (const channel of ['mobile-doctor', 'mobile-list-devices', 'mobile-preflight', 'mobile-load-profiles', 'mobile-save-profile', 'mobile-delete-profile']) {
      expect(main).toContain(`ipcMain.handle('${channel}'`);
    }
    expect(main).toContain('ANDROID_ACTION_MATRIX');
    expect(main).toContain("'appium.cmd'");
    expect(main).toContain("'adb', ['devices', '-l']");
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

  test('routes replay through the Android driver and preserves recording targets', () => {
    expect(main).toContain("ipcMain.handle('mobile-replay'");
    expect(main).toContain('driver.execute(validated, request?.options)');
    expect(main).toContain("ipcMain.handle('mobile-replay-status'");
    expect(main).toContain('mobileReplayBootstrap: true');
    expect(main).toContain("'appium:autoGrantPermissions': true");
    expect(main).toContain('sessionReused: true');
    expect(main).toContain('createRecordingDocument(name, actions, timestamp, target)');
  });
});
