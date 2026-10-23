import fs from 'fs';
import path from 'path';

describe('premium workspace UI refactor', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'ui/browser.html'), 'utf8');
  const styles = fs.readFileSync(path.join(process.cwd(), 'ui/styles.css'), 'utf8');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'ui/renderer.js'), 'utf8');
  const source = `${html}\n${styles}\n${renderer}`;

  test('uses a cohesive developer-focused design system and collapsible shell', () => {
    for (const marker of ['#6366f1', '#09090b', 'SF Pro Display', 'rail-collapse',
      'tool-rail.collapsed', 'status-pill', 'status-breathe', 'chromation-rail-collapsed']) {
      expect(source.toLowerCase()).toContain(marker.toLowerCase());
    }
  });

  test('renders KPI visualization and recording table affordances', () => {
    for (const marker of ['kpi-ring', '--kpi-progress', 'conic-gradient',
      'recording-status-tag', 'formatRelativeTime', 'home-replay-recording', 'home-delete-recording']) {
      expect(source).toContain(marker);
    }
  });

  test('uses a unified mobile toolbar and polished inspector states', () => {
    for (const marker of ['mobile-tool-button', 'mobile-refresh-hierarchy',
      'mobile-device-frame', 'mobile-inspector-tabs', 'text-overflow:ellipsis', 'Unknown screen']) {
      expect(source.replace(/\s/g, '')).toContain(marker.replace(/\s/g, ''));
    }
  });

  test('guides suite setup with cards, browser tags, and concurrency controls', () => {
    for (const marker of ['suite-step-card', 'browser-tag-picker', 'data-browser="chrome"',
      'matrix-concurrency-down', 'matrix-concurrency-up', 'syncBrowserTags']) {
      expect(source).toContain(marker);
    }
  });

  test('provides native-feeling Electron chrome and an active target address bar', () => {
    for (const marker of ['window-btn close-btn', 'window-maximized', '-webkit-app-region: drag',
      '-webkit-app-region: no-drag', '#ef4444', 'btn-clear-url', 'target-environment',
      'Web · Chrome', 'setTargetEnvironment', 'Android']) {
      expect(source.toLowerCase()).toContain(marker.toLowerCase());
    }
  });
});
