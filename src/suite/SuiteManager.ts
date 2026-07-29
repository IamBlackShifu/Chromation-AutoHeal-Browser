import { randomUUID } from 'crypto';
import { RecordedAction } from '../recorder/Recorder';
import { validateRecordedActions } from '../recording/RecordingSchema';

export interface TestCase {
  id: string;
  name: string;
  actions: RecordedAction[];
  tags: string[];
  enabled: boolean;
  environment?: string;
  variables?: Record<string, string>;
}
export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  tests: TestCase[];
}
export interface SuiteFilter {
  text?: string;
  tags?: string[];
  excludeTags?: string[];
  enabledOnly?: boolean;
}

export class SuiteManager {
  private suites: TestSuite[] = [];

  createSuite(name: string, options: { description?: string; tags?: string[] } = {}): TestSuite {
    this.assertName(name);
    const suite = {
      id: randomUUID(), name: name.trim(), description: options.description,
      tags: this.normalizeTags(options.tags), tests: [],
    };
    this.suites.push(suite);
    return this.clone(suite);
  }
  addTest(suiteId: string, test: Omit<TestCase, 'id'> & { id?: string }): TestCase {
    const suite = this.requireSuite(suiteId);
    this.assertName(test.name);
    const created: TestCase = {
      ...test, id: test.id ?? randomUUID(), name: test.name.trim(),
      actions: validateRecordedActions(test.actions), tags: this.normalizeTags(test.tags),
      enabled: test.enabled !== false,
    };
    if (suite.tests.some((item) => item.id === created.id)) throw new Error(`Duplicate test id: ${created.id}`);
    suite.tests.push(created);
    return this.clone(created);
  }
  updateTest(suiteId: string, testId: string, patch: Partial<Omit<TestCase, 'id'>>): TestCase {
    const suite = this.requireSuite(suiteId);
    const index = suite.tests.findIndex((test) => test.id === testId);
    if (index < 0) throw new Error(`Unknown test: ${testId}`);
    const next = { ...suite.tests[index], ...patch };
    if (patch.name) this.assertName(patch.name);
    if (patch.actions) next.actions = validateRecordedActions(patch.actions);
    if (patch.tags) next.tags = this.normalizeTags(patch.tags);
    suite.tests[index] = next;
    return this.clone(next);
  }
  removeTest(suiteId: string, testId: string): boolean {
    const suite = this.requireSuite(suiteId);
    const index = suite.tests.findIndex((test) => test.id === testId);
    if (index < 0) return false;
    suite.tests.splice(index, 1);
    return true;
  }
  filter(filter: SuiteFilter = {}): Array<{ suite: TestSuite; test: TestCase }> {
    const include = this.normalizeTags(filter.tags);
    const exclude = this.normalizeTags(filter.excludeTags);
    const text = filter.text?.trim().toLowerCase();
    return this.suites.flatMap((suite) => suite.tests
      .filter((test) => !filter.enabledOnly || test.enabled)
      .filter((test) => !text || `${suite.name} ${test.name} ${suite.description ?? ''}`.toLowerCase().includes(text))
      .filter((test) => {
        const tags = new Set([...suite.tags, ...test.tags]);
        return include.every((tag) => tags.has(tag)) && !exclude.some((tag) => tags.has(tag));
      })
      .map((test) => ({ suite: this.clone(suite), test: this.clone(test) })));
  }
  listSuites(): TestSuite[] { return this.clone(this.suites); }
  export(): string { return JSON.stringify({ version: 1, suites: this.suites }, null, 2); }
  import(value: string): void {
    const parsed = JSON.parse(value) as { version?: number; suites?: TestSuite[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.suites)) throw new Error('Unsupported suite document');
    const replacement = new SuiteManager();
    for (const source of parsed.suites) {
      const suite = replacement.createSuite(source.name, source);
      const target = replacement.suites.find((item) => item.id === suite.id) ?? replacement.suites.at(-1)!;
      target.id = source.id;
      source.tests.forEach((test) => replacement.addTest(target.id, test));
    }
    this.suites = replacement.suites;
  }
  private requireSuite(id: string): TestSuite {
    const suite = this.suites.find((item) => item.id === id);
    if (!suite) throw new Error(`Unknown suite: ${id}`);
    return suite;
  }
  private normalizeTags(tags: string[] = []): string[] {
    return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
  }
  private assertName(name: string): void {
    if (!name?.trim() || name.trim().length > 200) throw new Error('Name must contain 1 to 200 characters');
  }
  private clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
}
