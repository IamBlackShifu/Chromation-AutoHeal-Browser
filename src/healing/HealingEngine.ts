import type { Page } from 'playwright-core';

export interface LocatorFingerprint {
  tagName: string;
  attributes: Record<string, string>;
  text?: string;
  accessibleName?: string;
  role?: string;
  domPath?: string[];
  boundingBox?: { x: number; y: number; width: number; height: number };
  mobileContext?: {
    platform: 'android' | 'ios';
    mode: 'native' | 'hybrid' | 'mobileWeb';
    appId: string;
    automationName: string;
    contextName: string;
    screen?: string;
    window?: string;
    orientation?: 'PORTRAIT' | 'LANDSCAPE';
  };
  nodePath?: number[];
  locatorCandidates?: Array<{ strategy: string; value: string; score: number }>;
}

export interface HealingScoreBreakdown {
  attributes: number;
  text: number;
  semantics: number;
  hierarchy: number;
  position: number;
}

export interface HealingCandidate {
  selector: string;
  fingerprint: LocatorFingerprint;
  confidence: number;
  scoreBreakdown: HealingScoreBreakdown;
}

export interface HealingResult {
  originalSelector: string;
  healedSelector: string;
  confidence: number;
  strategy: string;
  timestamp: number;
  scoreBreakdown: HealingScoreBreakdown;
  alternatives: Array<{ selector: string; confidence: number }>;
  approved?: boolean;
  applied?: boolean;
  policy?: HealingApprovalPolicy;
}

export type HealingApprovalPolicy = 'automatic' | 'ask' | 'report-only';
export interface HealingOptions {
  confidenceThreshold?: number;
  ambiguityMargin?: number;
  maxCandidates?: number;
  approvalPolicy?: HealingApprovalPolicy;
}

export class HealingEngine {
  private healingEnabled = true;
  private healingHistory: HealingResult[] = [];
  private confidenceThreshold: number;
  private readonly ambiguityMargin: number;
  private readonly maxCandidates: number;
  private approvalPolicy: HealingApprovalPolicy;
  private approvedLocators = new Map<string, string>();

  constructor(options: HealingOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.68;
    this.ambiguityMargin = options.ambiguityMargin ?? 0.08;
    this.maxCandidates = options.maxCandidates ?? 250;
    this.approvalPolicy = options.approvalPolicy ?? 'automatic';
  }

  enable(): void {
    this.healingEnabled = true;
  }

  disable(): void {
    this.healingEnabled = false;
  }

  async detectBrokenLocator(selector: string, page: Page): Promise<boolean> {
    try {
      return (await page.locator(selector).count()) === 0;
    } catch {
      return true;
    }
  }

