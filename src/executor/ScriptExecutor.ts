import { Browser, BrowserContext, BrowserType, Page, chromium } from 'playwright-core';
import { ActionType, RecordedAction } from '../recorder/Recorder';
import { HealingEngine, HealingResult } from '../healing/HealingEngine';
import { validateRecordedActions } from '../recording/RecordingSchema';
import {
  AssertionPayload,
  EvidencePolicy,
  ExecutionOptions,
  ExecutionResult,
  NetworkEntry,
  RetryPolicy,
  StepExecutionResult,
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
};

export class ScriptExecutor {
  private readonly consoleLogs: string[] = [];
  private readonly networkSummary: NetworkEntry[] = [];

  constructor(
    private readonly browserType: BrowserType = chromium,
    private readonly healingEngine: HealingEngine = new HealingEngine()
  ) {}

  async execute(actions: RecordedAction[], options?: ExecutionOptions): Promise<ExecutionResult> {
    const runId = this.createRunId();
    const startedAt = Date.now();
    const steps: StepExecutionResult[] = [];

    const resolved = this.resolveOptions(options);
    this.consoleLogs.length = 0;
    this.networkSummary.length = 0;

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
      context = await browser.newContext();
      page = await context.newPage();

      this.attachEvidenceListeners(page, resolved.evidence);

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const step = await this.executeStep(page, i, action, resolved);
        steps.push(step);

        if (step.status === 'failed' && !resolved.continueOnFailure) {
          break;
        }
      }
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
    } finally {
      if (context) {
        await context.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }

    const endedAt = Date.now();
    const failed = steps.filter((s) => s.status === 'failed').length;
    const passed = steps.filter((s) => s.status === 'passed').length;
    const skipped = Math.max(0, actions.length - steps.length);

    return {
      runId,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      status: failed > 0 || runError ? 'failed' : 'passed',
      runError,
      options: {
        continueOnFailure: resolved.continueOnFailure,
        defaultStepTimeoutMs: resolved.defaultStepTimeoutMs,
      },
      steps,
      summary: {
        total: actions.length,
        passed,
        failed,
        skipped,
        durationMs: endedAt - startedAt,
      },
      consoleLogs: [...this.consoleLogs],
      networkSummary: [...this.networkSummary],
    };
  }

  private async executeStep(
    page: Page,
    index: number,
    action: RecordedAction,
    options: Required<ExecutionOptions>
  ): Promise<StepExecutionResult> {
    const startedAt = Date.now();
    let retries = 0;
    let lastError: unknown = null;
    let healing: HealingResult | undefined;
    let activeSelector = action.selector;

    for (let attempt = 0; attempt <= options.retryPolicy.maxRetries; attempt++) {
      try {
        await this.performAction(page, action, options, activeSelector);
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

        if (!healing && action.locatorFingerprint && this.isLocatorAction(action.type)) {
          const result = await this.healingEngine.healLocator(
            action.selector,
            page,
            action.locatorFingerprint
          );
          if (result) {
            healing = result;
            activeSelector = result.healedSelector;
            try {
              await this.performAction(page, action, options, activeSelector);
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
            }
          }
        }

        if (attempt < options.retryPolicy.maxRetries) {
          retries++;
          await this.delay(options.retryPolicy.retryDelayMs);
          continue;
        }
      }
    }

    const endedAt = Date.now();
    const evidence = await this.captureFailureEvidence(page, options.evidence);

    return {
      index,
      action,
      status: 'failed',
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      retries,
      healing,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      evidence,
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
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
        await page.fill(selector, action.value ?? '', { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'select': {
        await page.selectOption(selector, action.value ?? '', { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'checkbox': {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: options.defaultStepTimeoutMs });
        if ((action.value ?? 'true').toLowerCase() === 'false') {
          await locator.uncheck({ timeout: options.defaultStepTimeoutMs });
        } else {
          await locator.check({ timeout: options.defaultStepTimeoutMs });
        }
        return;
      }
      case 'radio': {
        const locator = page.locator(selector).first();
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
        await page.locator(selector).first().setInputFiles(files, {
          timeout: options.defaultStepTimeoutMs,
        });
        return;
      }
      case 'hover': {
        await page.hover(selector, { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'focus': {
        await page.locator(selector).first().focus({ timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'submit': {
        await page.locator(selector).first().evaluate((element) => {
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
        await page.dragAndDrop(selector, action.value, {
          timeout: options.defaultStepTimeoutMs,
        });
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
        const waitMs = Number(action.value || 0);
        await this.delay(waitMs > 0 ? waitMs : 500);
        return;
      }
      case 'waitForPageLoad': {
        await page.waitForLoadState('domcontentloaded', { timeout: options.defaultStepTimeoutMs });
        return;
      }
      case 'assert': {
        await this.performAssertion(page, selector, action.metadata as AssertionPayload | undefined, options);
        return;
      }
      default:
        return;
    }
  }

  private async performAssertion(
    page: Page,
    selector: string,
    payload: AssertionPayload | undefined,
    options: Required<ExecutionOptions>
  ): Promise<void> {
    const locator = page.locator(selector).first();
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

    throw new Error(`Unsupported assertion kind: ${kind}`);
  }

  private attachEvidenceListeners(page: Page, evidence: EvidencePolicy): void {
    if (evidence.captureConsoleLogs) {
      page.on('console', (message) => {
        this.consoleLogs.push(`[${message.type()}] ${message.text()}`);
      });
    }

    if (evidence.captureNetworkSummary) {
      page.on('response', (response) => {
        this.networkSummary.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          timestamp: Date.now(),
        });
      });
    }
  }

  private async captureFailureEvidence(page: Page, evidence: EvidencePolicy): Promise<{ screenshotBase64?: string; domSnapshot?: string }> {
    const snapshot: { screenshotBase64?: string; domSnapshot?: string } = {};

    if (evidence.screenshotOnFailure) {
      const screenshot = await page.screenshot({ type: 'png' });
      snapshot.screenshotBase64 = screenshot.toString('base64');
    }

    if (evidence.captureDomSnapshotOnFailure) {
      snapshot.domSnapshot = await page.content();
    }

    return snapshot;
  }

  private resolveOptions(options?: ExecutionOptions): Required<ExecutionOptions> {
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
      defaultStepTimeoutMs: options?.defaultStepTimeoutMs ?? 5000,
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

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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
}
