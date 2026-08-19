import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'ui', 'styles.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
const driver = fs.readFileSync(path.join(root, 'src', 'drivers', 'appium', 'AndroidAutomationDriver.ts'), 'utf8');

describe('workspace polish, themes, and recovery', () => {
  it('provides synchronized Dark, Light, and System theme controls', () => {
    expect(html).toContain('id="header-theme-toggle"');
    expect(html).toContain('id="ui-theme-select"');
    for (const mode of ['dark', 'light', 'system']) expect(html).toContain(`value="${mode}"`);
    expect(renderer).toContain("localStorage.getItem('chromation-theme') || 'dark'");
    expect(renderer).toContain("theme?.addEventListener('change', () => applyTheme(theme.value))");
    for (const token of ['--bg-primary', '--bg-secondary', '--accent-color', '--text-primary', '--border-color']) expect(styles).toContain(token);
  });

  it('uses a three-column Mobile Studio and complete quick action toolbar', () => {
    expect(styles).toContain('grid-template-columns:minmax(300px,.92fr) minmax(330px,1.08fr) minmax(330px,.95fr)');
    for (const id of ['mobile-live-home', 'mobile-live-back', 'mobile-live-recent', 'mobile-live-volume-up',
      'mobile-live-volume-down', 'mobile-live-rotate', 'mobile-live-screenshot', 'mobile-live-keyboard']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('id="mobile-hierarchy-search"');
    expect(renderer).toContain("querySelectorAll('.mobile-hierarchy-node.has-children')");
    expect(renderer).toContain("classList.toggle('subtree-hidden', collapse)");
    expect(driver).toContain('recent: 187');
    expect(driver).toContain('volume_up: 24');
  });

  it('prefixes saved suites and exported scripts by workspace', () => {
    expect(main).toContain('`${workspacePrefix}_suite_${cleanName}_${timestamp}.json`');
    expect(renderer).toContain('`${workspace}_${cleanFormat}.spec.${extension}`');
    expect(renderer).toContain('OmniFlow QA - Recorded Test Script');
    expect(renderer).toContain('Product of Infinity Lines of Code Pvt Ltd');
  });

  it('protects and recovers independent workspace drafts', () => {
    expect(renderer).toContain("localStorage.setItem('omniflow-workspace-drafts'");
    expect(renderer).toContain("localStorage.getItem('omniflow-workspace-drafts')");
    expect(renderer).toContain("'Keep draft & switch'");
    expect(renderer).toContain("key === 'm'");
    expect(renderer).toContain("key === 'w'");
  });
});