  async captureFingerprint(page: Page, selector: string): Promise<LocatorFingerprint> {
    const locator = page.locator(selector).first();
    const names = ['id', 'name', 'type', 'placeholder', 'title', 'aria-label', 'data-testid', 'data-test', 'data-qa'];
    const values = await Promise.all(names.map((name) => locator.getAttribute(name)));
    const attributes = Object.fromEntries(names.flatMap((name, index) =>
      values[index] ? [[name, values[index] as string]] : []
    ));
    const handle = await locator.elementHandle();
    const tagProperty = await handle?.getProperty('tagName');
    const liveTagName = await tagProperty?.jsonValue();
    await tagProperty?.dispose();
    await handle?.dispose();
    const tagName = typeof liveTagName === 'string'
      ? liveTagName.toLowerCase()
      : selector.match(/^[a-z][\w-]*/i)?.[0]?.toLowerCase() ?? '*';
    const text = ((await locator.textContent()) ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
    const rect = await locator.boundingBox();
    return {
      tagName,
      attributes,
      text,
      accessibleName: attributes['aria-label'],
      role: await locator.getAttribute('role') ?? undefined,
      domPath: [tagName],
      boundingBox: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
    };
  }

  async healLocator(
    brokenSelector: string,
    page: Page,
    original: LocatorFingerprint
  ): Promise<HealingResult | null> {
    if (!this.healingEnabled) {
      return null;
    }

    const approvedSelector = this.approvedLocators.get(brokenSelector);
    if (approvedSelector && (await page.locator(approvedSelector).count()) === 1) {
      const approved: HealingResult = {
        originalSelector: brokenSelector, healedSelector: approvedSelector, confidence: 1,
        strategy: 'previously-approved', timestamp: Date.now(),
        scoreBreakdown: { attributes: 1, text: 1, semantics: 1, hierarchy: 1, position: 1 },
        alternatives: [], approved: true, applied: true, policy: this.approvalPolicy,
      };
      this.healingHistory.push(approved);
      return approved;
    }

    const liveCandidates = await this.collectCandidates(page);
    const scored = liveCandidates.map((candidate) => this.scoreCandidate(original, candidate));
    const deterministic = scored.filter((candidate) =>
      candidate.scoreBreakdown.attributes >= 0.5 ||
      candidate.scoreBreakdown.text >= 0.8 ||
      candidate.scoreBreakdown.semantics >= 0.8
    );
    const usedVisualFallback = deterministic.length === 0;
    const candidates = (usedVisualFallback ? scored : deterministic)
      .sort((left, right) => right.confidence - left.confidence);
    const best = candidates[0];
    const runnerUp = candidates[1];

    if (
      !best ||
      best.confidence < this.confidenceThreshold ||
      (runnerUp && best.confidence - runnerUp.confidence < this.ambiguityMargin)
    ) {
      return null;
    }

    if ((await page.locator(best.selector).count()) !== 1) {
      return null;
    }

    const result: HealingResult = {
      originalSelector: brokenSelector,
      healedSelector: best.selector,
      confidence: best.confidence,
      strategy: usedVisualFallback ? 'geometry-similarity-fallback' : 'deterministic-fingerprint',
      timestamp: Date.now(),
      scoreBreakdown: best.scoreBreakdown,
      alternatives: candidates.slice(1, 4).map(({ selector, confidence }) => ({
        selector,
        confidence,
      })),
      approved: this.approvalPolicy === 'automatic',
      applied: this.approvalPolicy === 'automatic',
      policy: this.approvalPolicy,
    };

    this.healingHistory.push(result);
    return result;
  }

  getHealingHistory(): HealingResult[] {
    return [...this.healingHistory];
  }

  clearHistory(): void {
    this.healingHistory = [];
  }

  isEnabled(): boolean {
    return this.healingEnabled;
  }

  setApprovalPolicy(policy: HealingApprovalPolicy): void { this.approvalPolicy = policy; }
  getApprovalPolicy(): HealingApprovalPolicy { return this.approvalPolicy; }
  setConfidenceThreshold(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Confidence threshold must be between 0 and 1');
    this.confidenceThreshold = value;
  }
  approve(result: HealingResult): HealingResult {
    this.approvedLocators.set(result.originalSelector, result.healedSelector);
    result.approved = true;
    result.applied = true;
    return result;
  }
  reject(result: HealingResult): HealingResult {
    result.approved = false;
    result.applied = false;
    return result;
  }
  getApprovedLocators(): Record<string, string> { return Object.fromEntries(this.approvedLocators); }
  compareHistory(): Array<{ selector: string; attempts: number; averageConfidence: number; latest?: HealingResult }> {
    const groups = new Map<string, HealingResult[]>();
    for (const result of this.healingHistory) {
      groups.set(result.originalSelector, [...(groups.get(result.originalSelector) ?? []), result]);
    }
    return [...groups.entries()].map(([selector, results]) => ({
      selector, attempts: results.length,
      averageConfidence: results.reduce((sum, item) => sum + item.confidence, 0) / results.length,
      latest: results.at(-1),
    }));
  }

  private async collectCandidates(page: Page): Promise<Array<{ selector: string; fingerprint: LocatorFingerprint }>> {
    return page.evaluate(`((maximum) => {
      const escape = (value) => {
        const css = globalThis.CSS;
        return css?.escape ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      };
      const pathFor = (element) => {
        const path = [];
        let current = element;
        while (current && path.length < 8) {
          let part = current.tagName.toLowerCase();
          if (current.id) {
            part += '#' + escape(current.id);
            path.unshift(part);
            break;
          }
          path.unshift(part);
          current = current.parentElement;
        }
        return path;
      };
      const selectorFor = (element, index) => {
        const testAttribute = ['data-testid', 'data-test', 'data-qa'].find((name) =>
          element.hasAttribute(name)
        );
        if (testAttribute) {
          return '[' + testAttribute + '="' + escape(element.getAttribute(testAttribute) ?? '') + '"]';
        }
        if (element.id) {
          return '#' + escape(element.id);
        }
        return '[data-chromation-healing-id="' + index + '"]';
      };

      return Array.from(document.querySelectorAll('body *'))
        .filter((element) => {
          const html = element;
          const rect = html.getBoundingClientRect();
          const style = getComputedStyle(html);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .slice(0, maximum)
        .map((element, index) => {
          const html = element;
          const selector = selectorFor(element, index);
          if (selector.startsWith('[data-chromation-healing-id=')) {
            element.setAttribute('data-chromation-healing-id', String(index));
          }
          const attributes = {};
          for (const name of ['id', 'name', 'type', 'placeholder', 'title', 'aria-label', 'data-testid', 'data-test', 'data-qa']) {
            const value = element.getAttribute(name);
            if (value) attributes[name] = value;
          }
          const rect = html.getBoundingClientRect();
          return {
            selector,
            fingerprint: {
              tagName: element.tagName.toLowerCase(),
              attributes,
              text: (element.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 160),
              accessibleName: element.getAttribute('aria-label') ?? undefined,
              role: element.getAttribute('role') ?? undefined,
              domPath: pathFor(element),
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            },
          };
        });
    })(${this.maxCandidates})`) as Promise<Array<{ selector: string; fingerprint: LocatorFingerprint }>>;
  }

  private scoreCandidate(
    original: LocatorFingerprint,
    candidate: { selector: string; fingerprint: LocatorFingerprint }
  ): HealingCandidate {
    const attributes = this.attributeSimilarity(original.attributes, candidate.fingerprint.attributes);
    const text = this.stringSimilarity(original.text, candidate.fingerprint.text);
    const role = this.stringSimilarity(original.role, candidate.fingerprint.role);
    const name = this.stringSimilarity(original.accessibleName, candidate.fingerprint.accessibleName);
    const tag = original.tagName.toLowerCase() === candidate.fingerprint.tagName.toLowerCase() ? 1 : 0;
    const semantics = tag * 0.5 + role * 0.2 + name * 0.3;
    const hierarchy = this.pathSimilarity(original.domPath, candidate.fingerprint.domPath);
    const position = this.positionSimilarity(original.boundingBox, candidate.fingerprint.boundingBox);
    const scoreBreakdown = { attributes, text, semantics, hierarchy, position };
    const confidence =
      attributes * 0.4 + text * 0.2 + semantics * 0.2 + hierarchy * 0.12 + position * 0.08;

    return { ...candidate, confidence, scoreBreakdown };
  }

  private attributeSimilarity(expected: Record<string, string>, actual: Record<string, string>): number {
    const entries = Object.entries(expected);
    if (entries.length === 0) return 0;
    const scores = entries.map(([name, value]) => this.stringSimilarity(value, actual[name]));
    return scores.reduce((total, score) => total + score, 0) / scores.length;
  }

  private pathSimilarity(expected: string[] = [], actual: string[] = []): number {
    if (expected.length === 0 || actual.length === 0) return 0;
    let matches = 0;
    const length = Math.min(expected.length, actual.length);
    for (let offset = 1; offset <= length; offset++) {
      if (expected[expected.length - offset] === actual[actual.length - offset]) matches++;
    }
    return matches / Math.max(expected.length, actual.length);
  }

  private positionSimilarity(
    expected?: LocatorFingerprint['boundingBox'],
    actual?: LocatorFingerprint['boundingBox']
  ): number {
    if (!expected || !actual) return 0;
    const distance = Math.hypot(expected.x - actual.x, expected.y - actual.y);
    return Math.max(0, 1 - distance / 1000);
  }

  private stringSimilarity(expected?: string, actual?: string): number {
    if (!expected || !actual) return 0;
    const left = expected.trim().toLowerCase();
    const right = actual.trim().toLowerCase();
    if (left === right) return 1;
    const leftTokens = new Set(left.split(/\s+/));
    const rightTokens = new Set(right.split(/\s+/));
    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }
}
