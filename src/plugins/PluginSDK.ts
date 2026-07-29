import vm from 'vm';

export const CHROMATION_PLUGIN_API_VERSION = '1.0.0';
export type PluginPermission =
  | 'actions:register'
  | 'assertions:register'
  | 'exporters:register'
  | 'healing:register'
  | 'commands:register'
  | 'runs:read'
  | 'reports:read'
  | 'network:send'
  | 'storage:read'
  | 'storage:write';
export type PluginLifecycleEvent =
  | 'activate' | 'deactivate' | 'run:start' | 'run:complete'
  | 'step:start' | 'step:complete' | 'report:complete';
export type ExtensionPoint = 'action' | 'assertion' | 'exporter' | 'healing' | 'command';

const PERMISSIONS = new Set<PluginPermission>([
  'actions:register', 'assertions:register', 'exporters:register', 'healing:register',
  'commands:register', 'runs:read', 'reports:read', 'network:send', 'storage:read', 'storage:write',
]);
const EXTENSION_PERMISSION: Record<ExtensionPoint, PluginPermission> = {
  action: 'actions:register', assertion: 'assertions:register', exporter: 'exporters:register',
  healing: 'healing:register', command: 'commands:register',
};
function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description?: string;
  author?: string;
  permissions: PluginPermission[];
  entry?: string;
  configuration?: Record<string, PluginConfigurationField>;
}
export interface PluginConfigurationField {
  type: 'string' | 'number' | 'boolean' | 'secret';
  title: string;
  required?: boolean;
  default?: string | number | boolean;
}
export interface PluginBundle { manifest: PluginManifest; source: string; }
export interface PluginExtension {
  id: string;
  pluginId: string;
  type: ExtensionPoint;
  label: string;
  description?: string;
}
export interface PluginRecord {
  manifest: PluginManifest;
  enabled: boolean;
  approvedPermissions: PluginPermission[];
  installedAt: number;
  lastError?: string;
  extensions: PluginExtension[];
}
export interface PluginExecutionContext {
  run?: unknown;
  step?: unknown;
  report?: unknown;
  configuration?: Record<string, unknown>;
}

class SandboxedHandler {
  constructor(
    private readonly context: vm.Context,
    private readonly key: string,
    private readonly timeoutMs: number
  ) {}
  async invoke(payload: unknown, context: PluginExecutionContext): Promise<unknown> {
    this.context.__pluginPayload = this.clone(payload);
    this.context.__pluginExecutionContext = this.clone(context);
    try {
      const result = new vm.Script(
        `Promise.resolve(globalThis[${JSON.stringify(this.key)}](globalThis.__pluginPayload, globalThis.__pluginExecutionContext))`
      ).runInContext(this.context, { timeout: this.timeoutMs });
      return this.clone(await result);
    } finally {
      delete this.context.__pluginPayload;
      delete this.context.__pluginExecutionContext;
    }
  }
  private clone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
  }
}

class ExtensionRegistry {
  private extensions = new Map<string, { metadata: PluginExtension; handler: SandboxedHandler }>();
  register(metadata: PluginExtension, handler: SandboxedHandler): void {
    const key = `${metadata.type}:${metadata.id}`;
    if (this.extensions.has(key)) throw new Error(`Extension is already registered: ${key}`);
    this.extensions.set(key, { metadata, handler });
  }
  removePlugin(pluginId: string): void {
    for (const [key, value] of this.extensions) if (value.metadata.pluginId === pluginId) this.extensions.delete(key);
  }
  list(type?: ExtensionPoint): PluginExtension[] {
    return [...this.extensions.values()].map((item) => item.metadata)
      .filter((item) => !type || item.type === type)
      .map((item) => ({ ...item }));
  }
  async execute(type: ExtensionPoint, id: string, payload: unknown, context: PluginExecutionContext): Promise<unknown> {
    const extension = this.extensions.get(`${type}:${id}`);
    if (!extension) throw new Error(`Unknown ${type} extension: ${id}`);
    return extension.handler.invoke(payload, context);
  }
}

export class PluginManager {
  private plugins = new Map<string, {
    record: PluginRecord;
    bundle: PluginBundle;
    context?: vm.Context;
    lifecycle: Map<PluginLifecycleEvent, SandboxedHandler[]>;
    storage: Map<string, unknown>;
    configuration: Record<string, unknown>;
  }>();
  private registry = new ExtensionRegistry();
  constructor(
    private readonly apiVersion = CHROMATION_PLUGIN_API_VERSION,
    private readonly executionTimeoutMs = 2_000
  ) {}

