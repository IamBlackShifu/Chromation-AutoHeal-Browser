import fs from 'fs';
import path from 'path';

describe('Mobile automation UI', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'ui', 'renderer.js'), 'utf8');
  const styles = fs.readFileSync(path.join(process.cwd(), 'ui', 'styles.css'), 'utf8');

  test('adds Mobile as a first-class labeled workspace', () => {
    expect(html).toContain('data-tool="mobile"');
    expect(html).toContain('<span>Mobile</span>');
    expect(renderer).toContain("case 'mobile':");
    expect(renderer).toContain('function showMobilePanel()');
  });

  test('provides target configuration and clear disconnected state', () => {
    for (const id of ['mobile-platform', 'mobile-mode', 'mobile-server-url', 'mobile-device-name',
      'mobile-device-udid', 'mobile-app-id', 'mobile-run-doctor', 'mobile-connect', 'mobile-connection-state']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('Disconnected');
    expect(renderer).toContain('Opening Appium session');
  });

  test('shows device, context, hierarchy, and locator inspection surfaces', () => {
    for (const id of ['mobile-context', 'mobile-screen', 'mobile-orientation', 'mobile-device-preview',
      'mobile-refresh-hierarchy', 'mobile-hierarchy-empty', 'mobile-locator-preview']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('Select an element from the live hierarchy');
    expect(styles).toContain('.mobile-device-frame');
    expect(styles).toContain('.mobile-session-strip');
  });

  test('connects the UI to allowlisted mobile IPC and renders live inspection data', () => {
    for (const channel of ['mobile-connect', 'mobile-status', 'mobile-inspect', 'mobile-action', 'mobile-disconnect']) {
      expect(renderer).toContain(`ipcRenderer.invoke('${channel}'`);
    }
    expect(renderer).toContain('function renderMobileInspection(');
    expect(renderer).toContain('mobile-device-screenshot');
    expect(renderer).toContain('data-mobile-element-index');
    expect(html).not.toContain('Implementation status');
  });

  test('supports live tap, type, clear, locator selection, and adding recorder steps', () => {
    for (const marker of ['mobile-live-tap', 'mobile-live-type', 'mobile-live-clear', 'mobile-add-step',
      'function runLiveMobileAction(', 'function addSelectedMobileStep(', 'locatorFingerprint']) {
      expect(renderer).toContain(marker);
    }
  });

  test('supports hybrid contexts and common live device controls', () => {
    for (const marker of ['mobile-live-back', 'mobile-live-keyboard', 'mobile-live-rotate',
      'function runMobileDeviceAction(', "runMobileDeviceAction('switchContext'"]) {
      expect(`${html}\n${renderer}`).toContain(marker);
    }
  });

  test('can expand the live portrait inspector for precise recording', () => {
    expect(html).toContain('id="mobile-expand-preview"');
    expect(renderer).toContain('function toggleExpandedMobileInspector()');
    expect(styles).toContain('.mobile-inspector-card.expanded');
    expect(styles).toContain('height: min(640px, 76vh)');
  });
});
