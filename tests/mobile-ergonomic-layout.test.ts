import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'ui', 'styles.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

describe('Mobile Workspace ergonomic unified studio', () => {
  it('uses the complete main-content width rather than a clipped drawer', () => {
    expect(styles).toContain('.workspace-mobile .main-content>.side-panel');
    expect(styles).toContain('width:100%!important');
    expect(styles).toContain('.mobile-panel.mobile-disconnected');
    expect(styles).toContain('.mobile-panel.mobile-connected');
  });

  it('renders configuration beside a live readiness and diagnostics board', () => {
    for (const id of ['mobile-readiness-state', 'mobile-readiness-device-name', 'mobile-ready-bridge',
      'mobile-ready-appium', 'mobile-ready-app', 'mobile-ready-display']) expect(html).toContain(`id="${id}"`);
    expect(main).toContain("ipcMain.handle('mobile-workspace-readiness'");
    expect(preload).toContain("'mobile-workspace-readiness'");
    expect(renderer).toContain("ipcRenderer.invoke('mobile-workspace-readiness'");
  });

  it('transitions to the connected studio and exposes complete timeline actions', () => {
    expect(renderer).toContain("mobilePanel.classList.toggle('mobile-connected', isConnected)");
    expect(renderer).toContain("mobilePanel.classList.toggle('mobile-disconnected', !isConnected)");
    expect(html).toContain('id="mobile-record-export"');
    expect(renderer).toContain("exportScript('appium-typescript')");
  });

  it('supports focus mode and draggable device/timeline splitters', () => {
    expect(html).toContain('data-mobile-splitter="device"');
    expect(html).toContain('data-mobile-splitter="timeline"');
    expect(renderer).toContain("style.setProperty('--device-pane'");
    expect(renderer).toContain("style.setProperty('--timeline-pane'");
    expect(renderer).toContain("panel.classList.toggle('focus-mode')");
    expect(styles).toContain('.mobile-panel.focus-mode');
  });

  it('contains hardware and recording controls within their cards', () => {
    expect(renderer).toContain('inspectorHeader.after(deviceControlsBar)');
    expect(styles).toContain('.mobile-inspector-card>.mobile-device-controls');
    expect(styles).toContain('.mobile-recording-bar{grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(styles).toContain('#mobile-record-replay');
  });
});
