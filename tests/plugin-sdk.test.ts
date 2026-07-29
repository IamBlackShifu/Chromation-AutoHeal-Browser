import {
  CHROMATION_PLUGIN_API_VERSION,
  PluginBundle,
  PluginManager,
  validatePluginConfiguration,
  validatePluginManifest,
} from '../src/plugins/PluginSDK';

const bundle = (source: string, permissions: PluginBundle['manifest']['permissions'] = ['actions:register']): PluginBundle => ({
  manifest: {
    id: 'example.echo', name: 'Echo plugin', version: '1.0.0',
    apiVersion: CHROMATION_PLUGIN_API_VERSION, permissions,
    configuration: { prefix: { type: 'string', title: 'Prefix', default: 'echo' } },
  },
  source,
});

describe('Chromation plugin SDK', () => {
  test('validates manifests, API compatibility, permissions, and configuration', () => {
    expect(validatePluginManifest(bundle('function activate() {}').manifest).id).toBe('example.echo');
    expect(() => validatePluginManifest({ ...bundle('').manifest, apiVersion: '2.0.0' })).toThrow(/incompatible/);
    expect(() => validatePluginManifest({
      ...bundle('').manifest, permissions: ['filesystem:all' as never],
    })).toThrow(/unsupported permissions/);
    expect(validatePluginConfiguration(bundle('').manifest, { prefix: 'hello' })).toEqual({ prefix: 'hello' });
    expect(() => validatePluginConfiguration(bundle('').manifest, { unknown: true })).toThrow(/Unknown/);
  });

  test('requires explicit permission approval before activation', async () => {
    const manager = new PluginManager();
    manager.install(bundle('function activate() {}'));
    await expect(manager.enable('example.echo')).rejects.toThrow(/require approval/);
    manager.approvePermissions('example.echo', ['actions:register']);
    await expect(manager.enable('example.echo')).resolves.toMatchObject({ enabled: true });
  });

  test('registers and executes sandboxed actions with configuration and storage', async () => {
    const manager = new PluginManager();
    manager.install(bundle(`
      function activate(chromation) {
        chromation.actions.register({
          id: 'echo.action',
          label: 'Echo',
          execute(payload) {
            return { value: chromation.configuration.get().prefix + ':' + payload.value };
          }
        });
      }
    `), ['actions:register']);
    manager.configure('example.echo', { prefix: 'plugin' });
    await manager.enable('example.echo');
    expect(manager.listExtensions('action')).toEqual([
      expect.objectContaining({ id: 'echo.action', pluginId: 'example.echo' }),
    ]);
    await expect(manager.execute('action', 'echo.action', { value: 'ok' })).resolves.toEqual({ value: 'plugin:ok' });
  });

  test('isolates lifecycle failures and records plugin errors', async () => {
    const manager = new PluginManager();
    manager.install(bundle(`
      function activate(chromation) {
        chromation.lifecycle.on('run:start', () => { throw new Error('hook failure'); });
        chromation.actions.register({ id: 'safe.action', label: 'Safe', execute: () => true });
      }
    `, ['actions:register', 'runs:read']), ['actions:register', 'runs:read']);
    await manager.enable('example.echo');
    const outcomes = await manager.emit('run:start', { runId: 'run' });
    expect(outcomes[0].error).toBe('hook failure');
    expect(manager.list()[0]).toMatchObject({ enabled: true, lastError: 'hook failure' });
    await expect(manager.execute('action', 'safe.action', {})).resolves.toBe(true);
  });

  test('does not expose Node process or require and enforces execution timeouts', async () => {
    const manager = new PluginManager(undefined, 25);
    manager.install(bundle(`
      function activate(chromation) {
        if (typeof process !== 'undefined' || typeof require !== 'undefined') throw new Error('Node leaked');
        chromation.actions.register({
          id: 'slow.action', label: 'Slow',
          execute() { while (true) {} }
        });
      }
    `), ['actions:register']);
    await manager.enable('example.echo');
    await expect(manager.execute('action', 'slow.action', {})).rejects.toThrow(/timed out/);
  });

  test('disables and uninstalls plugins without leaving registered extensions', async () => {
    const manager = new PluginManager();
    manager.install(bundle(`
      function activate(chromation) {
        chromation.actions.register({ id: 'echo.action', label: 'Echo', execute: value => value });
      }
    `), ['actions:register']);
    await manager.enable('example.echo');
    await manager.disable('example.echo');
    expect(manager.listExtensions()).toEqual([]);
    expect(await manager.uninstall('example.echo')).toBe(true);
    expect(manager.list()).toEqual([]);
  });

  test('exports and restores approved enabled plugins without persisting secret configuration', async () => {
    const source = `
      function activate(chromation) {
        chromation.actions.register({ id: 'echo.action', label: 'Echo', execute: value => value });
      }
    `;
    const secureBundle = bundle(source);
    secureBundle.manifest.configuration = {
      prefix: { type: 'string', title: 'Prefix', default: 'echo' },
      token: { type: 'secret', title: 'Token', required: true },
    };
    const manager = new PluginManager();
    manager.install(secureBundle, ['actions:register']);
    manager.configure('example.echo', { prefix: 'saved', token: 'do-not-export' });
    await manager.enable('example.echo');
    const serialized = manager.export();
    expect(serialized).not.toContain('do-not-export');
    const restored = new PluginManager();
    await restored.import(serialized);
    expect(restored.list()[0]).toMatchObject({
      enabled: false,
      lastError: 'Required secret configuration must be entered again',
    });
  });
});
