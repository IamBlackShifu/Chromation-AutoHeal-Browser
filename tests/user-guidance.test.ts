import fs from 'fs';
import path from 'path';

describe('In-product user guidance', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
  const report = fs.readFileSync(path.join(root, 'ui', 'report-workspace.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');

  test('guides first-time users through record, replay, and report', () => {
    expect(html).toContain('id="onboarding-dialog"');
    expect(renderer).toContain('const onboardingSteps = [');
    expect(renderer).toContain("'chromation-onboarding-complete'");
    expect(renderer).toContain('function openOnboarding(force = false)');
  });

  test('explains replay engines and provides searchable help', () => {
    expect(html).toContain('id="replay-engine-guidance"');
    expect(renderer).toContain('function updateReplayEngineGuidance(engine)');
    expect(renderer).toContain('const inAppHelpTopics = [');
    expect(renderer).toContain("event.key === 'F1'");
    expect(renderer).toContain("'Help & Shortcuts'");
  });

  test('connects report remediation actions to the workflow', () => {
    expect(report).toContain('data-remediation="edit-step"');
    expect(report).toContain('data-remediation="review-healing"');
    expect(report).toContain("new CustomEvent('chromation-remediation'");
    expect(renderer).toContain("window.addEventListener('chromation-remediation'");
  });

  test('exposes live diagnostics through restricted IPC', () => {
    expect(preload).toContain("'get-app-diagnostics'");
    expect(main).toContain("ipcMain.handle('get-app-diagnostics'");
    expect(renderer).toContain('async function showDiagnostics()');
    expect(renderer).toContain('Runtime versions');
    expect(renderer).toContain('Origin permissions');
  });
});
