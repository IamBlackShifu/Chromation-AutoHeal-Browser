import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'ui', 'styles.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

describe('isolated workspace launcher', () => {
  it('offers branded Web and Mobile targets before the shell is interactive', () => {
    expect(html).toContain('id="workspace-launcher"');
    expect(html).toContain('Welcome to OmniFlow QA');
    expect(html).toContain('data-launch-workspace="web"');
    expect(html).toContain('data-launch-workspace="mobile"');
    expect(html).toContain('Always launch into this workspace mode');
    expect(html).toContain('Powered by <strong>Infinity Lines of Code Pvt Ltd</strong>');
    expect(html).toContain('class="workspace-switcher"');
    expect(html).toContain('src="../assets/omniflow-qa-logo.png"');
    expect(html).toContain('alt="OmniFlow QA logo"');
    expect(styles).toContain('.workspace-launcher-wordmark');
  });

  it('maintains distinct timelines and restores only the selected workspace', () => {
    expect(renderer).toContain('workspaceSessionStores');
    expect(renderer).toContain('workspaceSessionStores[previous]');
    expect(renderer).toContain('await recorder.setActions(selected.actions)');
    expect(renderer).toContain("currentRecordingTarget = { ...selected.target }");
    expect(renderer).toContain('selectedStepIndex = null');
    expect(renderer).toContain('workspaceForRecordingTarget(target)');
    expect(renderer).toContain('if (requiredWorkspace !== activeAutomationWorkspace) await switchAutomationWorkspace(requiredWorkspace)');
  });

  it('tears down owned mobile infrastructure before entering Web mode', () => {
    expect(renderer).toContain("ipcRenderer.invoke('workspace-teardown', 'mobile')");
    expect(main).toContain("ipcMain.handle('workspace-teardown'");
    expect(main).toContain('appiumProcessManager.stopAll()');
    expect(main).toContain('scrcpyProcessManager.stopAll()');
    expect(main).toContain('await mobileDriver?.disconnect()');
    expect(preload).toContain("'workspace-teardown'");
  });

  it('enforces mode-specific navigation and surfaces', () => {
    expect(renderer).toContain("activeAutomationWorkspace === 'mobile' && tool !== 'mobile'");
    expect(renderer).toContain("activeAutomationWorkspace === 'web' && tool === 'mobile'");
    expect(styles).toContain('.workspace-mobile .navbar');
    expect(styles).toContain('.workspace-web .rail-action[data-tool="mobile"]');
  });
});
