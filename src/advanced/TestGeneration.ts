import { randomUUID } from 'crypto';
import { RecordedAction } from '../recorder/Recorder';
import { validateRecordedActions } from '../recording/RecordingSchema';

export type GenerationStatus = 'draft' | 'approved' | 'rejected';
export interface GeneratedTestDraft {
  id: string;
  prompt: string;
  name: string;
  actions: RecordedAction[];
  status: GenerationStatus;
  createdAt: number;
  reviewedAt?: number;
  reviewNote?: string;
}

export class ReviewedTestGenerator {
  private drafts = new Map<string, GeneratedTestDraft>();
  generate(prompt: string): GeneratedTestDraft {
    if (!prompt.trim()) throw new Error('Generation prompt is required');
    const actions = this.parse(prompt);
    const draft: GeneratedTestDraft = {
      id: randomUUID(), prompt: prompt.trim(), name: this.nameFor(prompt),
      actions: validateRecordedActions(actions), status: 'draft', createdAt: Date.now(),
    };
    this.drafts.set(draft.id, draft);
    return this.clone(draft);
  }
  update(id: string, actions: RecordedAction[]): GeneratedTestDraft {
    const draft = this.requireDraft(id);
    if (draft.status !== 'draft') throw new Error('Only draft tests can be edited');
    draft.actions = validateRecordedActions(actions);
    return this.clone(draft);
  }
  approve(id: string, note?: string): GeneratedTestDraft {
    const draft = this.requireDraft(id);
    draft.status = 'approved'; draft.reviewedAt = Date.now(); draft.reviewNote = note;
    return this.clone(draft);
  }
  reject(id: string, note: string): GeneratedTestDraft {
    if (!note.trim()) throw new Error('A rejection note is required');
    const draft = this.requireDraft(id);
    draft.status = 'rejected'; draft.reviewedAt = Date.now(); draft.reviewNote = note;
    return this.clone(draft);
  }
  executableActions(id: string): RecordedAction[] {
    const draft = this.requireDraft(id);
    if (draft.status !== 'approved') throw new Error('Generated tests require explicit approval before execution');
    return validateRecordedActions(draft.actions);
  }
  list(): GeneratedTestDraft[] { return [...this.drafts.values()].map((draft) => this.clone(draft)); }
  private parse(prompt: string): RecordedAction[] {
    const timestamp = Date.now();
    const clauses = prompt.split(/\b(?:then|and then)\b|[.;]\s*/i).map((item) => item.trim()).filter(Boolean);
    return clauses.flatMap((clause, index): RecordedAction[] => {
      const navigate = clause.match(/(?:go|navigate|open)\s+(?:to\s+)?(https?:\/\/\S+|\/\S+)/i);
      if (navigate) return [{ type: 'navigate', selector: 'page', value: navigate[1], timestamp: timestamp + index }];
      const click = clause.match(/click\s+(?:on\s+)?(.+)/i);
      if (click) return [{ type: 'click', selector: this.selector(click[1]), timestamp: timestamp + index }];
      const input = clause.match(/(?:type|enter|fill)\s+["']?(.+?)["']?\s+(?:into|in)\s+(.+)/i);
      if (input) return [{ type: 'input', selector: this.selector(input[2]), value: input[1], timestamp: timestamp + index }];
      const visible = clause.match(/(?:verify|assert|expect)\s+(.+?)\s+(?:is\s+)?visible/i);
      if (visible) return [{
        type: 'assert', selector: this.selector(visible[1]), timestamp: timestamp + index,
        metadata: { kind: 'visible' },
      }];
      return [];
    });
  }
  private selector(value: string): string {
    const trimmed = value.trim().replace(/^["']|["']$/g, '');
    if (/^[#.[>]/.test(trimmed)) return trimmed;
    return `[data-testid="${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`;
  }
  private nameFor(prompt: string): string {
    return prompt.trim().split(/\s+/).slice(0, 8).join(' ').slice(0, 100);
  }
  private requireDraft(id: string): GeneratedTestDraft {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error(`Unknown generated test: ${id}`);
    return draft;
  }
  private clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
}
