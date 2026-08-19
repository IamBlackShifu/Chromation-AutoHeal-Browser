import fs from 'fs';
import path from 'path';

describe('renderer module foundations', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');
  const target = fs.readFileSync(path.join(root, 'ui', 'modules', 'target-environment.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'ui', 'modules', 'runtime.js'), 'utf8');
  const devices = fs.readFileSync(path.join(root, 'ui', 'modules', 'connected-device-picker.js'), 'utf8');

  it('loads a self-contained target environment custom element before the legacy controller', () => {
    expect(html).toContain('<chromation-target-environment');
    expect(html.indexOf('modules/target-environment.js')).toBeLessThan(html.indexOf('renderer.js'));
    expect(target).toContain("customElements.define('chromation-target-environment'");
    expect(target).toContain('setTarget(platform');
    expect(target).toContain('aria-live');
    expect(renderer).toContain("typeof badge.setTarget === 'function'");
  });

  it('mounts feature modules with isolated lifecycle and cleanup', () => {
    expect(html.indexOf('modules/runtime.js')).toBeLessThan(html.indexOf('modules/connected-device-picker.js'));
    expect(runtime).toContain('register(name, factory)');
    expect(runtime).toContain('previous?.dispose?.()');
    expect(runtime).toContain('unmount(element)');
    expect(devices).toContain("register('connected-device-picker'");
    expect(devices).toContain('chromation-device-selected');
    expect(devices).toContain("invoke('mobile-list-devices')");
    expect(devices).toContain('dispose()');
    expect(renderer).toContain("ChromationUI.mount('connected-device-picker'");
  });
});
