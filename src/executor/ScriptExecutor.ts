import { Browser, BrowserContext, BrowserType, Locator, Page, chromium } from 'playwright-core';
import { promises as fs } from 'fs';
import path from 'path';
import {
  AdvancedPageTesting, ApiStep, NetworkMock, PerformanceBudgets, VisualRegressionService,
} from '../advanced/AdvancedTesting';
import { ActionType, RecordedAction } from '../recorder/Recorder';
import { HealingEngine, HealingResult } from '../healing/HealingEngine';
import { validateRecordedActions } from '../recording/RecordingSchema';
import { redactDOMSnapshot, redactText, redactURL } from '../recording/Security';
import {
  AssertionPayload,
  EvidencePolicy,
  ExecutionOptions,
  ExecutionResult,
  ExecutionState,
  ExecutionStateSnapshot,
  NetworkEntry,
  RetryPolicy,
  StepExecutionPolicy,
  StepExecutionResult,
  WaitPayload,
} from './types';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 1,
  retryDelayMs: 300,
};

const DEFAULT_EVIDENCE_POLICY: EvidencePolicy = {
  screenshotOnFailure: true,
  captureConsoleLogs: true,
  captureNetworkSummary: true,
  captureDomSnapshotOnFailure: true,
  redactSecrets: true,
  redactSelectors: [],
  captureTrace: false,
  captureVideo: false,
  artifactDirectory: '',
  retentionLimit: 20,
  captureNetworkBodies: false,
  maxNetworkBodyBytes: 65_536,
};
interface PluginRuntime {
  execute(type: 'action' | 'assertion' | 'exporter' | 'healing' | 'command', id: string, payload: unknown, context?: Record<string, unknown>): Promise<unknown>;
  emit(event: 'run:start' | 'run:complete' | 'step:start' | 'step:complete', payload: unknown): Promise<unknown>;
}

export class ScriptExecutor {
  private readonly consoleLogs: string[] = [];
  private readonly networkSummary: NetworkEntry[] = [];
  private readonly attachments: Array<{ name: string; contentType: string; path?: string; data?: string }> = [];
  private activeRun: {
    controller: AbortController;
    context: BrowserContext | null;
    runId: string;
    totalSteps: number;
    currentStep: number;
    pauseRequested: boolean;
    pauseAfterStep: boolean;
    breakpointStep?: number;
    consumedBreakpoints: Set<number>;
    waiters: Array<() => void>;
  } | null = null;
  private stateSnapshot: ExecutionStateSnapshot = {
    state: 'idle',
    currentStep: -1,
    totalSteps: 0,
    updatedAt: Date.now(),
  };

  constructor(
    private readonly browserType: BrowserType = chromium,
    private readonly healingEngine: HealingEngine = new HealingEngine(),
    private readonly advancedTesting: AdvancedPageTesting = new AdvancedPageTesting(),
    private readonly visualRegression: VisualRegressionService = new VisualRegressionService(),
    private readonly plugins?: PluginRuntime
  ) {}

