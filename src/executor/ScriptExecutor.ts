import { Browser, BrowserContext, Page, chromium } from 'playwright-core';
import { RecordedAction } from '../recorder/Recorder';
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

    try {
      browser = await chromium.launch({ headless: resolved.headless });
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
    } finally {
      if (context) {
        await context.close();
      }
      if (browser) {
        await browser.close();
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
      status: failed > 0 ? 'failed' : 'passed',
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

    for (let attempt = 0; attempt <= options.retryPolicy.maxRetries; attempt++) {
      try {
        await this.performAction(page, action, options);
        const endedAt = Date.now();
        return {
          index,
          action,
          status: 'passed',
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          retries,
        };
      } catch (error) {
        lastError = error;

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
      error: lastError instanceof Error ? lastError.message : String(lastError),
      evidence,
    };
  }

  private async performAction(page: Page, action: RecordedAction, options: Required<ExecutionOptions>): Promise<void> {
    const selector = action.selector;

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
      case 'hover': {
        await page.hover(selector, { timeout: options.defaultStepTimeoutMs });
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
}
