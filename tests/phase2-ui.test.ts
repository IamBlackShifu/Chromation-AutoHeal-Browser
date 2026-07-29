import fs from 'fs';
import path from 'path';

describe('Phase 2 testing workflow', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'ui', 'renderer.js'), 'utf8');
  const styles = fs.readFileSync(path.join(process.cwd(), 'ui', 'styles.css'), 'utf8');

  test('provides persistent execution progress and controls', () => {
    for (const id of ['execution-bar', 'execution-bar-progress', 'execution-pause', 'execution-resume', 'execution-step', 'execution-stop']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(renderer).toContain('function updateExecutionElapsed()');
    expect(renderer).toContain("document.getElementById('execution-stop')");
  });

  test('supports searchable, filterable, reorderable timeline steps', () => {
    expect(html).toContain('id="step-search-input"');
    for (const filter of ['all', 'passed', 'failed', 'healed', 'skipped', 'disabled']) {
      expect(html).toContain(`data-step-filter="${filter}"`);
    }
    expect(renderer).toContain("setData('text/step-index'");
    expect(renderer).toContain("data-step-command=\"replay-step\"");
    expect(styles).toContain('.timeline-step.status-healed');
  });

  test('supports healing review, resizable panels, and non-blocking confirmation', () => {
    expect(renderer).toContain('healing-comparison');
    expect(renderer).toContain('persistHealedLocator');
    expect(html).toContain('id="panel-resize-handle"');
    expect(renderer).toContain("localStorage.setItem('chromation-panel-width'");
    expect(html).toContain('id="confirmation-sheet"');
    expect(renderer).not.toMatch(/\b(?:alert|confirm|prompt)\(/);
  });
});
