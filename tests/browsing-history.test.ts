import fs from 'fs';
import path from 'path';

describe('Browsing history', () => {
  const root = process.cwd();
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');

  test('persists and manages visits through restricted IPC channels', () => {
    for (const channel of ['add-browsing-history', 'load-browsing-history', 'delete-browsing-history-entry', 'clear-browsing-history']) {
      expect(preload).toContain(`'${channel}'`);
      expect(main).toContain(`ipcMain.handle('${channel}'`);
    }
    expect(main).toContain('entries.slice(0, 5000)');
    expect(main).toContain("!/^https?:\\/\\//i.test(url)");
  });

  test('records completed pages and provides actionable grouped history', () => {
    expect(renderer).toContain('function recordBrowsingVisit()');
    expect(renderer).toContain("browserWebview.addEventListener('did-finish-load', recordBrowsingVisit)");
    expect(renderer).toContain('function renderBrowsingHistoryGroups(');
    expect(renderer).toContain('data-history-index');
    expect(renderer).toContain('data-history-id');
    expect(renderer).toContain("requestConfirmation('All saved browsing visits");
    expect(renderer).toContain("event.key.toLowerCase() === 'h'");
  });
});