  async execute(actions: RecordedAction[], options?: ExecutionOptions): Promise<ExecutionResult> {
    const runId = this.createRunId();
    const startedAt = Date.now();
    const steps: StepExecutionResult[] = [];

    const resolved = this.resolveOptions(options);
    if (this.activeRun) {
      throw new Error('An execution is already active');
    }
    const controller = new AbortController();
    this.activeRun = {
      controller,
      context: null,
      runId,
      totalSteps: actions.length,
      currentStep: -1,
      pauseRequested: false,
      pauseAfterStep: false,
      consumedBreakpoints: new Set<number>(),
      waiters: [],
    };
    this.setState('starting');
    const globalTimer = setTimeout(
      () => controller.abort(new Error(`Execution timed out after ${resolved.globalTimeoutMs}ms`)),
      resolved.globalTimeoutMs
    );
    this.consoleLogs.length = 0;
    this.networkSummary.length = 0;
    this.attachments.length = 0;

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let runError: string | undefined;

    try {
      this.validateActions(actions);
      browser = await this.browserType.launch({
        headless: resolved.headless,
        executablePath: resolved.executablePath || undefined,
        channel: resolved.executablePath ? undefined : resolved.channel,
      });
      context = await browser.newContext(resolved.evidence.captureVideo && resolved.evidence.artifactDirectory
        ? { recordVideo: { dir: resolved.evidence.artifactDirectory } } : {});
      if (resolved.evidence.captureTrace && resolved.evidence.artifactDirectory && context.tracing) {
        await context.tracing.start({ screenshots: true, snapshots: true });
      }
      if (this.activeRun) this.activeRun.context = context;
      controller.signal.addEventListener('abort', () => {
        context?.close().catch(() => undefined);
      }, { once: true });
      page = await context.newPage();

      this.attachEvidenceListeners(page, resolved.evidence);
      this.attachBrowserPolicies(page, resolved, controller);
      this.setState('running');
      await this.plugins?.emit('run:start', { runId, totalSteps: actions.length, options: resolved });

      for (let i = 0; i < actions.length; i++) {
        this.throwIfAborted(controller.signal);
        const action = actions[i];
        await this.plugins?.emit('step:start', { runId, index: i, action });
        await this.waitForRunPermission(i, action, controller.signal);
        if (this.isStepDisabled(action)) {
          const timestamp = Date.now();
          steps.push({
            index: i,
            action,
            status: 'skipped',
            startedAt: timestamp,
            endedAt: timestamp,
            durationMs: 0,
            retries: 0,
          });
          this.pauseAfterCompletedStep();
          await this.plugins?.emit('step:complete', { runId, index: i, status: 'skipped', action });
          continue;
        }
        const step = await this.executeStep(page, i, action, resolved, controller.signal);
        steps.push(step);
        await this.plugins?.emit('step:complete', { runId, index: i, action, result: step });
        this.pauseAfterCompletedStep();

        if (step.status === 'failed' && !resolved.continueOnFailure) {
          break;
        }
      }
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(globalTimer);
      if (context) {
        if (resolved.evidence.captureTrace && resolved.evidence.artifactDirectory && context.tracing) {
          await context.tracing.stop({ path: `${resolved.evidence.artifactDirectory}/${runId}.zip` }).catch(() => undefined);
        }
        await context.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      if (resolved.evidence.artifactDirectory) {
        await this.enforceArtifactRetention(
          resolved.evidence.artifactDirectory,
          resolved.evidence.retentionLimit ?? 20
        );
      }
    }

    const endedAt = Date.now();
    const failed = steps.filter((s) => s.status === 'failed').length;
    const passed = steps.filter((s) => s.status === 'passed').length;
    const skipped =
      steps.filter((step) => step.status === 'skipped').length +
      Math.max(0, actions.length - steps.length);
    const cancelled = steps.filter((step) => step.status === 'cancelled').length;
    const finalState: ExecutionState = controller.signal.aborted
      ? this.isCancellationReason(controller.signal.reason) ? 'cancelled' : 'failed'
      : failed > 0 || runError ? 'failed' : 'passed';
    this.setState(finalState, runError ?? this.abortReason(controller.signal));
    this.activeRun = null;
    await this.plugins?.emit('run:complete', {
      runId, finalState, summary: { total: actions.length, passed, failed, skipped, cancelled },
    });

    return {
      runId,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      status: failed > 0 || cancelled > 0 || runError ? 'failed' : 'passed',
      runError,
      options: {
        continueOnFailure: resolved.continueOnFailure,
        defaultStepTimeoutMs: resolved.defaultStepTimeoutMs,
        globalTimeoutMs: resolved.globalTimeoutMs,
      },
      steps,
      summary: {
        total: actions.length,
        passed,
        failed,
        skipped,
        cancelled,
        durationMs: endedAt - startedAt,
      },
      consoleLogs: [...this.consoleLogs],
      networkSummary: [...this.networkSummary],
      finalState,
      attachments: [...this.attachments],
    };
  }

  private async executeStep(
    page: Page,
    index: number,
    action: RecordedAction,
    options: Required<ExecutionOptions>,
    signal: AbortSignal
  ): Promise<StepExecutionResult> {
    const startedAt = Date.now();
    const stepOptions = this.resolveStepOptions(action, options);
    let retries = 0;
    let lastError: unknown = null;
    let healing: HealingResult | undefined;
    let activeSelector = action.selector;

    for (let attempt = 0; attempt <= stepOptions.retryPolicy.maxRetries; attempt++) {
      try {
        await this.withCancellation(
          this.performAction(page, action, stepOptions, activeSelector),
          signal
        );
        const endedAt = Date.now();
        return {
          index,
          action,
          status: 'passed',
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          retries,
          healing,
        };
      } catch (error) {
        lastError = error;
        if (signal.aborted) {
          break;
        }

        if (!healing && action.locatorFingerprint && this.isLocatorAction(action.type)) {
          const result = await this.healingEngine.healLocator(
            action.selector,
            page,
            action.locatorFingerprint
          );
          if (result && result.applied !== false) {
            healing = result;
            activeSelector = result.healedSelector;
            try {
              await this.withCancellation(
                this.performAction(page, action, stepOptions, activeSelector),
                signal
              );
              const endedAt = Date.now();
              return {
                index,
                action,
                status: 'passed',
                startedAt,
                endedAt,
                durationMs: endedAt - startedAt,
                retries,
                healing,
              };
            } catch (healedError) {
              lastError = healedError;
              if (signal.aborted) {
                break;
              }
            }
          }
        }

        if (attempt < stepOptions.retryPolicy.maxRetries) {
          retries++;
          await this.delay(stepOptions.retryPolicy.retryDelayMs, signal);
          continue;
        }
      }
    }

    const endedAt = Date.now();
    const evidence = await this.captureFailureEvidence(page, stepOptions.evidence);

    return {
      index,
      action,
      status: signal.aborted ? 'cancelled' : 'failed',
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      retries,
      healing,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      evidence,
      expected: action.type === 'assert'
        ? String((action.metadata as AssertionPayload | undefined)?.expected ?? '')
        : undefined,
      actual: action.type === 'assert'
        ? this.extractActualValue(lastError instanceof Error ? lastError.message : String(lastError))
        : undefined,
    };
  }

  private async performAction(
    page: Page,
    action: RecordedAction,
    options: Required<ExecutionOptions>,
    selector = action.selector
  ): Promise<void> {

    switch (action.type) {
      case 'navigate': {
        const target = this.resolveUrl(action.value, options.baseUrl);
        if (!target) {
          throw new Error('Navigate action is missing target URL');
        }
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'click':
      case 'doubleclick':
      case 'rightclick': {
        if (this.hasFrameContext(action)) {
          const locator = this.getActionLocator(page, action, selector);
          await locator.waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
          if (action.type === 'doubleclick') {
            await locator.dblclick({ timeout: options.defaultStepTimeoutMs });
          } else {
            await locator.click({
              button: action.type === 'rightclick' ? 'right' : 'left',
              timeout: options.defaultStepTimeoutMs,
            });
          }
          return;
        }
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
        if (action.type === 'doubleclick') {
          await page.dblclick(selector, { timeout: options.defaultStepTimeoutMs });
          return;
        }
        if (action.type === 'rightclick') {
          await page.click(selector, { button: 'right', timeout: options.defaultStepTimeoutMs });
          return;
        }
        await page.click(selector, { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'input': {
        if (this.hasFrameContext(action)) {
          const locator = this.getActionLocator(page, action, selector);
          await locator.waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
          await locator.fill(action.value ?? '', { timeout: options.defaultStepTimeoutMs });
          return;
        }
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
        await page.fill(selector, action.value ?? '', { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'select': {
        if (this.hasFrameContext(action)) {
          await this.getActionLocator(page, action, selector).selectOption(
            action.value ?? '',
            { timeout: options.defaultStepTimeoutMs }
          );
          return;
        }
        await page.selectOption(selector, action.value ?? '', { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'checkbox': {
        const locator = this.getActionLocator(page, action, selector);
        await locator.waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
        if ((action.value ?? 'true').toLowerCase() === 'false') {
          await locator.uncheck({ timeout: options.defaultStepTimeoutMs });
        } else {
          await locator.check({ timeout: options.defaultStepTimeoutMs });
        }
        return;
      }
      case 'radio': {
        const locator = this.getActionLocator(page, action, selector);
        await locator.waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
        await locator.check({ timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'upload': {
        const metadataFiles =
          action.metadata &&
          'files' in action.metadata &&
          Array.isArray(action.metadata.files) &&
          action.metadata.files.every((file): file is string => typeof file === 'string')
            ? action.metadata.files
            : undefined;
        const files = metadataFiles && metadataFiles.length > 0 ? metadataFiles : action.value;
        if (!files || (Array.isArray(files) && files.length === 0)) {
          throw new Error('Upload action is missing a file path');
        }
        await this.getActionLocator(page, action, selector).setInputFiles(files, {
          timeout: options.defaultStepTimeoutMs,
        });
        return;
      }
      case 'hover': {
        await this.getActionLocator(page, action, selector).hover({ timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'focus': {
        await this.getActionLocator(page, action, selector).focus({ timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'submit': {
        await this.getActionLocator(page, action, selector).evaluate((element) => {
          const form = element instanceof HTMLFormElement ? element : element.closest('form');
          if (!form) {
            throw new Error('Submit target is not a form and has no parent form');
          }
          form.requestSubmit();
        });
        return;
      }
      case 'drag': {
        if (!action.value) {
          throw new Error('Drag action is missing a target selector');
        }
        if (this.hasFrameContext(action)) {
          await this.getActionLocator(page, action, selector).dragTo(
            this.getActionLocator(page, action, action.value),
            { timeout: options.defaultStepTimeoutMs }
          );
        } else {
          await page.dragAndDrop(selector, action.value, {
            timeout: options.defaultStepTimeoutMs,
          });
        }
        return;
      }
      case 'scroll': {
        const [rawY, rawX] = (action.value ?? '').split(',');
        const y = Number(rawY);
        const x = Number(rawX);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('Scroll action value must use the "y,x" numeric format');
        }
        await page.evaluate(({ left, top }) => window.scrollTo({ left, top }), {
          left: x,
          top: y,
        });
        return;
      }
      case 'keyboard':
      case 'keypress': {
        if (action.value) {
          await page.keyboard.press(action.value);
        }
        return;
      }
      case 'wait': {
        await this.performWait(page, action, options);
        return;
      }
      case 'waitForPageLoad': {
        await page.waitForLoadState('domcontentloaded', { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'assert': {
        await this.performAssertion(page, action, selector, options);
        return;
      }
      case 'scrape': {
        const fields = Array.isArray((action.metadata as Record<string, unknown> | undefined)?.fields)
          ? (action.metadata as { fields: string[] }).fields : [];
        const records = await page.locator(selector).evaluateAll((elements, names) =>
          elements.map((element) => Object.fromEntries((names as string[]).map((name) => [
            name, element.querySelector(`[data-field="${name}"]`)?.textContent?.trim() ?? '',
          ]))), fields);
        this.consoleLogs.push(`[scrape] ${redactText(JSON.stringify(records))}`);
        return;
      }
      case 'mockNetwork': {
        const mock = action.metadata as unknown as NetworkMock;
        if (!mock?.urlPattern) throw new Error('Network mock requires metadata.urlPattern');
        await this.advancedTesting.installMocks(page, [mock]);
        return;
      }
      case 'api': {
        const api = action.metadata as unknown as ApiStep;
        const result = await this.advancedTesting.runApiStep(page, {
          ...api, method: api?.method ?? 'GET', url: api?.url ?? action.value ?? '',
        });
        if (!result.passed) {
          throw new Error(`API assertion failed: received status ${result.status}${api?.expectedStatus ? `, expected ${api.expectedStatus}` : ''}`);
        }
        this.consoleLogs.push(`[api] ${api?.method ?? 'GET'} ${api?.url ?? action.value} -> ${result.status} (${result.durationMs}ms)`);
        return;
      }
      case 'accessibility': {
        const result = await this.advancedTesting.scanAccessibility(page);
        if (!result.passed) {
          throw new Error(`Accessibility scan failed: ${result.counts.critical} critical and ${result.counts.serious} serious issues`);
        }
        this.consoleLogs.push(`[accessibility] ${result.issues.length} issues`);
        return;
      }
      case 'performance': {
        const budgets = (action.metadata ?? {}) as PerformanceBudgets;
        const result = await this.advancedTesting.measurePerformance(page, budgets);
        if (!result.passed) {
          throw new Error(`Performance budget failed: ${result.violations.map((item) =>
            `${item.metric} ${item.actual} > ${item.budget}`).join(', ')}`);
        }
        this.consoleLogs.push(`[performance] ${JSON.stringify(result.metrics)}`);
        return;
      }
      case 'visual': {
        const metadata = (action.metadata ?? {}) as { name?: string; mode?: string; threshold?: number; fullPage?: boolean };
        const name = metadata.name ?? action.selector;
        if (!name) throw new Error('Visual step requires a baseline name');
        const screenshot = await page.screenshot({ type: 'png', fullPage: metadata.fullPage === true });
        if (metadata.mode === 'baseline') {
          this.visualRegression.setBaseline(name, screenshot);
          return;
        }
        const comparison = this.visualRegression.compare(name, screenshot, metadata.threshold ?? 0);
        if (!comparison.passed) {
          throw new Error(`Visual regression failed for ${name}: ${(comparison.differenceRatio * 100).toFixed(2)}% difference exceeds ${((metadata.threshold ?? 0) * 100).toFixed(2)}%`);
        }
        return;
      }
      case 'plugin': {
        if (!this.plugins) throw new Error('Plugin runtime is not available');
        const metadata = (action.metadata ?? {}) as { extensionId?: string; payload?: unknown };
        if (!metadata.extensionId) throw new Error('Plugin action requires metadata.extensionId');
        await this.plugins.execute('action', metadata.extensionId, metadata.payload ?? action.value, {
          action, selector, pageUrl: page.url(),
        });
        return;
      }
      default:
        return;
    }
  }

  private async performAssertion(
    page: Page,
    action: RecordedAction,
    selector: string,
    options: Required<ExecutionOptions>
  ): Promise<void> {
    const payload = action.metadata as AssertionPayload | undefined;
    const locator = this.getActionLocator(page, action, selector);
    const kind = payload?.kind ?? 'visible';

    if (kind === 'visible') {
      await locator.waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
      return;
    }

    if (kind === 'text-contains') {
      const expected = payload?.expected ?? '';
      const text = await locator.textContent({ timeout: options.defaultStepTimeoutMs });
      if (!text || !text.includes(expected)) {
        throw new Error(`Assertion failed: expected text to contain "${expected}", got "${text ?? ''}"`);
      }
      return;
    }

    if (kind === 'value-equals') {
      const expected = payload?.expected ?? '';
      const value = await locator.inputValue({ timeout: options.defaultStepTimeoutMs });
      if (value !== expected) {
        throw new Error(`Assertion failed: expected value "${expected}", got "${value}"`);
      }
      return;
    }

    if (kind === 'attribute-equals') {
      const attributeName = payload?.attributeName;
      const expected = payload?.expected;
      if (!attributeName) {
        throw new Error('Assertion payload missing attributeName for attribute-equals assertion');
      }

      const actual = await locator.getAttribute(attributeName, { timeout: options.defaultStepTimeoutMs });
      if ((actual ?? '') !== (expected ?? '')) {
        throw new Error(
          `Assertion failed: expected attribute ${attributeName}="${expected ?? ''}", got "${actual ?? ''}"`
        );
      }
      return;
    }

    if (kind === 'count-equals') {
      const expected = Number(payload?.expected);
      if (!Number.isInteger(expected) || expected < 0) {
        throw new Error('Assertion payload expected must be a non-negative integer for count-equals');
      }
      const count = await this.getActionLocatorCollection(page, action, selector).count();
      if (count !== expected) {
        throw new Error(`Assertion failed: expected count ${expected}, got ${count}`);
      }
      return;
    }

    if (kind === 'url-equals' || kind === 'url-contains') {
      const expected = payload?.expected ?? '';
      const actual = page.url();
      const passed = kind === 'url-equals' ? actual === expected : actual.includes(expected);
      if (!passed) {
        throw new Error(
          `Assertion failed: expected URL ${kind === 'url-equals' ? 'to equal' : 'to contain'} "${expected}", got "${actual}"`
        );
      }
      return;
    }

    if (kind === 'title-equals') {
      const expected = payload?.expected ?? '';
      const actual = await page.title();
      if (actual !== expected) {
        throw new Error(`Assertion failed: expected title "${expected}", got "${actual}"`);
      }
      return;
    }

    if (kind === 'response-status') {
      const expectedStatus = Number(payload?.expected);
      const responseUrl = payload?.responseUrl ?? '';
      if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599 || !responseUrl) {
        throw new Error('Response assertion requires responseUrl and an HTTP status from 100 to 599');
      }
      const response = await page.waitForResponse(
        (candidate) => candidate.url().includes(responseUrl),
        { timeout: options.defaultStepTimeoutMs }
      );
      if (response.status() !== expectedStatus) {
        throw new Error(`Assertion failed: expected response status ${expectedStatus}, got ${response.status()}`);
      }
      return;
    }

    throw new Error(`Unsupported assertion kind: ${kind}`);
  }

  private attachEvidenceListeners(page: Page, evidence: EvidencePolicy): void {
    if (evidence.captureConsoleLogs) {
      page.on('console', (message) => {
        const text = evidence.redactSecrets === false ? message.text() : redactText(message.text());
        this.consoleLogs.push(`[${message.type()}] ${text}`);
      });
    }

    if (evidence.captureNetworkSummary) {
      page.on('response', async (response) => {
        const entry: NetworkEntry = {
          url: evidence.redactSecrets === false ? response.url() : redactURL(response.url()),
          method: response.request().method(),
          status: response.status(),
          timestamp: Date.now(),
          contentType: response.headers()['content-type'],
        };
        if (evidence.captureNetworkBodies) {
          try {
            const body = (await response.text()).slice(0, evidence.maxNetworkBodyBytes ?? 65_536);
            entry.body = evidence.redactSecrets === false ? body : redactText(body);
          } catch { /* Binary or unavailable body. */ }
        }
        this.networkSummary.push(entry);
      });
    }
  }

  private extractActualValue(message: string): string | undefined {
    return message.match(/\bgot\s+"([^"]*)"/i)?.[1] ?? message.match(/\bgot\s+([^\s]+)$/i)?.[1];
  }

  private async enforceArtifactRetention(directory: string, limit: number): Promise<void> {
    if (!path.isAbsolute(directory) || limit < 1) return;
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const files = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        return { filePath, modified: (await fs.stat(filePath)).mtimeMs };
      }));
      await Promise.all(files.sort((a, b) => b.modified - a.modified).slice(limit)
        .map((file) => fs.unlink(file.filePath)));
    } catch { /* Artifact capture and cleanup are best-effort diagnostics. */ }
  }

  private attachBrowserPolicies(
    page: Page,
    options: Required<ExecutionOptions>,
    controller: AbortController
  ): void {
    page.on('dialog', (dialog) => {
      if (options.dialogPolicy === 'fail') {
        controller.abort(new Error(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`));
        dialog.dismiss().catch(() => undefined);
      } else if (options.dialogPolicy === 'accept') {
        dialog.accept().catch(() => undefined);
      } else {
        dialog.dismiss().catch(() => undefined);
      }
    });
    page.on('download', (download) => {
      if (options.downloadPolicy === 'allow') {
        download.path().then((downloadPath) => {
          this.attachments.push({
            name: download.suggestedFilename(), contentType: 'application/octet-stream',
            path: downloadPath ?? undefined,
          });
        }).catch(() => undefined);
        return;
      }
      download.cancel().catch(() => undefined);
      if (options.downloadPolicy === 'fail') {
        controller.abort(new Error(`Unexpected download: ${download.suggestedFilename()}`));
      }
    });
    page.on('popup', (popup) => {
      if (options.popupPolicy === 'allow') return;
      popup.close().catch(() => undefined);
      if (options.popupPolicy === 'fail') {
        controller.abort(new Error('Unexpected popup window'));
      }
    });
  }

  private async performWait(
    page: Page,
    action: RecordedAction,
    options: Required<ExecutionOptions>
  ): Promise<void> {
    const payload = (action.metadata ?? {}) as WaitPayload;
    const kind = payload.waitKind ?? 'time';
    if (kind === 'time') {
      const waitMs = Number(action.value || payload.expected || 0);
      await this.delay(waitMs > 0 ? waitMs : 500);
      return;
    }

    if (kind === 'element') {
      await page.locator(action.selector).first().waitFor({
        state: payload.state ?? 'visible',
        timeout: options.defaultStepTimeoutMs,
      });
      return;
    }
    if (kind === 'url') {
      const expected = payload.expected ?? action.value;
      if (!expected) throw new Error('URL wait is missing an expected URL or pattern');
      await page.waitForURL(expected, { timeout: options.defaultStepTimeoutMs });
      return;
    }
    if (kind === 'response') {
      const expected = payload.expected ?? action.value;
      if (!expected) throw new Error('Response wait is missing an expected URL fragment');
      await page.waitForResponse(
        (response) => response.url().includes(expected),
        { timeout: options.defaultStepTimeoutMs }
      );
      return;
    }
    if (kind === 'dom') {
      const expression = payload.expected ?? action.value;
      if (!expression) throw new Error('DOM wait is missing a JavaScript expression');
      await page.waitForFunction(expression, undefined, { timeout: options.defaultStepTimeoutMs });
      return;
    }
    if (kind === 'page-load') {
      await page.waitForLoadState('domcontentloaded', { timeout: options.defaultStepTimeoutMs });
      return;
    }
    throw new Error(`Unsupported wait kind: ${String(kind)}`);
  }

  private async captureFailureEvidence(page: Page, evidence: EvidencePolicy): Promise<{
    screenshotBase64?: string;
    screenshotError?: string;
    domSnapshot?: string;
  }> {
    const snapshot: { screenshotBase64?: string; screenshotError?: string; domSnapshot?: string } = {};

    if (evidence.screenshotOnFailure) {
      try {
        const mask = (evidence.redactSelectors ?? []).map((selector) => page.locator(selector));
        const screenshot = await page.screenshot({ type: 'png', mask });
        snapshot.screenshotBase64 = screenshot.toString('base64');
      } catch (error) {
        snapshot.screenshotError = error instanceof Error ? error.message : 'Screenshot capture failed';
      }
    }

    if (evidence.captureDomSnapshotOnFailure) {
      try {
        const content = await page.content();
        snapshot.domSnapshot = evidence.redactSecrets === false ? content : redactDOMSnapshot(content);
      } catch {
        // Preserve the original step failure when the page is already closed.
      }
    }

    return snapshot;
  }

  private resolveOptions(options?: ExecutionOptions): Required<ExecutionOptions> {
    const defaultStepTimeoutMs = this.positiveTimeout(
      options?.defaultStepTimeoutMs,
      5000,
      'defaultStepTimeoutMs'
    );
    const globalTimeoutMs = this.positiveTimeout(
      options?.globalTimeoutMs,
      300_000,
      'globalTimeoutMs'
    );

    return {
      headless: options?.headless ?? true,
      channel:
        options?.channel ??
        process.env.CHROMATION_BROWSER_CHANNEL ??
        (options?.executablePath || process.env.CHROMATION_BROWSER_PATH ? '' : 'chrome'),
      executablePath:
        options?.executablePath ?? process.env.CHROMATION_BROWSER_PATH ?? '',
      baseUrl: options?.baseUrl ?? '',
      continueOnFailure: options?.continueOnFailure ?? false,
      defaultStepTimeoutMs,
      globalTimeoutMs,
      dialogPolicy: options?.dialogPolicy ?? 'dismiss',
      downloadPolicy: options?.downloadPolicy ?? 'deny',
      popupPolicy: options?.popupPolicy ?? 'deny',
      retryPolicy: options?.retryPolicy ?? DEFAULT_RETRY_POLICY,
      evidence: options?.evidence ?? DEFAULT_EVIDENCE_POLICY,
    };
  }

  private resolveUrl(urlValue: string | undefined, baseUrl: string | undefined): string {
    if (!urlValue) {
      return '';
    }

    if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
      return urlValue;
    }

    if (baseUrl && urlValue.startsWith('/')) {
      return new URL(urlValue, baseUrl).toString();
    }

    return urlValue;
  }

  private createRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  cancel(reason = 'Execution cancelled by user'): boolean {
    if (!this.activeRun || this.activeRun.controller.signal.aborted) {
      return false;
    }
    this.setState('stopping', reason);
    this.activeRun.controller.abort(new Error(reason));
    this.releaseWaiters();
    return true;
  }

  private resolveStepOptions(
    action: RecordedAction,
    options: Required<ExecutionOptions>
  ): Required<ExecutionOptions> {
    const policy = (action.metadata ?? {}) as StepExecutionPolicy;
    const timeoutMs = this.positiveTimeout(
      policy.timeoutMs,
      options.defaultStepTimeoutMs,
      'metadata.timeoutMs'
    );
    const maxRetries = policy.maxRetries ?? options.retryPolicy.maxRetries;
    const retryDelayMs = policy.retryDelayMs ?? options.retryPolicy.retryDelayMs;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error('metadata.maxRetries must be a non-negative integer');
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
      throw new Error('metadata.retryDelayMs must be a non-negative finite number');
    }
    return {
      ...options,
      defaultStepTimeoutMs: timeoutMs,
      retryPolicy: { maxRetries, retryDelayMs },
    };
  }

  pause(): boolean {
    if (!this.activeRun || !['starting', 'running'].includes(this.stateSnapshot.state)) {
      return false;
    }
    this.activeRun.pauseRequested = true;
    return true;
  }

  resume(): boolean {
    if (!this.activeRun || this.stateSnapshot.state !== 'paused') {
      return false;
    }
    this.activeRun.pauseRequested = false;
    this.activeRun.pauseAfterStep = false;
    this.activeRun.breakpointStep = undefined;
    this.setState('running');
    this.releaseWaiters();
    return true;
  }

  step(): boolean {
    if (!this.activeRun || this.stateSnapshot.state !== 'paused') {
      return false;
    }
    this.activeRun.pauseRequested = false;
    this.activeRun.pauseAfterStep = true;
    this.activeRun.breakpointStep = undefined;
    this.setState('running');
    this.releaseWaiters();
    return true;
  }

  getState(): ExecutionStateSnapshot {
    return { ...this.stateSnapshot };
  }

  private positiveTimeout(value: number | undefined, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved <= 0) {
      throw new Error(`${name} must be a positive finite number`);
    }
    return resolved;
  }

  isExecuting(): boolean {
    return this.activeRun !== null;
  }

  private async waitForRunPermission(
    index: number,
    action: RecordedAction,
    signal: AbortSignal
  ): Promise<void> {
    const run = this.activeRun;
    if (!run) return;
    run.currentStep = index;
    const isBreakpoint = this.isStepBreakpoint(action) && !run.consumedBreakpoints.has(index);
    if (isBreakpoint) {
      run.consumedBreakpoints.add(index);
      run.breakpointStep = index;
      run.pauseRequested = true;
    }
    if (!run.pauseRequested) {
      this.setState('running');
      return;
    }

    this.setState('paused');
    await this.withCancellation(new Promise<void>((resolve) => run.waiters.push(resolve)), signal);
    this.throwIfAborted(signal);
  }

  private pauseAfterCompletedStep(): void {
    if (!this.activeRun?.pauseAfterStep) return;
    this.activeRun.pauseAfterStep = false;
    this.activeRun.pauseRequested = true;
  }

  private releaseWaiters(): void {
    const waiters = this.activeRun?.waiters.splice(0) ?? [];
    waiters.forEach((resolve) => resolve());
  }

  private isStepBreakpoint(action: RecordedAction): boolean {
    return (action.metadata as Record<string, unknown> | undefined)?.breakpoint === true;
  }

  private isStepDisabled(action: RecordedAction): boolean {
    return (action.metadata as Record<string, unknown> | undefined)?.disabled === true;
  }

  private hasFrameContext(action: RecordedAction): boolean {
    const frameSelectors = (action.metadata as Record<string, unknown> | undefined)?.frameSelectors;
    return Array.isArray(frameSelectors) && frameSelectors.length > 0;
  }

  private getActionLocator(page: Page, action: RecordedAction, selector: string): Locator {
    return this.getActionLocatorCollection(page, action, selector).first();
  }

  private getActionLocatorCollection(page: Page, action: RecordedAction, selector: string): Locator {
    const frameSelectors =
      (action.metadata as Record<string, unknown> | undefined)?.frameSelectors;
    if (!Array.isArray(frameSelectors) || frameSelectors.length === 0) {
      return page.locator(selector);
    }
    let frame = page.frameLocator(String(frameSelectors[0]));
    for (const frameSelector of frameSelectors.slice(1)) {
      frame = frame.frameLocator(String(frameSelector));
    }
    return frame.locator(selector);
  }

  private setState(state: ExecutionState, reason?: string): void {
    const run = this.activeRun;
    this.stateSnapshot = {
      state,
      runId: run?.runId ?? this.stateSnapshot.runId,
      currentStep: run?.currentStep ?? this.stateSnapshot.currentStep,
      totalSteps: run?.totalSteps ?? this.stateSnapshot.totalSteps,
      breakpointStep: run?.breakpointStep,
      reason,
      updatedAt: Date.now(),
    };
  }

  private abortReason(signal: AbortSignal): string | undefined {
    if (!signal.aborted) return undefined;
    return signal.reason instanceof Error ? signal.reason.message : String(signal.reason);
  }

  private isCancellationReason(reason: unknown): boolean {
    const message = reason instanceof Error ? reason.message : String(reason);
    return /cancel/i.test(message);
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    await this.withCancellation(new Promise((resolve) => setTimeout(resolve, ms)), signal);
  }

  private validateActions(actions: RecordedAction[]): void {
    validateRecordedActions(actions);
    const supported = new Set<ActionType>([
      'navigate',
      'click',
      'doubleclick',
      'rightclick',
      'input',
      'select',
      'checkbox',
      'radio',
      'upload',
      'hover',
      'focus',
      'submit',
      'drag',
      'scroll',
      'keyboard',
      'keypress',
      'wait',
      'waitForPageLoad',
      'assert',
      'scrape',
      'visual',
      'api',
      'mockNetwork',
      'accessibility',
      'performance',
      'plugin',
    ]);

    const unsupported = [...new Set(actions.map((action) => action.type).filter((type) => !supported.has(type)))];
    if (unsupported.length > 0) {
      throw new Error(`Unsupported recorded action type(s): ${unsupported.join(', ')}`);
    }
  }

  private isLocatorAction(type: ActionType): boolean {
    return [
      'click',
      'doubleclick',
      'rightclick',
      'input',
      'select',
      'checkbox',
      'radio',
      'upload',
      'hover',
      'focus',
      'submit',
      'drag',
      'assert',
    ].includes(type);
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
    }
  }

  private async withCancellation<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    this.throwIfAborted(signal);
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(
        signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason))
      );
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
}
