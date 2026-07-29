import type { Browser, BrowserContext, BrowserType, Page } from 'playwright-core';
import { ScriptExecutor } from '../src/executor/ScriptExecutor';
import { HealingEngine } from '../src/healing/HealingEngine';

describe('ScriptExecutor reliability', () => {
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
      evaluate: jest.fn().mockResolvedValue(undefined),
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
    expect(locator.evaluate).toHaveBeenCalled();
    expect(page.dragAndDrop).toHaveBeenCalledWith(
      '#source',
      '#target',
      expect.objectContaining({ timeout: 5000 })
    );
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), { left: 20, top: 500 });
  });
});
