import fs from 'fs';
import path from 'path';

describe('privacy mode', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');

  test('offers an explicit destructive privacy control and initializes it at startup', () => {
    expect(html).toContain('id="ui-privacy-mode"');
    expect(html).toContain('Do not retain browsing history');
    expect(renderer).toContain("const PRIVACY_MODE_KEY = 'omniflow-privacy-mode'");
    expect(renderer).toContain('await initializePrivacyMode()');
    expect(renderer).toContain("'Enable privacy mode?'");
    expect(renderer).toContain("'Clear data & enable'");
  });

  test('suppresses persistent and diagnostic evidence across renderer, preload, and main', () => {
    expect(preload).toContain("'get-privacy-mode'");
    expect(preload).toContain("'set-privacy-mode'");
    expect(preload).toContain('captureDomSnapshotOnFailure: false');
    expect(main).toContain("ipcMain.handle('set-privacy-mode'");
    expect(main).toContain('clearPrivateEvidenceStores()');
    expect(main).toContain('if (privacyModeEnabled) return { success: true, skipped: true');
    expect(renderer).toContain('if (isPrivacyModeEnabled()) return;');
    expect(renderer).toContain("localStorage.removeItem('omniflow-workspace-drafts')");
    expect(renderer).toContain('Evidence capture disabled by privacy mode');
  });
});
