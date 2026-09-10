import fs from 'fs';
import path from 'path';

describe('target-aware recording replay routing', () => {
  const root = path.resolve(__dirname, '..');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');

  test('identifies recordings before any replay engine is selected', () => {
    expect(renderer).toContain('function identifyRecordingTarget');
    expect(renderer).toContain('const replayPreparation = await prepareRecordingReplay(actions)');
    expect(renderer.indexOf('const replayPreparation = await prepareRecordingReplay(actions)'))
      .toBeLessThan(renderer.indexOf('isReplaying = true', renderer.indexOf('async function replayActions')));
    expect(renderer).toContain("engine: 'appium'");
  });

  test('blocks mobile replay until Appium, ADB, app identity, and an authorized device are ready', () => {
    expect(renderer).toContain("ipcRenderer.invoke('mobile-workspace-readiness'");
    expect(renderer).toContain("ipcRenderer.invoke('mobile-list-devices')");
    expect(renderer).toContain("ipcRenderer.invoke('mobile-status')");
    expect(renderer).toContain("device.state === 'device'");
    expect(renderer).toContain("'Replay mobile recording?'");
  });

  test('restores saved mobile identity and keeps editor timelines isolated', () => {
    for (const field of ['mobile-device-udid', 'mobile-app-id', 'mobile-app-activity', 'mobile-server-url']) {
      expect(renderer).toContain(`'${field}'`);
    }
    expect(renderer).toContain('workspaceSessionStores[requiredWorkspace] = { actions, target: { ...target } }');
    expect(renderer).toContain('Recording target is ${expectedWorkspace}, but the ${activeAutomationWorkspace} editor is active');
  });

  test('sorts saved recordings using schema timestamps', () => {
    expect(main).toContain('(b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)');
  });
});
