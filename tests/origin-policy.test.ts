import fs from 'fs';
import path from 'path';

describe('durable origin permission policy', () => {
  const root = process.cwd();
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'ui', 'renderer.js'), 'utf8');

  test('validates, restores, and atomically persists explicit origin grants', () => {
    expect(main).toContain("const originPermissionsPath = path.join(app.getPath('userData'), 'origin-permissions.json')");
    expect(main).toContain('const ALLOWED_GUEST_PERMISSIONS = new Set([');
    expect(main).toContain('hydrateOriginPermissions();');
    expect(main).toContain('writeJsonAtomicSync(originPermissionsPath');
    expect(main).toContain('assertTrustedRenderer(event);');
    expect(main).toContain('originPermissions.delete(normalizedOrigin)');
  });

  test('reports flattened permissions and validation-aware store recovery state', () => {
    expect(main).toContain('[...permissions].sort().map(permission => ({ origin, permission }))');
    expect(main).toContain("inspectJsonStore('originPermissions'");
    expect(main).toContain('restoreOrphanedRecordingBackups();');
    expect(renderer).toContain("store.recovered ? 'Recovered' : 'OK'");
    expect(renderer).toContain("Privacy mode ${diagnostics.privacyModeEnabled ? 'on' : 'off'}");
  });
});
