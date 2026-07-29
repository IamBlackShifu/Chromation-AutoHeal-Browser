import { RecordedAction } from '../recorder/Recorder';
import { validateRecordedActions } from '../recording/RecordingSchema';

export type HookName = 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll';
export interface EnvironmentProfile { name: string; baseUrl?: string; values: Record<string, string>; }
export interface TestProjectDocument {
  variables: Record<string, string>;
  environments: EnvironmentProfile[];
  flows: Record<string, RecordedAction[]>;
  hooks: Partial<Record<HookName, RecordedAction[]>>;
}
export interface TestPlan {
  actions: RecordedAction[];
  environment?: string;
  variables?: Record<string, string>;
  useFlows?: string[];
}
export interface ResolvedTestPlan {
  beforeAll: RecordedAction[];
  beforeEach: RecordedAction[];
  actions: RecordedAction[];
  afterEach: RecordedAction[];
  afterAll: RecordedAction[];
  baseUrl?: string;
  bindings: Record<string, string>;
}

const TEMPLATE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;

export class TestProject {
  private document: TestProjectDocument = { variables: {}, environments: [], flows: {}, hooks: {} };

  setVariable(name: string, value: string): void {
    this.assertName(name);
    this.document.variables[name] = String(value);
  }
  removeVariable(name: string): boolean { return delete this.document.variables[name]; }
  setEnvironment(profile: EnvironmentProfile): void {
    this.assertName(profile.name);
    const normalized = { name: profile.name, baseUrl: profile.baseUrl, values: { ...profile.values } };
    const index = this.document.environments.findIndex((item) => item.name === profile.name);
    if (index >= 0) this.document.environments[index] = normalized;
    else this.document.environments.push(normalized);
  }
  setFlow(name: string, actions: RecordedAction[]): void {
    this.assertName(name);
    this.document.flows[name] = validateRecordedActions(actions);
  }
  setHook(name: HookName, actions: RecordedAction[]): void {
    this.document.hooks[name] = validateRecordedActions(actions);
  }
  resolve(plan: TestPlan): ResolvedTestPlan {
    const environment = plan.environment
      ? this.document.environments.find((profile) => profile.name === plan.environment)
      : undefined;
    if (plan.environment && !environment) throw new Error(`Unknown environment profile: ${plan.environment}`);
    const bindings = { ...this.document.variables, ...(environment?.values ?? {}), ...(plan.variables ?? {}) };
    const flowActions = (plan.useFlows ?? []).flatMap((name) => {
      const flow = this.document.flows[name];
      if (!flow) throw new Error(`Unknown reusable flow: ${name}`);
      return flow;
    });
    const resolveActions = (actions: RecordedAction[] = []) =>
      validateRecordedActions(actions).map((action) => this.resolveAction(action, bindings, environment?.baseUrl));
    return {
      beforeAll: resolveActions(this.document.hooks.beforeAll),
      beforeEach: resolveActions(this.document.hooks.beforeEach),
      actions: resolveActions([...flowActions, ...plan.actions]),
      afterEach: resolveActions(this.document.hooks.afterEach),
      afterAll: resolveActions(this.document.hooks.afterAll),
      baseUrl: environment?.baseUrl,
      bindings,
    };
  }
  export(): TestProjectDocument {
    return JSON.parse(JSON.stringify(this.document)) as TestProjectDocument;
  }
  import(document: TestProjectDocument): void {
    const next = new TestProject();
    Object.entries(document.variables ?? {}).forEach(([name, value]) => next.setVariable(name, value));
    (document.environments ?? []).forEach((profile) => next.setEnvironment(profile));
    Object.entries(document.flows ?? {}).forEach(([name, actions]) => next.setFlow(name, actions));
    Object.entries(document.hooks ?? {}).forEach(([name, actions]) => next.setHook(name as HookName, actions));
    this.document = next.document;
  }
  private resolveAction(action: RecordedAction, bindings: Record<string, string>, baseUrl?: string): RecordedAction {
    const resolve = (value?: string) => value?.replace(TEMPLATE_PATTERN, (_match, name: string) => {
      if (!(name in bindings)) throw new Error(`Missing test-data binding: ${name}`);
      return bindings[name];
    });
    const value = resolve(action.value);
    return {
      ...action,
      selector: resolve(action.selector) ?? action.selector,
      value: action.type === 'navigate' && value && baseUrl && value.startsWith('/')
        ? new URL(value, baseUrl).toString() : value,
      extra: resolve(action.extra),
      metadata: action.metadata ? Object.fromEntries(Object.entries(action.metadata).map(([key, entry]) => [
        key, typeof entry === 'string' ? resolve(entry) : entry,
      ])) : undefined,
    };
  }
  private assertName(name: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/.test(name)) throw new Error(`Invalid project item name: ${name}`);
  }
}
