import type {
  AutomationDriver,
  CapabilityDescriptor,
  DriverCapabilities,
} from '../../automation/types';
import type { ExecutionOptions, ExecutionResult, ExecutionState, ExecutionStateSnapshot, StepExecutionResult } from '../../executor/types';
import type { RecordedAction } from '../../recorder/Recorder';
import { validateRecordedActions } from '../../recording/RecordingSchema';
import { AppiumClient } from './AppiumClient';
import { MobileHierarchy, MobileInspector } from '../../mobile/inspector/MobileHierarchy';
import type { InspectedElement } from '../../automation/types';
import {
  MobileAutomationContext,
  MobileHealingEngine,
  MobileLocatorFingerprint,
} from '../../mobile/healing/MobileHealingEngine';
import type { ActionType } from '../../recorder/Recorder';

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const SUPPORTED_ACTIONS = [
  'click', 'tap', 'input', 'clear', 'assert', 'wait', 'back', 'launchApp',
  'terminateApp', 'switchContext', 'hideKeyboard', 'rotate',
];

export interface AndroidDriverConfig {
  capabilities: Record<string, unknown>;
  serverUrl?: string;
}

export class AndroidAutomationDriver implements AutomationDriver {
  readonly id = 'appium-android';
  private state: ExecutionStateSnapshot = {
    state: 'idle', currentStep: -1, totalSteps: 0, updatedAt: Date.now(),
  };
  private controller: AbortController | null = null;
  private readonly inspector = new MobileInspector();
  private readonly mobileHealing = new MobileHealingEngine();

  constructor(
    private readonly config: AndroidDriverConfig,
    private readonly client = new AppiumClient(config.serverUrl)
  ) {}

  getCapabilities(): DriverCapabilities {
    return {
      platform: 'android',
      modes: ['native', 'hybrid', 'mobileWeb'],
      actions: [...SUPPORTED_ACTIONS],
      features: {
        inspection: true,
        recording: false,
        healing: true,
        contexts: true,
        deviceLogs: true,
      },
    };
  }

  getCapabilityDescriptors(): CapabilityDescriptor[] {
    return [
      { name: 'platformName', type: 'string', required: true, defaultValue: 'Android' },
      { name: 'appium:automationName', type: 'string', required: true, defaultValue: 'UiAutomator2' },
      { name: 'appium:deviceName', type: 'string', required: true },
      { name: 'appium:udid', type: 'string', description: 'ADB device serial used when multiple devices are connected' },
      { name: 'appium:app', type: 'string' },
      { name: 'appium:appPackage', type: 'string' },
      { name: 'appium:appActivity', type: 'string' },
    ];
  }

  async connect(signal?: AbortSignal): Promise<{
    sessionId: string;
    capabilities: Record<string, unknown>;
    context: string;
    contexts: string[];
    screen?: string;
    orientation?: string;
  }> {
    const existing = this.client.getSessionId();
    if (existing) return { sessionId: existing, capabilities: this.normalizedCapabilities(), ...(await this.liveState(signal)) };
    const session = await this.client.createSession(this.normalizedCapabilities(), signal);
    return { ...session, ...(await this.liveState(signal)) };
  }

  async disconnect(signal?: AbortSignal): Promise<void> {
    await this.client.deleteSession(signal);
  }

  isConnected(): boolean { return Boolean(this.client.getSessionId()); }

  async getLiveStatus(signal?: AbortSignal): Promise<{
    connected: boolean; sessionId: string | null; context?: string; contexts?: string[]; screen?: string; orientation?: string;
  }> {
    if (!this.isConnected()) return { connected: false, sessionId: null };
    return { connected: true, sessionId: this.client.getSessionId(), ...(await this.liveState(signal)) };
  }

  async executeLiveAction(action: RecordedAction, signal?: AbortSignal): Promise<void> {
    if (!this.isConnected()) throw new Error('No active Appium session');
    validateRecordedActions([action]);
    this.preflight([action]);
    await this.performAction(action, signal ?? new AbortController().signal);
  }

