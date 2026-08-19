import type {
  AutomationDriver,
  CapabilityDescriptor,
  DriverCapabilities,
} from '../../automation/types';
import type { ExecutionOptions, ExecutionResult, ExecutionState, ExecutionStateSnapshot, StepExecutionResult } from '../../executor/types';
import type { RecordedAction } from '../../recorder/Recorder';
import { validateRecordedActions } from '../../recording/RecordingSchema';
import { AppiumClient, AppiumProtocolError } from './AppiumClient';
import { MobileHierarchy, MobileInspector } from '../../mobile/inspector/MobileHierarchy';
import type { InspectedElement } from '../../automation/types';
import {
  MobileAutomationContext,
  MobileHealingEngine,
  MobileLocatorFingerprint,
} from '../../mobile/healing/MobileHealingEngine';
import type { ActionType } from '../../recorder/Recorder';
import type { HealingResult } from '../../healing/HealingEngine';
import type { HealingApprovalPolicy } from '../../healing/HealingEngine';
import fs from 'fs';
import path from 'path';
import { AndroidDeviceCommands } from './AndroidDeviceCommands';

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const SUPPORTED_ACTIONS = [
  'click', 'tap', 'doubleclick', 'input', 'clear', 'assert', 'wait', 'back', 'launchApp',
  'terminateApp', 'switchContext', 'hideKeyboard', 'rotate',
  'longPress', 'swipe', 'scroll', 'deepLink', 'acceptAlert', 'dismissAlert',
  'grantPermission', 'revokePermission', 'resetApp',
  'installApp',
  'upload',
  'clearAppData', 'mobileKey',
];

export interface AndroidDriverConfig {
  capabilities: Record<string, unknown>;
  serverUrl?: string;
  deviceCommands?: AndroidDeviceCommands;
}

export class AndroidAutomationDriver implements AutomationDriver {
  readonly id = 'appium-android';
  private state: ExecutionStateSnapshot = {
    state: 'idle', currentStep: -1, totalSteps: 0, updatedAt: Date.now(),
  };
  private controller: AbortController | null = null;
  private readonly inspector = new MobileInspector();
  private readonly mobileHealing = new MobileHealingEngine();
  private readonly deviceCommands: AndroidDeviceCommands;

