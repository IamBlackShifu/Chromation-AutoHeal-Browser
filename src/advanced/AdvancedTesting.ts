import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Page } from 'playwright-core';

export interface VisualBaseline {
  name: string;
  hash: string;
  imageBase64: string;
  width?: number;
  height?: number;
  updatedAt: number;
}
export interface VisualComparison {
  name: string;
  passed: boolean;
  differenceRatio: number;
  threshold: number;
  baselineHash: string;
  actualHash: string;
  actualBase64: string;
}
export interface AccessibilityIssue {
  rule: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  selector: string;
  message: string;
}
export interface AccessibilityResult {
  passed: boolean;
  issues: AccessibilityIssue[];
  counts: Record<AccessibilityIssue['severity'], number>;
}
export interface PerformanceBudgets {
  loadMs?: number;
  firstContentfulPaintMs?: number;
  largestContentfulPaintMs?: number;
  cumulativeLayoutShift?: number;
  interactionToNextPaintMs?: number;
}
export interface PerformanceResult {
  passed: boolean;
  metrics: Record<string, number>;
  violations: Array<{ metric: string; actual: number; budget: number }>;
}
export interface ApiStep {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  expectedStatus?: number;
  expectedBodyContains?: string;
}
export interface ApiStepResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  passed: boolean;
}
export interface NetworkMock {
  urlPattern: string;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
}

export class VisualRegressionService {
  private baselines = new Map<string, VisualBaseline>();
  setBaseline(name: string, image: Buffer | string): VisualBaseline {
    const imageBase64 = Buffer.isBuffer(image) ? image.toString('base64') : this.stripDataUrl(image);
    const baseline = {
      name, imageBase64, hash: this.hash(imageBase64), updatedAt: Date.now(),
    };
    this.baselines.set(name, baseline);
    return { ...baseline };
  }
  getBaseline(name: string): VisualBaseline | undefined {
    const baseline = this.baselines.get(name);
    return baseline ? { ...baseline } : undefined;
  }
  compare(name: string, image: Buffer | string, threshold = 0): VisualComparison {
    if (threshold < 0 || threshold > 1) throw new Error('Visual threshold must be between 0 and 1');
    const baseline = this.baselines.get(name);
    if (!baseline) throw new Error(`Missing visual baseline: ${name}`);
    const actualBase64 = Buffer.isBuffer(image) ? image.toString('base64') : this.stripDataUrl(image);
    const expected = Buffer.from(baseline.imageBase64, 'base64');
    const actual = Buffer.from(actualBase64, 'base64');
    const length = Math.max(expected.length, actual.length);
    let changed = Math.abs(expected.length - actual.length);
    for (let index = 0; index < Math.min(expected.length, actual.length); index++) {
      if (expected[index] !== actual[index]) changed++;
    }
    const differenceRatio = length ? changed / length : 0;
    return {
      name, passed: differenceRatio <= threshold, differenceRatio, threshold,
      baselineHash: baseline.hash, actualHash: this.hash(actualBase64), actualBase64,
    };
  }
  export(): string { return JSON.stringify([...this.baselines.values()]); }
  import(value: string): void {
    const parsed = JSON.parse(value) as VisualBaseline[];
    if (!Array.isArray(parsed)) throw new Error('Visual baselines must be an array');
    this.baselines = new Map(parsed.map((baseline) => [baseline.name, baseline]));
  }
  private stripDataUrl(value: string): string { return value.replace(/^data:image\/[^;]+;base64,/i, ''); }
  private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
}