  async execute(actions: RecordedAction[], options?: ExecutionOptions): Promise<ExecutionResult> {
    validateRecordedActions(actions);
    this.preflight(actions);
    if (this.controller) throw new Error('An execution is already active');

    const startedAt = Date.now();
    const runId = `android-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const steps: StepExecutionResult[] = [];
    const controller = new AbortController();
    this.controller = controller;
    this.setState('starting', runId, -1, actions.length);
    let runError: string | undefined;

    try {
      await this.client.createSession(this.normalizedCapabilities(), controller.signal);
      this.setState('running', runId, -1, actions.length);
      for (let index = 0; index < actions.length; index++) {
        if (controller.signal.aborted) throw controller.signal.reason;
        this.setState('running', runId, index, actions.length);
        const action = actions[index];
        const stepStartedAt = Date.now();
        try {
          await this.performAction(action, controller.signal);
          const endedAt = Date.now();
          steps.push({ index, action, status: 'passed', startedAt: stepStartedAt, endedAt,
            durationMs: endedAt - stepStartedAt, retries: 0 });
        } catch (error) {
          const endedAt = Date.now();
          steps.push({ index, action, status: controller.signal.aborted ? 'cancelled' : 'failed',
            startedAt: stepStartedAt, endedAt, durationMs: endedAt - stepStartedAt, retries: 0,
            error: error instanceof Error ? error.message : String(error) });
          if (!options?.continueOnFailure || controller.signal.aborted) break;
        }
      }
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
    } finally {
      await this.client.deleteSession().catch(() => undefined);
      this.controller = null;
    }

    const endedAt = Date.now();
    const passed = steps.filter((step) => step.status === 'passed').length;
    const failed = steps.filter((step) => step.status === 'failed').length;
    const cancelled = steps.filter((step) => step.status === 'cancelled').length;
    const skipped = Math.max(0, actions.length - steps.length);
    const finalState: ExecutionState = cancelled > 0 ? 'cancelled' : failed > 0 || runError ? 'failed' : 'passed';
    this.setState(finalState, runId, steps.length - 1, actions.length, runError);
    return {
      runId, startedAt, endedAt, durationMs: endedAt - startedAt,
      status: finalState === 'passed' ? 'passed' : 'failed', runError,
      options: {
        continueOnFailure: options?.continueOnFailure ?? false,
        defaultStepTimeoutMs: options?.defaultStepTimeoutMs ?? 30_000,
        globalTimeoutMs: options?.globalTimeoutMs ?? 300_000,
      },
      steps,
      summary: { total: actions.length, passed, failed, skipped, cancelled, durationMs: endedAt - startedAt },
      consoleLogs: [], networkSummary: [], finalState, attachments: [],
    };
  }

  cancel(reason = 'Execution cancelled by user'): boolean {
    if (!this.controller) return false;
    this.controller.abort(new Error(reason));
    return true;
  }
  pause(): boolean { return false; }
  resume(): boolean { return false; }
  step(): boolean { return false; }
  getState(): ExecutionStateSnapshot { return { ...this.state }; }
  async close(): Promise<void> {
    this.cancel('Driver closed');
    await this.client.deleteSession().catch(() => undefined);
  }

  private async liveState(signal?: AbortSignal): Promise<{ context: string; contexts: string[]; screen?: string; orientation?: string }> {
    const [context, contexts, screen, orientation] = await Promise.all([
      this.client.command<string>('GET', '/context', undefined, signal).catch(() => 'NATIVE_APP'),
      this.client.command<string[]>('GET', '/contexts', undefined, signal).catch(() => ['NATIVE_APP']),
      this.client.command<string>('GET', '/appium/device/current_activity', undefined, signal).catch(() => undefined),
      this.client.command<string>('GET', '/orientation', undefined, signal).catch(() => undefined),
    ]);
    return { context, contexts, screen, orientation };
  }

  async getPageSource(signal?: AbortSignal): Promise<string> {
    return this.client.command<string>('GET', '/source', undefined, signal);
  }

  async takeScreenshot(signal?: AbortSignal): Promise<string> {
    return this.client.command<string>('GET', '/screenshot', undefined, signal);
  }

  async inspectHierarchy(signal?: AbortSignal): Promise<{
    hierarchy: MobileHierarchy;
    elements: InspectedElement[];
    screenshotBase64: string;
  }> {
    const [source, screenshotBase64] = await Promise.all([
      this.getPageSource(signal),
      this.takeScreenshot(signal),
    ]);
    return { ...this.inspector.inspect(source), screenshotBase64 };
  }

  captureMobileFingerprint(
    node: import('../../mobile/inspector/MobileHierarchy').MobileHierarchyNode,
    hierarchy: MobileHierarchy,
    context: MobileAutomationContext
  ): MobileLocatorFingerprint {
    return this.mobileHealing.captureFingerprint(node, hierarchy, context);
  }

  async proposeHealing(
    originalSelector: string,
    fingerprint: MobileLocatorFingerprint,
    context: MobileAutomationContext,
    actionType: ActionType,
    signal?: AbortSignal
  ) {
    const source = await this.getPageSource(signal);
    return this.mobileHealing.heal(originalSelector, fingerprint, source, context, actionType);
  }

  private preflight(actions: RecordedAction[]): void {
    const unsupported = [...new Set(actions.map((action) => action.type)
      .filter((type) => !SUPPORTED_ACTIONS.includes(type)))];
    if (unsupported.length > 0) {
      throw new Error(`Android driver does not support: ${unsupported.join(', ')}`);
    }
    const caps = this.normalizedCapabilities();
    if (!caps['appium:deviceName']) throw new Error('Android capability appium:deviceName is required');
  }

  private normalizedCapabilities(): Record<string, unknown> {
    return {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      ...this.config.capabilities,
    };
  }

  private async performAction(action: RecordedAction, signal: AbortSignal): Promise<void> {
    if (action.type === 'back') {
      await this.client.command('POST', '/back', {}, signal); return;
    }
    if (action.type === 'hideKeyboard') {
      await this.client.command('POST', '/appium/device/hide_keyboard', {}, signal); return;
    }
    if (action.type === 'rotate') {
      const orientation = String(action.value || 'PORTRAIT').toUpperCase();
      if (!['PORTRAIT', 'LANDSCAPE'].includes(orientation)) throw new Error(`Invalid orientation: ${orientation}`);
      await this.client.command('POST', '/orientation', { orientation }, signal); return;
    }
    if (action.type === 'switchContext') {
      await this.client.command('POST', '/context', { name: action.value }, signal); return;
    }
    if (action.type === 'launchApp') {
      await this.client.command('POST', '/appium/app/activate', { appId: action.value }, signal); return;
    }
    if (action.type === 'terminateApp') {
      await this.client.command('POST', '/appium/app/terminate', { appId: action.value }, signal); return;
    }
    if (action.type === 'wait') {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(action.value) || 0))); return;
    }

    const elementId = await this.findElement(action.selector, signal);
    const elementPath = `/element/${encodeURIComponent(elementId)}`;
    if (action.type === 'click' || action.type === 'tap') {
      await this.client.command('POST', `${elementPath}/click`, {}, signal); return;
    }
    if (action.type === 'clear') {
      await this.client.command('POST', `${elementPath}/clear`, {}, signal); return;
    }
    if (action.type === 'input') {
      await this.client.command('POST', `${elementPath}/value`, {
        text: action.value ?? '', value: [...(action.value ?? '')],
      }, signal); return;
    }
    if (action.type === 'assert') {
      const actual = await this.client.command<string>('GET', `${elementPath}/text`, undefined, signal);
      const expected = String(action.metadata?.expected ?? action.value ?? '');
      if (!actual.includes(expected)) throw new Error(`Expected element text to contain ${expected}; received ${actual}`);
    }
  }

  private async findElement(selector: string, signal: AbortSignal): Promise<string> {
    const match = /^(accessibility id|id|xpath|class name|-android uiautomator)=(.*)$/s.exec(selector);
    const using = match?.[1] ?? 'accessibility id';
    const value = match?.[2] ?? selector;
    const result = await this.client.command<Record<string, string>>(
      'POST', '/element', { using, value }, signal
    );
    const elementId = result[ELEMENT_KEY] ?? result.ELEMENT;
    if (!elementId) throw new Error(`Appium did not return an element for ${selector}`);
    return elementId;
  }

  private setState(
    state: ExecutionState, runId: string, currentStep: number, totalSteps: number, reason?: string
  ): void {
    this.state = { state, runId, currentStep, totalSteps, reason, updatedAt: Date.now() };
  }
}
