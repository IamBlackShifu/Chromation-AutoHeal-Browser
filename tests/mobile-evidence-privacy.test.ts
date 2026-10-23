import fs from 'fs';
import path from 'path';

describe('mobile evidence privacy', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');

  test('configures bounded device-pixel masks and automatically includes sensitive fields', () => {
    expect(html).toContain('id="mobile-evidence-mask-bounds"');
    expect(renderer).toContain('function normalizeMobileEvidenceMaskBounds(value)');
    expect(renderer).toContain('value.length > 50');
    expect(renderer).toContain('metadata.sensitive === true');
    expect(renderer).toContain('action?.locatorFingerprint?.boundingBox');
  });

  test('masks screenshots before report construction and fails closed', () => {
    expect(renderer).toContain('await applyMobileEvidenceMasks(execution);');
    expect(renderer).toContain("context.fillStyle = '#111827'");
    expect(renderer).toContain('context.fillRect(x, y, width, height)');
    expect(renderer).toContain('delete step.evidence.screenshotBase64');
    expect(renderer).toContain('Screenshot discarded because privacy masking failed');
  });
});