  install(bundle: PluginBundle, approvedPermissions: PluginPermission[] = []): PluginRecord {
    const manifest = validatePluginManifest(bundle.manifest, this.apiVersion);
    if (this.plugins.has(manifest.id)) throw new Error(`Plugin is already installed: ${manifest.id}`);
    const approved = [...new Set(approvedPermissions)];
    const unrequested = approved.filter((permission) => !manifest.permissions.includes(permission));
    if (unrequested.length) throw new Error(`Cannot approve unrequested permissions: ${unrequested.join(', ')}`);
    const record: PluginRecord = {
      manifest, enabled: false, approvedPermissions: approved, installedAt: Date.now(), extensions: [],
    };
    this.plugins.set(manifest.id, {
      record, bundle: { manifest, source: bundle.source }, lifecycle: new Map(),
      storage: new Map(), configuration: this.defaultConfiguration(manifest), 
    });
    return this.clone(record);
  }

  approvePermissions(pluginId: string, permissions: PluginPermission[]): PluginRecord {
    const plugin = this.requirePlugin(pluginId);
    const invalid = permissions.filter((permission) => !plugin.record.manifest.permissions.includes(permission));
    if (invalid.length) throw new Error(`Plugin did not request: ${invalid.join(', ')}`);
    plugin.record.approvedPermissions = [...new Set(permissions)];
    return this.clone(plugin.record);
  }

  async enable(pluginId: string): Promise<PluginRecord> {
    const plugin = this.requirePlugin(pluginId);
    const missing = plugin.record.manifest.permissions.filter(
      (permission) => !plugin.record.approvedPermissions.includes(permission)
    );
    if (missing.length) throw new Error(`Plugin permissions require approval: ${missing.join(', ')}`);
    this.registry.removePlugin(pluginId);
    plugin.lifecycle.clear();
    try {
      plugin.context = this.createContext(pluginId);
      const wrapped = `'use strict';\n${plugin.bundle.source}\nif (typeof activate !== 'function') throw new Error('Plugin must define activate(chromation)');\nactivate(chromation);`;
      new vm.Script(wrapped, { filename: `${pluginId}/index.js` })
        .runInContext(plugin.context, { timeout: this.executionTimeoutMs });
      plugin.record.enabled = true;
      plugin.record.lastError = undefined;
      plugin.record.extensions = this.registry.list().filter((extension) => extension.pluginId === pluginId);
      await this.emitTo(pluginId, 'activate', {});
    } catch (error) {
      plugin.record.enabled = false;
      plugin.record.lastError = errorMessage(error);
      this.registry.removePlugin(pluginId);
      throw new Error(`Failed to activate plugin ${pluginId}: ${plugin.record.lastError}`);
    }
    return this.clone(plugin.record);
  }