  constructor(
    private readonly config: AndroidDriverConfig,
    private readonly client = new AppiumClient(config.serverUrl)
  ) { this.deviceCommands = config.deviceCommands ?? new AndroidDeviceCommands(); }

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
      { name: 'appium:systemPort', type: 'number', description: 'Unique UiAutomator2 port for concurrent sessions' },
      { name: 'appium:chromedriverPort', type: 'number', description: 'Unique Chromedriver port for concurrent WebViews' },
      { name: 'appium:mjpegServerPort', type: 'number', description: 'Unique MJPEG stream port' },
      { name: 'appium:chromedriverAutodownload', type: 'boolean', defaultValue: false, description: 'Allow Appium to match a compatible Chromedriver' },
      { name: 'appium:chromedriverExecutable', type: 'string', description: 'Pinned Chromedriver for controlled/offline environments' },
    ];
  }

  async connect(signal?: AbortSignal): Promise<{
    sessionId: string;
    capabilities: Record<string, unknown>;
    context: string;
    contexts: string[];
    screen?: string;
    orientation?: string; keyboardShown?: boolean;
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
    connected: boolean; sessionId: string | null; context?: string; contexts?: string[]; screen?: string; orientation?: string; keyboardShown?: boolean;
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
    const globalTimeoutMs = options?.globalTimeoutMs ?? 300_000;
    const globalTimer = setTimeout(() => controller.abort(new Error(`Android run timed out after ${globalTimeoutMs}ms`)), globalTimeoutMs);
    this.controller = controller;
    this.setState('starting', runId, -1, actions.length);
    let runError: string | undefined;
    const ownsSession = !this.isConnected();
    const attachments: NonNullable<ExecutionResult['attachments']> = [];
    const consoleLogs: string[] = [];
    const contextTransitions: Array<{ step: number; before?: string; after?: string }> = [];

    try {
      if (ownsSession) await this.client.createSession(this.normalizedCapabilities(), controller.signal);
      attachments.push({ name: 'android-capabilities.json', contentType: 'application/json',
        data: JSON.stringify(this.normalizedCapabilities(), null, 2) });
      this.setState('running', runId, -1, actions.length);
      for (let index = 0; index < actions.length; index++) {
        if (controller.signal.aborted) throw controller.signal.reason;
        this.setState('running', runId, index, actions.length);
        const action = actions[index];
        const stepStartedAt = Date.now();
        let healing: HealingResult | undefined;
        try {
          const beforeContext = await this.client.command<string>('GET', '/context', undefined, controller.signal).catch(() => undefined);
          const metadata = action.metadata as Record<string, unknown> | undefined;
          const timeoutMs = Number(metadata?.timeoutMs) || options?.defaultStepTimeoutMs || 30_000;
          const maxRetries = Number(metadata?.maxRetries) || 0;
          let retries = 0;
          let completed = false;
          while (!completed) {
            try {
              await this.withTimeout(this.performAction(action, controller.signal), timeoutMs, controller.signal);
              completed = true;
            } catch (error) {
              if (ownsSession && !this.isConnected() && retries < maxRetries) {
                await this.client.createSession(this.normalizedCapabilities(), controller.signal);
              }
              const fingerprint = action.locatorFingerprint as MobileLocatorFingerprint | undefined;
              if (fingerprint?.mobileContext && !healing) {
                const status = await this.liveState(controller.signal);
                healing = await this.proposeHealing(action.selector, fingerprint, {
                  ...fingerprint.mobileContext, contextName: status.context,
                  screen: status.screen, orientation: status.orientation as MobileAutomationContext['orientation'],
                }, action.type, controller.signal) ?? undefined;
                if (healing?.applied) {
                  await this.withTimeout(this.performAction({ ...action, selector: healing.healedSelector }, controller.signal), timeoutMs, controller.signal);
                  completed = true;
                  continue;
                }
              }
              if (retries >= maxRetries || controller.signal.aborted) throw error;
              retries++;
              await this.delay(Number(metadata?.retryDelayMs) || 250, controller.signal);
            }
          }
          const endedAt = Date.now();
          if (action.type === 'launchApp') {
            const appId = String(action.value || this.config.capabilities['appium:appPackage'] || 'unknown');
            const activity = String((action.metadata as Record<string, unknown> | undefined)?.appActivity || this.config.capabilities['appium:appActivity'] || 'default activity');
            consoleLogs.push(`[Replay Engine] Launching target app: ${appId} / ${activity}... Success (took ${endedAt - stepStartedAt}ms)`);
          }
          const screenshotBase64 = await this.takeScreenshot(controller.signal).catch(() => undefined);
          const afterContext = await this.client.command<string>('GET', '/context', undefined, controller.signal).catch(() => undefined);
          if (beforeContext !== afterContext || action.type === 'switchContext') contextTransitions.push({ step: index, before: beforeContext, after: afterContext });
          steps.push({ index, action, status: 'passed', startedAt: stepStartedAt, endedAt,
            durationMs: endedAt - stepStartedAt, retries,
            evidence: screenshotBase64 ? { screenshotBase64 } : undefined, healing });
        } catch (error) {
          const endedAt = Date.now();
          const screenshotBase64 = await this.takeScreenshot().catch(() => undefined);
          steps.push({ index, action, status: controller.signal.aborted ? 'cancelled' : 'failed',
            startedAt: stepStartedAt, endedAt, durationMs: endedAt - stepStartedAt, retries: 0,
            error: error instanceof Error ? error.message : String(error),
            evidence: screenshotBase64 ? { screenshotBase64 } : undefined, healing });
          if (!options?.continueOnFailure || controller.signal.aborted) break;
        }
      }
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
    } finally {
      const source = this.isConnected() ? await this.getPageSource().catch(() => undefined) : undefined;
      if (source) attachments.push({ name: 'android-final-hierarchy.xml', contentType: 'application/xml', data: source });
      if (contextTransitions.length) attachments.push({ name: 'android-context-transitions.json', contentType: 'application/json', data: JSON.stringify(contextTransitions, null, 2) });
      const logs = this.isConnected() ? await this.getDeviceLogs().catch(() => undefined) : undefined;
      if (logs?.length) attachments.push({ name: 'android-logcat.json', contentType: 'application/json', data: JSON.stringify(logs, null, 2) });
      if (ownsSession) await this.client.deleteSession().catch(() => undefined);
      clearTimeout(globalTimer);
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
      consoleLogs, networkSummary: [], finalState, attachments,
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

  private async liveState(signal?: AbortSignal): Promise<{ context: string; contexts: string[]; screen?: string; orientation?: string; keyboardShown?: boolean }> {
    const [context, contexts, screen, orientation, keyboardShown] = await Promise.all([
      Promise.resolve(this.client.command<string>('GET', '/context', undefined, signal)).catch(() => 'NATIVE_APP'),
      Promise.resolve(this.client.command<string[]>('GET', '/contexts', undefined, signal)).catch(() => ['NATIVE_APP']),
      Promise.resolve(this.client.command<string>('GET', '/appium/device/current_activity', undefined, signal)).catch(() => undefined),
      Promise.resolve(this.client.command<string>('GET', '/orientation', undefined, signal)).catch(() => undefined),
      Promise.resolve(this.client.command<boolean>('GET', '/appium/device/is_keyboard_shown', undefined, signal)).catch(() => undefined),
    ]);
    return { context, contexts, screen, orientation, keyboardShown };
  }

  async getPageSource(signal?: AbortSignal): Promise<string> {
    return this.client.command<string>('GET', '/source', undefined, signal);
  }

  async takeScreenshot(signal?: AbortSignal): Promise<string> {
    return this.client.command<string>('GET', '/screenshot', undefined, signal);
  }

  async getDeviceLogs(signal?: AbortSignal): Promise<unknown[]> {
    return this.client.command<unknown[]>('POST', '/log', { type: 'logcat' }, signal);
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

  setHealingApprovalPolicy(policy: HealingApprovalPolicy): void { this.mobileHealing.setApprovalPolicy(policy); }
  getHealingHistory(): HealingResult[] { return this.mobileHealing.getHistory(); }

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
    const metadata = (action.metadata ?? {}) as Record<string, unknown>;
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
      await this.switchContextWithWait(String(action.value || 'WEBVIEW'), Number(metadata.timeoutMs) || 20_000, signal); return;
    }
    if (action.type === 'launchApp') {
      await this.launchTargetApp(action, signal); return;
    }
    if (action.type === 'terminateApp') {
      await this.appLifecycleCommand('terminate', String(action.value || ''), signal); return;
    }
    if (action.type === 'resetApp') {
      const appId = String(action.value || this.config.capabilities['appium:appPackage'] || '');
      if (!appId) throw new Error('Reset app requires an app ID');
      await this.appLifecycleCommand('terminate', appId, signal);
      await this.appLifecycleCommand('activate', appId, signal); return;
    }
    if (action.type === 'clearAppData') {
      const serial = String(metadata.serial || this.config.capabilities['appium:udid'] || '');
      const appPackage = String(action.value || this.config.capabilities['appium:appPackage'] || '');
      if (!serial) throw new Error('Clear app data requires an explicit device serial');
      await this.deviceCommands.clearAppData({ serial, appPackage, confirmed: metadata.confirmed === true }, signal);
      if (metadata.relaunch === true) await this.appLifecycleCommand('activate', appPackage, signal);
      return;
    }
    if (action.type === 'mobileKey') {
      const key = String(action.value || '').toLowerCase();
      const codes: Record<string, number> = { home: 3, recent: 187, app_switch: 187, enter: 66, search: 84, go: 66, volume_up: 24, volume_down: 25 };
      if (!(key in codes)) throw new Error(`Unsupported Android mobile key: ${key}`);
      try {
        await this.client.command('POST', '/execute/sync', { script: 'mobile: pressKey', args: [{ keycode: codes[key] }] }, signal);
      } catch (error) {
        if (!(error instanceof AppiumProtocolError) || ![404, 405, 501].includes(error.status)) throw error;
        await this.client.command('POST', '/appium/device/press_keycode', { keycode: codes[key] }, signal);
      }
      return;
    }
    if (action.type === 'installApp') {
      const appPath = String(action.value || '');
      if (!appPath) throw new Error('Install app requires an APK path accessible to the Appium server');
      await this.client.command('POST', '/appium/device/install_app', { appPath }, signal); return;
    }
    if (action.type === 'deepLink') {
      const url = String(action.value || '');
      const packageName = String(metadata.package || this.config.capabilities['appium:appPackage'] || '');
      if (!url || !packageName) throw new Error('Deep link requires a URL and Android package');
      await this.client.command('POST', '/execute/sync', { script: 'mobile: deepLink', args: [{ url, package: packageName }] }, signal); return;
    }
    if (action.type === 'acceptAlert' || action.type === 'dismissAlert') {
      await this.client.command('POST', `/alert/${action.type === 'acceptAlert' ? 'accept' : 'dismiss'}`, {}, signal); return;
    }
    if (action.type === 'grantPermission' || action.type === 'revokePermission') {
      const appPackage = String(metadata.package || this.config.capabilities['appium:appPackage'] || '');
      const permission = String(action.value || '');
      if (!appPackage || !permission) throw new Error('Permission action requires an app package and permission');
      await this.client.command('POST', '/execute/sync', {
        script: `mobile: ${action.type === 'grantPermission' ? 'changePermissions' : 'changePermissions'}`,
        args: [{ action: action.type === 'grantPermission' ? 'grant' : 'revoke', appPackage, permissions: [permission] }],
      }, signal); return;
    }
    if (action.type === 'swipe' || action.type === 'scroll') {
      const startX = Number(metadata.startX ?? metadata.x ?? 0);
      const startY = Number(metadata.startY ?? metadata.y ?? 0);
      const endX = Number(metadata.endX ?? startX);
      const endY = Number(metadata.endY ?? startY);
      const duration = Math.max(100, Number(metadata.durationMs) || 500);
      if (![startX, startY, endX, endY].every(Number.isFinite)) throw new Error('Gesture coordinates must be finite numbers');
      await this.pointerGesture(startX, startY, endX, endY, duration, signal); return;
    }
    if (action.type === 'wait') {
      if (metadata.waitKind === 'element') {
        const deadline = Date.now() + (Number(metadata.timeoutMs) || 10_000);
        while (Date.now() < deadline) {
          try { await this.findElement(action.selector, signal); return; }
          catch { await this.delay(200, signal); }
        }
        throw new Error(`Timed out waiting for mobile element ${action.selector}`);
      }
      await this.delay(Math.max(0, Number(action.value) || 0), signal); return;
    }
    if (action.type === 'upload') {
      const file = Array.isArray(metadata.files) ? String(metadata.files[0] || '') : String(action.value || '');
      if (!file || !fs.existsSync(file)) throw new Error('Mobile upload file does not exist');
      const remotePath = String(metadata.remotePath || `/sdcard/Download/${path.basename(file)}`);
      await this.client.command('POST', '/appium/device/push_file', { path: remotePath, data: fs.readFileSync(file).toString('base64') }, signal); return;
    }

    const coordinateMatch = action.type === 'tap' && /^coordinates=(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(action.selector);
    if (coordinateMatch) {
      const x = Math.round(Number(coordinateMatch[1]));
      const y = Math.round(Number(coordinateMatch[2]));
      await this.client.command('POST', '/actions', { actions: [{
        type: 'pointer', id: 'chromation-screenshot-pointer', parameters: { pointerType: 'touch' }, actions: [
          { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      }] }, signal);
      return;
    }

    const elementId = await this.findElement(action.selector, signal);
    const elementPath = `/element/${encodeURIComponent(elementId)}`;
    if (action.type === 'click' || action.type === 'tap') {
      await this.client.command('POST', `${elementPath}/click`, {}, signal); return;
    }
    if (action.type === 'doubleclick') {
      await this.client.command('POST', '/execute/sync', {
        script: 'mobile: doubleClickGesture', args: [{ elementId }],
      }, signal); return;
    }
    if (action.type === 'longPress') {
      const duration = Math.max(300, Number(metadata.durationMs) || 800);
      await this.client.command('POST', '/actions', { actions: [{
        type: 'pointer', id: 'chromation-long-press', parameters: { pointerType: 'touch' }, actions: [
          { type: 'pointerMove', duration: 0, origin: { [ELEMENT_KEY]: elementId }, x: 0, y: 0 },
          { type: 'pointerDown', button: 0 }, { type: 'pause', duration }, { type: 'pointerUp', button: 0 },
        ],
      }] }, signal); return;
    }
    if (action.type === 'clear') {
      await this.client.command('POST', `${elementPath}/clear`, {}, signal); return;
    }
    if (action.type === 'input') {
      if (metadata.clearFirst === true) await this.client.command('POST', `${elementPath}/clear`, {}, signal);
      await this.client.command('POST', `${elementPath}/value`, {
        text: action.value ?? '', value: [...(action.value ?? '')],
      }, signal); return;
    }
    if (action.type === 'assert') {
      const kind = String(metadata.kind || 'text-contains');
      if (kind === 'visible') {
        const visible = await this.client.command<boolean>('GET', `${elementPath}/displayed`, undefined, signal);
        if (!visible) throw new Error('Expected element to be visible');
        return;
      }
      if (kind === 'enabled') {
        const enabled = await this.client.command<boolean>('GET', `${elementPath}/enabled`, undefined, signal);
        if (!enabled) throw new Error('Expected element to be enabled');
        return;
      }
      const actual = kind === 'value-equals'
        ? await this.client.command<string>('GET', `${elementPath}/attribute/value`, undefined, signal)
        : await this.client.command<string>('GET', `${elementPath}/text`, undefined, signal);
      const expected = String(action.metadata?.expected ?? action.value ?? '');
      const matches = kind === 'value-equals' ? actual === expected : actual.includes(expected);
      if (!matches) throw new Error(`Expected element ${kind} ${expected}; received ${actual}`);
    }
  }

  private async pointerGesture(startX: number, startY: number, endX: number, endY: number, duration: number, signal: AbortSignal): Promise<void> {
    await this.client.command('POST', '/actions', { actions: [{
      type: 'pointer', id: 'chromation-gesture', parameters: { pointerType: 'touch' }, actions: [
        { type: 'pointerMove', duration: 0, x: Math.round(startX), y: Math.round(startY), origin: 'viewport' },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration, x: Math.round(endX), y: Math.round(endY), origin: 'viewport' },
        { type: 'pointerUp', button: 0 },
      ],
    }] }, signal);
  }

  private async appLifecycleCommand(operation: 'activate' | 'terminate', appId: string, signal: AbortSignal): Promise<void> {
    if (!appId) throw new Error(`Application ID is required to ${operation} an app`);
    const w3cPath = `/appium/device/${operation}_app`;
    try {
      await this.client.command('POST', w3cPath, { appId }, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/not found|unsupported|unknown command|method.*not supported/i.test(message)) throw error;
      await this.client.command('POST', `/appium/app/${operation}`, { appId }, signal);
    }
  }

  private async launchTargetApp(action: RecordedAction, signal: AbortSignal): Promise<void> {
    const metadata = (action.metadata || {}) as Record<string, unknown>;
    const appId = String(action.value || this.config.capabilities['appium:appPackage'] || '');
    const appActivity = String(metadata.appActivity || this.config.capabilities['appium:appActivity'] || '');
    if (!appId) throw new Error('Application ID is required to launch the replay target');
    if (metadata.resetAppState === true) {
      const serial = String(metadata.serial || this.config.capabilities['appium:udid'] || '');
      if (!serial) throw new Error('Reset App State requires an explicit Android device serial');
      await this.deviceCommands.clearAppData({ serial, appPackage: appId, confirmed: true }, signal);
    }
    if (!appActivity) {
      await this.appLifecycleCommand('activate', appId, signal); return;
    }
    try {
      await this.client.command('POST', '/execute/sync', { script: 'mobile: startActivity', args: [{
        intent: `${appId}/${appActivity}`, wait: true, stop: true,
      }] }, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/not found|unsupported|unknown command|method.*not supported/i.test(message)) throw error;
      await this.appLifecycleCommand('activate', appId, signal);
    }
  }

  private async switchContextWithWait(requested: string, timeoutMs: number, signal: AbortSignal): Promise<void> {
    if (requested.toUpperCase() !== 'WEBVIEW') {
      await this.client.command('POST', '/context', { name: requested }, signal);
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const wantsWebView = requested.toUpperCase() === 'WEBVIEW' || requested.toUpperCase().startsWith('WEBVIEW_');
    let observed: string[] = [];
    while (Date.now() < deadline) {
      if (signal.aborted) throw signal.reason;
      const contexts = await this.client.command<string[]>('GET', '/contexts', undefined, signal).catch(() => []);
      observed = Array.isArray(contexts) ? contexts : [];
      const target = wantsWebView
        ? observed.find((context) => requested.toUpperCase() === 'WEBVIEW' ? context.startsWith('WEBVIEW') : context === requested)
        : observed.find((context) => context === requested);
      if (target) {
        await this.client.command('POST', '/context', { name: target }, signal);
        return;
      }
      await this.delay(250, signal);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for context ${requested}; observed: ${observed.join(', ') || 'none'}`);
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw signal.reason;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`Android step timed out after ${timeoutMs}ms`)), timeoutMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
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
