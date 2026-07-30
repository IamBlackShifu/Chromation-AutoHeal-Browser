import type { Browser, BrowserContext, BrowserType, Page } from 'playwright-core';
import { ScriptExecutor } from '../src/executor/ScriptExecutor';
import { HealingEngine } from '../src/healing/HealingEngine';

describe('ScriptExecutor reliability', () => {
  async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error('Condition was not met before timeout');
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  test('rejects unsupported actions before launching a browser', async () => {
    const browserType = {
      launch: jest.fn(),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);

    const result = await executor.execute([
      {
        type: 'dragstart',
        selector: '#source',
        timestamp: Date.now(),
      },
    ]);

    expect(result.status).toBe('failed');
    expect(result.runError).toContain('Unsupported recorded action type(s): dragstart');
    expect(result.summary.skipped).toBe(1);
    expect(browserType.launch).not.toHaveBeenCalled();
  });

  test('returns a structured failed result when browser launch fails', async () => {
    const browserType = {
      launch: jest.fn().mockRejectedValue(new Error('Browser executable not found')),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);

    const result = await executor.execute([], { channel: 'chrome' });

    expect(result.status).toBe('failed');
    expect(result.runError).toBe('Browser executable not found');
    expect(result.steps).toEqual([]);
  });

  test('retries a failed locator action with a verified healed selector', async () => {
    const oldLocator = {
      waitFor: jest.fn().mockRejectedValue(new Error('Element not found')),
    };
    const healedLocator = {
      waitFor: jest.fn().mockResolvedValue(undefined),
    };
    const page = {
      locator: jest.fn((selector: string) => ({
        first: () => (selector === '#old-save' ? oldLocator : healedLocator),
      })),
      click: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const healingEngine = {
      healLocator: jest.fn().mockResolvedValue({
        originalSelector: '#old-save',
        healedSelector: '[data-testid="save"]',
        confidence: 0.92,
        strategy: 'fingerprint-similarity',
        timestamp: Date.now(),
        scoreBreakdown: { attributes: 1, text: 1, semantics: 1, hierarchy: 0.8, position: 0.9 },
        alternatives: [],
      }),
    } as unknown as HealingEngine;
    const executor = new ScriptExecutor(browserType, healingEngine);

    const result = await executor.execute([
      {
        type: 'click',
        selector: '#old-save',
        timestamp: Date.now(),
        locatorFingerprint: {
          tagName: 'button',
          attributes: { id: 'old-save' },
          text: 'Save',
        },
      },
    ]);

    expect(result.status).toBe('passed');
    expect(result.steps[0].healing?.healedSelector).toBe('[data-testid="save"]');
    expect(page.click).toHaveBeenCalledWith(
      '[data-testid="save"]',
      expect.objectContaining({ timeout: 5000 })
    );
  });

  test('executes the extended recorder action set', async () => {
    const locator = {
      waitFor: jest.fn().mockResolvedValue(undefined),
      check: jest.fn().mockResolvedValue(undefined),
      uncheck: jest.fn().mockResolvedValue(undefined),
      setInputFiles: jest.fn().mockResolvedValue(undefined),
      focus: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
    };
    const page = {
      locator: jest.fn().mockReturnValue({ first: () => locator }),
      dragAndDrop: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);
    const timestamp = Date.now();

    const result = await executor.execute([
      { type: 'checkbox', selector: '#enabled', value: 'true', timestamp },
      { type: 'checkbox', selector: '#disabled', value: 'false', timestamp },
      { type: 'radio', selector: '#choice', value: 'one', timestamp },
      {
        type: 'upload',
        selector: '#document',
        value: 'document.pdf',
        metadata: { files: ['document.pdf', 'photo.png'] },
        timestamp,
      },
      { type: 'focus', selector: '#name', timestamp },
      { type: 'submit', selector: '#form', timestamp },
      { type: 'drag', selector: '#source', value: '#target', timestamp },
      { type: 'scroll', selector: 'window', value: '500,20', timestamp },
    ]);

    expect(result.status).toBe('passed');
    expect(result.summary.passed).toBe(8);
    expect(locator.check).toHaveBeenCalledTimes(2);
    expect(locator.uncheck).toHaveBeenCalledTimes(1);
    expect(locator.setInputFiles).toHaveBeenCalledWith(
      ['document.pdf', 'photo.png'],
      expect.objectContaining({ timeout: 5000 })
    );
    expect(locator.focus).toHaveBeenCalled();
    expect(locator.press).toHaveBeenCalledWith('Enter', expect.objectContaining({ timeout: 5000, noWaitAfter: true }));
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(String));
    expect(page.dragAndDrop).toHaveBeenCalledWith(
      '#source',
      '#target',
      expect.objectContaining({ timeout: 5000 })
    );
    expect(page.evaluate).toHaveBeenCalledWith('window.scrollTo({"left":20,"top":500})');
  });

  test('cancels an active execution and closes browser resources', async () => {
    const locator = {
      waitFor: jest.fn(() => new Promise<void>(() => undefined)),
    };
    const page = {
      locator: jest.fn().mockReturnValue({ first: () => locator }),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);

    const execution = executor.execute([
      { type: 'click', selector: '#slow-button', timestamp: Date.now() },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(executor.isExecuting()).toBe(true);
    expect(executor.cancel()).toBe(true);
    expect(executor.cancel()).toBe(false);

    const result = await execution;
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toContain('Execution cancelled by user');
    expect(result.summary.failed).toBe(0);
    expect(result.summary.cancelled).toBe(1);
    expect(context.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
    expect(executor.isExecuting()).toBe(false);
  });

  test('enforces the global execution timeout', async () => {
    const locator = {
      waitFor: jest.fn(() => new Promise<void>(() => undefined)),
    };
    const page = {
      locator: jest.fn().mockReturnValue({ first: () => locator }),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);

    const result = await executor.execute(
      [{ type: 'click', selector: '#never-ready', timestamp: Date.now() }],
      { globalTimeoutMs: 20, defaultStepTimeoutMs: 1000 }
    );

    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toBe('Execution timed out after 20ms');
    expect(result.durationMs).toBeLessThan(1000);
  });

  test('pauses and resumes at an action boundary', async () => {
    const locator = { waitFor: jest.fn().mockResolvedValue(undefined) };
    const page = {
      locator: jest.fn().mockReturnValue({ first: () => locator }),
      click: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);

    const execution = executor.execute([
      { type: 'click', selector: '#first', timestamp: Date.now() },
    ]);
    expect(executor.pause()).toBe(true);
    await waitUntil(() => executor.getState().state === 'paused');

    expect(page.click).not.toHaveBeenCalled();
    expect(executor.getState()).toEqual(expect.objectContaining({
      state: 'paused',
      currentStep: 0,
      totalSteps: 1,
    }));
    expect(executor.resume()).toBe(true);

    const result = await execution;
    expect(result.finalState).toBe('passed');
    expect(page.click).toHaveBeenCalledTimes(1);
  });

  test('stops at a breakpoint and executes exactly one step while stepping', async () => {
    const locator = { waitFor: jest.fn().mockResolvedValue(undefined) };
    const click = jest.fn().mockResolvedValue(undefined);
    const page = {
      locator: jest.fn().mockReturnValue({ first: () => locator }),
      click,
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);
    const timestamp = Date.now();

    const execution = executor.execute([
      { type: 'click', selector: '#first', timestamp, metadata: { breakpoint: true } },
      { type: 'click', selector: '#second', timestamp },
    ]);
    await waitUntil(() => executor.getState().state === 'paused');
    expect(executor.getState().breakpointStep).toBe(0);

    expect(executor.step()).toBe(true);
    await waitUntil(() => click.mock.calls.length === 1 && executor.getState().state === 'paused');
    expect(click).toHaveBeenCalledTimes(1);
    expect(executor.getState().currentStep).toBe(1);

    expect(executor.resume()).toBe(true);
    const result = await execution;
    expect(result.finalState).toBe('passed');
    expect(click).toHaveBeenCalledTimes(2);
  });

  test('uses per-action retry settings and skips disabled actions', async () => {
    const locator = {
      waitFor: jest.fn()
        .mockRejectedValueOnce(new Error('not ready'))
        .mockResolvedValue(undefined),
    };
    const page = {
      locator: jest.fn().mockReturnValue({ first: () => locator }),
      click: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);
    const timestamp = Date.now();

    const result = await executor.execute([
      {
        type: 'click',
        selector: '#retry',
        timestamp,
        metadata: { maxRetries: 1, retryDelayMs: 0, timeoutMs: 100 },
      },
      { type: 'click', selector: '#disabled', timestamp, metadata: { disabled: true } },
    ], {
      retryPolicy: { maxRetries: 0, retryDelayMs: 1000 },
    });

    expect(result.status).toBe('passed');
    expect(result.steps[0]).toEqual(expect.objectContaining({ status: 'passed', retries: 1 }));
    expect(result.steps[1].status).toBe('skipped');
    expect(page.click).toHaveBeenCalledTimes(1);
  });

  test('executes locator actions inside a recorded iframe chain', async () => {
    const frameLocatorTarget = {
      waitFor: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
    };
    const nestedFrame = {
      locator: jest.fn().mockReturnValue({ first: () => frameLocatorTarget }),
    };
    const outerFrame = {
      frameLocator: jest.fn().mockReturnValue(nestedFrame),
    };
    const page = {
      frameLocator: jest.fn().mockReturnValue(outerFrame),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);

    const result = await executor.execute([{
      type: 'click',
      selector: '#inside-frame',
      timestamp: Date.now(),
      metadata: { frameSelectors: ['#outer-frame', '#inner-frame'] },
    }]);

    expect(result.status).toBe('passed');
    expect(page.frameLocator).toHaveBeenCalledWith('#outer-frame');
    expect(outerFrame.frameLocator).toHaveBeenCalledWith('#inner-frame');
    expect(frameLocatorTarget.click).toHaveBeenCalled();
  });

  test('executes count, URL, title, and response assertions', async () => {
    const locator = {
      count: jest.fn().mockResolvedValue(3),
      first: jest.fn(),
    };
    locator.first.mockReturnValue(locator);
    const response = {
      url: jest.fn().mockReturnValue('https://example.test/api/items'),
      status: jest.fn().mockReturnValue(200),
    };
    const page = {
      locator: jest.fn().mockReturnValue(locator),
      url: jest.fn().mockReturnValue('https://example.test/dashboard'),
      title: jest.fn().mockResolvedValue('Dashboard'),
      waitForResponse: jest.fn().mockImplementation(async (predicate) => {
        expect(predicate(response)).toBe(true);
        return response;
      }),
      on: jest.fn(),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);
    const timestamp = Date.now();

    const result = await executor.execute([
      { type: 'assert', selector: '.row', timestamp, metadata: { kind: 'count-equals', expected: '3' } },
      { type: 'assert', selector: 'window', timestamp, metadata: { kind: 'url-contains', expected: '/dashboard' } },
      { type: 'assert', selector: 'window', timestamp, metadata: { kind: 'title-equals', expected: 'Dashboard' } },
      {
        type: 'assert',
        selector: 'window',
        timestamp,
        metadata: { kind: 'response-status', expected: '200', responseUrl: '/api/items' },
      },
    ]);

    expect(result.status).toBe('passed');
    expect(result.summary.passed).toBe(4);
    expect(locator.count).toHaveBeenCalled();
    expect(page.title).toHaveBeenCalled();
    expect(page.waitForResponse).toHaveBeenCalled();
  });

  test('executes visual, API, network mock, accessibility, and performance steps', async () => {
    const page = { on: jest.fn(), screenshot: jest.fn().mockResolvedValue(Buffer.from('same')) } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context), close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = { launch: jest.fn().mockResolvedValue(browser) } as unknown as BrowserType;
    const advanced = {
      installMocks: jest.fn().mockResolvedValue(undefined),
      runApiStep: jest.fn().mockResolvedValue({ passed: true, status: 200, durationMs: 3, headers: {}, body: '{}' }),
      scanAccessibility: jest.fn().mockResolvedValue({
        passed: true, issues: [], counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      }),
      measurePerformance: jest.fn().mockResolvedValue({ passed: true, metrics: { loadMs: 10 }, violations: [] }),
    };
    const visual = {
      setBaseline: jest.fn(),
      compare: jest.fn().mockReturnValue({ passed: true, differenceRatio: 0 }),
    };
    const executor = new ScriptExecutor(
      browserType,
      new HealingEngine(),
      advanced as never,
      visual as never
    );
    const timestamp = Date.now();
    const result = await executor.execute([
      { type: 'mockNetwork', selector: 'network', timestamp, metadata: { urlPattern: '**/api', status: 200 } },
      { type: 'api', selector: 'request', timestamp, metadata: { method: 'GET', url: 'https://example.test/api', expectedStatus: 200 } },
      { type: 'accessibility', selector: 'page', timestamp, metadata: {} },
      { type: 'performance', selector: 'page', timestamp, metadata: { loadMs: 1000 } },
      { type: 'visual', selector: 'home', timestamp, metadata: { name: 'home', mode: 'baseline' } },
      { type: 'visual', selector: 'home', timestamp, metadata: { name: 'home', threshold: 0.01 } },
    ]);
    expect(result.status).toBe('passed');
    expect(result.summary.passed).toBe(6);
    expect(advanced.installMocks).toHaveBeenCalled();
    expect(advanced.runApiStep).toHaveBeenCalled();
    expect(visual.setBaseline).toHaveBeenCalled();
    expect(visual.compare).toHaveBeenCalled();
  });

  test('executes registered plugin actions and emits isolated lifecycle events', async () => {
    const page = { on: jest.fn(), url: jest.fn().mockReturnValue('https://example.test') } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      newContext: jest.fn().mockResolvedValue(context), close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const plugins = {
      execute: jest.fn().mockResolvedValue({ ok: true }),
      emit: jest.fn().mockResolvedValue([]),
    };
    const executor = new ScriptExecutor(
      { launch: jest.fn().mockResolvedValue(browser) } as unknown as BrowserType,
      undefined,
      undefined,
      undefined,
      plugins
    );
    const result = await executor.execute([{
      type: 'plugin', selector: 'echo.action', timestamp: Date.now(),
      metadata: { extensionId: 'echo.action', payload: { value: 'hello' } },
    }]);
    expect(result.status).toBe('passed');
    expect(plugins.execute).toHaveBeenCalledWith(
      'action', 'echo.action', { value: 'hello' }, expect.objectContaining({ pageUrl: 'https://example.test' })
    );
    expect(plugins.emit).toHaveBeenCalledWith('run:start', expect.anything());
    expect(plugins.emit).toHaveBeenCalledWith('step:complete', expect.anything());
    expect(plugins.emit).toHaveBeenCalledWith('run:complete', expect.anything());
  });

  test('reuses the interactive browser while isolating contexts and mirroring page state', async () => {
    const page = {
      on: jest.fn(), goto: jest.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      addCookies: jest.fn().mockResolvedValue(undefined),
      addInitScript: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const browserType = { launch: jest.fn().mockResolvedValue(browser) } as unknown as BrowserType;
    const executor = new ScriptExecutor(browserType);
    const options = {
      reuseBrowser: true,
      initialPageState: {
        url: 'https://example.test/account',
        cookies: 'session=abc',
        localStorage: { theme: 'dark' },
        sessionStorage: { flow: 'checkout' },
      },
    };

    await executor.execute([], options);
    await executor.execute([], options);

    expect(browserType.launch).toHaveBeenCalledTimes(1);
    expect(browser.newContext).toHaveBeenCalledTimes(2);
    expect(context.addCookies).toHaveBeenCalledWith([
      { name: 'session', value: 'abc', url: 'https://example.test' },
    ]);
    expect(context.addInitScript).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('localStorage.setItem'),
    }));
    expect(page.goto).toHaveBeenCalledWith(
      'https://example.test/account',
      expect.objectContaining({ waitUntil: 'domcontentloaded' })
    );
  });
});
