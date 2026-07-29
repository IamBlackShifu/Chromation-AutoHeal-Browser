import type { Page } from 'playwright-core';
import { HealingEngine, LocatorFingerprint } from '../src/healing/HealingEngine';

const original: LocatorFingerprint = {
  tagName: 'button',
  attributes: { id: 'save-button', type: 'submit' },
  text: 'Save changes',
  accessibleName: 'Save changes',
  role: 'button',
  domPath: ['main', 'form', 'button'],
  boundingBox: { x: 100, y: 200, width: 120, height: 32 },
};

function pageWithCandidates(candidates: unknown[], selectorCount = 1): Page {
  return {
    evaluate: jest.fn().mockResolvedValue(candidates),
    locator: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(selectorCount),
    }),
  } as unknown as Page;
}

describe('HealingEngine', () => {
  test('captures a locator fingerprint from the live element', async () => {
    const evaluate = jest.fn().mockResolvedValue(original);
    const page = {
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnValue({ evaluate }),
      }),
    } as unknown as Page;

    const fingerprint = await new HealingEngine().captureFingerprint(page, '#save');

    expect(fingerprint).toEqual(original);
    expect(page.locator).toHaveBeenCalledWith('#save');
  });

  test('detects missing and malformed locators', async () => {
    const existing = pageWithCandidates([], 1);
    const missing = pageWithCandidates([], 0);
    const malformed = {
      locator: jest.fn().mockImplementation(() => {
        throw new Error('Invalid selector');
      }),
    } as unknown as Page;

    const engine = new HealingEngine();
    await expect(engine.detectBrokenLocator('#save', existing)).resolves.toBe(false);
    await expect(engine.detectBrokenLocator('#missing', missing)).resolves.toBe(true);
    await expect(engine.detectBrokenLocator('???', malformed)).resolves.toBe(true);
  });

  test('heals to a unique high-confidence candidate and records evidence', async () => {
    const page = pageWithCandidates([
      {
        selector: '[data-testid="save"]',
        fingerprint: {
          ...original,
          attributes: { 'data-testid': 'save', type: 'submit' },
        },
      },
      {
        selector: '#cancel',
        fingerprint: {
          tagName: 'button',
          attributes: { id: 'cancel' },
          text: 'Cancel',
          domPath: ['footer', 'button'],
          boundingBox: { x: 700, y: 700, width: 80, height: 32 },
        },
      },
    ]);
    const engine = new HealingEngine({ confidenceThreshold: 0.5 });

    const result = await engine.healLocator('#old-save', page, original);

    expect(result?.healedSelector).toBe('[data-testid="save"]');
    expect(result?.confidence).toBeGreaterThan(0.5);
    expect(result?.scoreBreakdown).toBeDefined();
    expect(engine.getHealingHistory()).toHaveLength(1);
  });

  test('rejects ambiguous candidates instead of guessing', async () => {
    const page = pageWithCandidates([
      { selector: '#save-one', fingerprint: original },
      { selector: '#save-two', fingerprint: original },
    ]);
    const engine = new HealingEngine();

    await expect(engine.healLocator('#old-save', page, original)).resolves.toBeNull();
    expect(engine.getHealingHistory()).toHaveLength(0);
  });

  test('does not heal while disabled', async () => {
    const engine = new HealingEngine();
    engine.disable();

    await expect(engine.healLocator('#old-save', pageWithCandidates([]), original)).resolves.toBeNull();
    expect(engine.isEnabled()).toBe(false);
    engine.enable();
    expect(engine.isEnabled()).toBe(true);
  });

  test('clears healing history', async () => {
    const engine = new HealingEngine({ confidenceThreshold: 0.5 });
    await engine.healLocator(
      '#old-save',
      pageWithCandidates([{ selector: '#save', fingerprint: original }]),
      original
    );
    engine.clearHistory();
    expect(engine.getHealingHistory()).toEqual([]);
  });
});
