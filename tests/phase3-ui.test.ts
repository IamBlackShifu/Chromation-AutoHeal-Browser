import fs from 'fs';
import path from 'path';

describe('Phase 3 visual system', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'ui', 'renderer.js'), 'utf8');
  const styles = fs.readFileSync(path.join(process.cwd(), 'ui', 'styles.css'), 'utf8');

  test('uses reusable design and semantic tokens', () => {
    for (const token of ['--space-1', '--radius-md', '--font-sm', '--elevation-1', '--color-success', '--color-danger', '--color-warning', '--color-running', '--color-muted']) {
      expect(styles).toContain(token);
    }
    expect(styles).toContain('color-scheme: dark');
    expect(renderer).toContain("prefers-color-scheme: dark");
  });

  test('offers density, motion, and performance preferences', () => {
    expect(html).toContain('id="ui-density-select"');
    expect(html).toContain('id="ui-reduce-motion"');
    expect(html).toContain('id="ui-low-performance"');
    expect(renderer).toContain('function applyVisualPreferences()');
    expect(styles).toContain('[data-density="compact"]');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  test('prevents crowded report actions and nested panel scrolling', () => {
    expect(html).toContain('class="report-action-grid"');
    expect(styles).toContain('.report-action-grid #run-history-btn');
    expect(styles).toContain('overflow-x: hidden');
    expect(styles).toMatch(/\.tool-panel\s*\{[^}]*overflow:\s*visible/s);
  });

  test('uses consistent SVG step icons and visible keyboard focus', () => {
    expect(renderer).toContain('function getActionIcon(type)');
    expect(renderer).toContain('class="step-action-icon"');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('.step-editor-error:not(:empty)');
  });
});