  async disable(pluginId: string): Promise<PluginRecord> {
    const plugin = this.requirePlugin(pluginId);
    if (plugin.record.enabled) await this.emitTo(pluginId, 'deactivate', {});
    plugin.record.enabled = false;
    plugin.record.extensions = [];
    plugin.context = undefined;
    plugin.lifecycle.clear();
    this.registry.removePlugin(pluginId);
    return this.clone(plugin.record);
  }
  async uninstall(pluginId: string): Promise<boolean> {
    if (!this.plugins.has(pluginId)) return false;
    await this.disable(pluginId);
    this.plugins.delete(pluginId);
    return true;
  }
  list(): PluginRecord[] { return [...this.plugins.values()].map((plugin) => this.clone(plugin.record)); }
  export(): string {
    return JSON.stringify({
      version: 1,
      apiVersion: this.apiVersion,
      plugins: [...this.plugins.values()].map((plugin) => ({
        bundle: plugin.bundle,
        approvedPermissions: plugin.record.approvedPermissions,
        enabled: plugin.record.enabled,
        configuration: Object.fromEntries(Object.entries(plugin.configuration).filter(([key]) =>
          plugin.record.manifest.configuration?.[key]?.type !== 'secret'
        )),
        storage: Object.fromEntries(plugin.storage),
      })),
    }, null, 2);
  }
  async import(value: string): Promise<void> {
    const parsed = JSON.parse(value) as {
      version?: number;
      plugins?: Array<{
        bundle: PluginBundle;
        approvedPermissions: PluginPermission[];
        enabled?: boolean;
        configuration?: Record<string, unknown>;
        storage?: Record<string, unknown>;
      }>;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.plugins)) throw new Error('Unsupported plugin state document');
    for (const item of parsed.plugins) {
      if (this.plugins.has(item.bundle.manifest.id)) await this.uninstall(item.bundle.manifest.id);
      this.install(item.bundle, item.approvedPermissions);
      const plugin = this.requirePlugin(item.bundle.manifest.id);
      if (item.configuration) {
        for (const [key, configurationValue] of Object.entries(item.configuration)) {
          const field = plugin.record.manifest.configuration?.[key];
          if (!field || field.type === 'secret') throw new Error(`Invalid persisted configuration field: ${key}`);
          if (typeof configurationValue !== field.type) throw new Error(`${key} must be a ${field.type}`);
          plugin.configuration[key] = configurationValue;
        }
      }
      plugin.storage = new Map(Object.entries(item.storage ?? {}));
      const missingSecret = Object.entries(plugin.record.manifest.configuration ?? {}).some(
        ([key, field]) => field.type === 'secret' && field.required && plugin.configuration[key] === undefined
      );
      if (item.enabled && !missingSecret) await this.enable(item.bundle.manifest.id);
      else if (item.enabled && missingSecret) plugin.record.lastError = 'Required secret configuration must be entered again';
    }
  }
  listExtensions(type?: ExtensionPoint): PluginExtension[] { return this.registry.list(type); }
  configure(pluginId: string, configuration: Record<string, unknown>): void {
    const plugin = this.requirePlugin(pluginId);
    plugin.configuration = validatePluginConfiguration(plugin.record.manifest, configuration);
  }
  async execute(type: ExtensionPoint, id: string, payload: unknown, context: PluginExecutionContext = {}): Promise<unknown> {
    try { return await this.registry.execute(type, id, payload, context); }
    catch (error) {
      const extension = this.registry.list(type).find((item) => item.id === id);
      if (extension) this.requirePlugin(extension.pluginId).record.lastError = errorMessage(error);
      throw error;
    }
  }
  async emit(event: PluginLifecycleEvent, payload: unknown): Promise<Array<{ pluginId: string; error?: string }>> {
    return Promise.all([...this.plugins.entries()].filter(([, plugin]) => plugin.record.enabled)
      .map(async ([pluginId]) => {
        try { await this.emitTo(pluginId, event, payload); return { pluginId }; }
        catch (error) {
          const message = errorMessage(error);
          this.requirePlugin(pluginId).record.lastError = message;
          return { pluginId, error: message };
        }
      }));
  }

  private createContext(pluginId: string): vm.Context {
    const plugin = this.requirePlugin(pluginId);
    const context = vm.createContext({
      console: Object.freeze({
        log: (...values: unknown[]) => console.log(`[plugin:${pluginId}]`, ...values),
        warn: (...values: unknown[]) => console.warn(`[plugin:${pluginId}]`, ...values),
        error: (...values: unknown[]) => console.error(`[plugin:${pluginId}]`, ...values),
      }),
      setTimeout, clearTimeout,
    }, { name: `chromation-plugin:${pluginId}`, codeGeneration: { strings: false, wasm: false } });
    let handlerIndex = 0;
    const saveHandler = (handler: unknown): SandboxedHandler => {
      if (typeof handler !== 'function') throw new Error('Extension handler must be a function');
      const key = `__pluginHandler${handlerIndex++}`;
      (context as Record<string, unknown>)[key] = handler;
      return new SandboxedHandler(context, key, this.executionTimeoutMs);
    };
    const register = (type: ExtensionPoint, definition: Record<string, unknown>) => {
      this.requirePermission(plugin, EXTENSION_PERMISSION[type]);
      const id = String(definition.id ?? '');
      const label = String(definition.label ?? '');
      if (!/^[a-z][a-z0-9._-]{1,99}$/.test(id) || !label) throw new Error(`Invalid ${type} extension definition`);
      this.registry.register(
        { id, label, type, pluginId, description: definition.description ? String(definition.description) : undefined },
        saveHandler(definition.execute)
      );
    };
    const lifecycle = (event: PluginLifecycleEvent, handler: unknown) => {
      const allowed: PluginLifecycleEvent[] = [
        'activate', 'deactivate', 'run:start', 'run:complete', 'step:start', 'step:complete', 'report:complete',
      ];
      if (!allowed.includes(event)) throw new Error(`Unsupported lifecycle event: ${event}`);
      if (event.startsWith('run:') || event.startsWith('step:')) this.requirePermission(plugin, 'runs:read');
      if (event === 'report:complete') this.requirePermission(plugin, 'reports:read');
      plugin.lifecycle.set(event, [...(plugin.lifecycle.get(event) ?? []), saveHandler(handler)]);
    };
    const api = Object.freeze({
      apiVersion: this.apiVersion,
      actions: Object.freeze({ register: (definition: Record<string, unknown>) => register('action', definition) }),
      assertions: Object.freeze({ register: (definition: Record<string, unknown>) => register('assertion', definition) }),
      exporters: Object.freeze({ register: (definition: Record<string, unknown>) => register('exporter', definition) }),
      healing: Object.freeze({ register: (definition: Record<string, unknown>) => register('healing', definition) }),
      commands: Object.freeze({ register: (definition: Record<string, unknown>) => register('command', definition) }),
      lifecycle: Object.freeze({ on: lifecycle }),
      storage: Object.freeze({
        get: (key: string) => { this.requirePermission(plugin, 'storage:read'); return this.clone(plugin.storage.get(key)); },
        set: (key: string, value: unknown) => {
          this.requirePermission(plugin, 'storage:write');
          const encoded = JSON.stringify(value);
          if (encoded.length > 64 * 1024) throw new Error('Plugin storage value exceeds 64 KB');
          plugin.storage.set(key, this.clone(value));
        },
      }),
      configuration: Object.freeze({ get: () => this.clone(plugin.configuration) }),
    });
    (context as Record<string, unknown>).chromation = api;
    return context;
  }
  private async emitTo(pluginId: string, event: PluginLifecycleEvent, payload: unknown): Promise<void> {
    const plugin = this.requirePlugin(pluginId);
    for (const handler of plugin.lifecycle.get(event) ?? []) {
      await handler.invoke(payload, { configuration: plugin.configuration });
    }
  }
  private requirePermission(
    plugin: ReturnType<PluginManager['requirePlugin']>,
    permission: PluginPermission
  ): void {
    if (!plugin.record.approvedPermissions.includes(permission)) throw new Error(`Plugin permission denied: ${permission}`);
  }
  private requirePlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Unknown plugin: ${id}`);
    return plugin;
  }
  private defaultConfiguration(manifest: PluginManifest): Record<string, unknown> {
    return Object.fromEntries(Object.entries(manifest.configuration ?? {})
      .filter(([, field]) => field.default !== undefined).map(([key, field]) => [key, field.default]));
  }
  private clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T; }
}

export function validatePluginManifest(manifest: PluginManifest, hostApiVersion = CHROMATION_PLUGIN_API_VERSION): PluginManifest {
  const issues: string[] = [];
  if (!/^[a-z][a-z0-9.-]{2,99}$/.test(manifest?.id ?? '')) issues.push('id is invalid');
  if (!manifest?.name?.trim() || manifest.name.length > 100) issues.push('name is required and must not exceed 100 characters');
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.version ?? '')) issues.push('version must use semantic versioning');
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.apiVersion ?? '')) issues.push('apiVersion must use semantic versioning');
  else if (manifest.apiVersion.split('.')[0] !== hostApiVersion.split('.')[0]) issues.push(`apiVersion ${manifest.apiVersion} is incompatible with ${hostApiVersion}`);
  if (!Array.isArray(manifest?.permissions)) issues.push('permissions must be an array');
  else {
    const invalid = manifest.permissions.filter((permission) => !PERMISSIONS.has(permission));
    if (invalid.length) issues.push(`unsupported permissions: ${invalid.join(', ')}`);
  }
  if (issues.length) throw new Error(`Invalid plugin manifest: ${issues.join('; ')}`);
  return JSON.parse(JSON.stringify({ ...manifest, permissions: [...new Set(manifest.permissions)] })) as PluginManifest;
}

export function validatePluginConfiguration(
  manifest: PluginManifest,
  values: Record<string, unknown>
): Record<string, unknown> {
  const schema = manifest.configuration ?? {};
  const unknown = Object.keys(values).filter((key) => !(key in schema));
  if (unknown.length) throw new Error(`Unknown plugin configuration: ${unknown.join(', ')}`);
  const output: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    const value = values[key] ?? field.default;
    if (field.required && (value === undefined || value === '')) throw new Error(`${key} is required`);
    if (value !== undefined && field.type !== 'secret' && typeof value !== field.type) {
      throw new Error(`${key} must be a ${field.type}`);
    }
    if (value !== undefined && field.type === 'secret' && typeof value !== 'string') throw new Error(`${key} must be a string`);
    if (value !== undefined) output[key] = value;
  }
  return output;
}
