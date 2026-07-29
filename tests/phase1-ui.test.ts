import fs from 'fs';
import path from 'path';

describe('Phase 1 UI modernization', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'ui', 'renderer.js'), 'utf8');

  test('exposes every primary function in a labeled tool rail', () => {
    expect(html).toContain('id="tool-rail"');
    for (const label of ['Browse', 'Inspect', 'Record', 'Replay', 'Scrape', 'Reports', 'Settings']) {
      expect(html).toContain(`<span>${label}</span>`);
    }
    expect(html.match(/class="rail-action/g)).toHaveLength(7);
    expect(html.match(/aria-label="/g)?.length).toBeGreaterThanOrEqual(9);
  });

  test('provides command search, workspace health, and live badges', () => {
    expect(html).toContain('id="command-palette"');
    expect(renderer).toContain("event.key.toLowerCase() === 'k'");
    expect(renderer).toContain('getFilteredCommands');
    for (const id of ['home-health-score', 'home-recent-recordings', 'home-recent-runs', 'rail-recording-badge', 'rail-action-count', 'rail-failure-count', 'rail-healing-count']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test('captures and restores tool panel state per tab', () => {
    expect(renderer).toContain('function captureActiveTabUIState()');
    expect(renderer).toContain('function restoreTabUIState(tab)');
    expect(renderer).toContain('panelScrollTop');
    expect(renderer).toContain('captureActiveTabUIState();');
  });

  test('makes workspace recordings reusable and clearly named', () => {
    expect(renderer).toContain('function getSuggestedRecordingName(actions = [])');
    expect(renderer).toContain('function requestRecordingName(');
    expect(renderer).toContain('home-load-recording');
    expect(renderer).toContain('home-replay-recording');
    expect(renderer).toContain('home-rename-recording');
    expect(renderer).toContain("ipcRenderer.invoke('rename-recording'");
    expect(html).toContain('id="recording-name-dialog"');
  });

  test('leaves the home layer before opening rail tools', () => {
    const toggleTool = renderer.slice(renderer.indexOf('function toggleTool(tool)'), renderer.indexOf('function closePanel()'));
    expect(toggleTool).toContain("homeWorkspace?.classList.add('hidden')");
    expect(toggleTool).toContain("browserView?.classList.remove('hidden')");
  });
});