export class AdvancedPageTesting {
  async installMocks(page: Page, mocks: NetworkMock[]): Promise<void> {
    for (const mock of mocks) {
      await page.route(mock.urlPattern, (route) => route.fulfill({
        status: mock.status ?? 200,
        headers: mock.headers,
        body: mock.body ?? '',
        contentType: mock.contentType ?? 'application/json',
      }));
    }
  }
  async runApiStep(page: Page, step: ApiStep): Promise<ApiStepResult> {
    const startedAt = Date.now();
    const response = await page.request.fetch(step.url, {
      method: step.method.toUpperCase(), headers: step.headers,
      data: step.body === undefined ? undefined : step.body,
    });
    const body = await response.text();
    const status = response.status();
    const passed = (step.expectedStatus === undefined || status === step.expectedStatus) &&
      (step.expectedBodyContains === undefined || body.includes(step.expectedBodyContains));
    return { status, headers: response.headers(), body, durationMs: Date.now() - startedAt, passed };
  }
  async scanAccessibility(page: Page): Promise<AccessibilityResult> {
    const issues = await page.evaluate(() => {
      const selectorFor = (element: Element) => element.id ? `#${element.id}` : element.tagName.toLowerCase();
      const output: AccessibilityIssue[] = [];
      document.querySelectorAll('img:not([alt])').forEach((element) => output.push({
        rule: 'image-alt', severity: 'serious', selector: selectorFor(element), message: 'Image is missing alt text',
      }));
      document.querySelectorAll('input,select,textarea').forEach((element) => {
        const id = element.getAttribute('id');
        const labelled = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
        if (!labelled) output.push({
          rule: 'form-label', severity: 'critical', selector: selectorFor(element), message: 'Form control has no accessible label',
        });
      });
      document.querySelectorAll('button,a[href]').forEach((element) => {
        if (!(element.textContent ?? '').trim() && !element.getAttribute('aria-label')) output.push({
          rule: 'accessible-name', severity: 'serious', selector: selectorFor(element), message: 'Interactive element has no accessible name',
        });
      });
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      headings.forEach((heading, index) => {
        if (index && Number(heading.tagName[1]) > Number(headings[index - 1].tagName[1]) + 1) output.push({
          rule: 'heading-order', severity: 'moderate', selector: selectorFor(heading), message: 'Heading level is skipped',
        });
      });
      return output;
    });
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    issues.forEach((issue) => counts[issue.severity]++);
    return { passed: counts.critical === 0 && counts.serious === 0, issues, counts };
  }
  async measurePerformance(page: Page, budgets: PerformanceBudgets): Promise<PerformanceResult> {
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? 0;
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      const lcp = lcpEntries.at(-1)?.startTime ?? 0;
      const layoutEntries = performance.getEntriesByType('layout-shift') as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>;
      const cls = layoutEntries.filter((entry) => !entry.hadRecentInput).reduce((sum, entry) => sum + (entry.value ?? 0), 0);
      const eventEntries = performance.getEntriesByType('event') as Array<PerformanceEntry & { duration: number; interactionId?: number }>;
      const inp = Math.max(0, ...eventEntries.filter((entry) => entry.interactionId).map((entry) => entry.duration));
      return {
        loadMs: navigation?.loadEventEnd ?? 0,
        firstContentfulPaintMs: fcp,
        largestContentfulPaintMs: lcp,
        cumulativeLayoutShift: cls,
        interactionToNextPaintMs: inp,
      };
    });
    const violations = Object.entries(budgets).flatMap(([metric, budget]) => {
      const actual = metrics[metric as keyof typeof metrics];
      return budget !== undefined && actual > budget ? [{ metric, actual, budget }] : [];
    });
    return { passed: violations.length === 0, metrics, violations };
  }
}

export interface PersistedRunResult {
  id: string;
  createdAt: number;
  source: 'cli' | 'scheduler' | 'remote' | 'ci';
  status: 'passed' | 'failed';
  payload: unknown;
}
export class ResultArtifactStore {
  constructor(private readonly directory: string) {}
  async save(source: PersistedRunResult['source'], status: PersistedRunResult['status'], payload: unknown): Promise<PersistedRunResult> {
    const result = { id: randomUUID(), createdAt: Date.now(), source, status, payload };
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(path.join(this.directory, `${result.createdAt}-${result.id}.json`), JSON.stringify(result, null, 2), 'utf8');
    return result;
  }
  async list(): Promise<PersistedRunResult[]> {
    try {
      const names = (await fs.readdir(this.directory)).filter((name) => name.endsWith('.json')).sort().reverse();
      return Promise.all(names.map(async (name) => JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8'))));
    } catch { return []; }
  }
}
