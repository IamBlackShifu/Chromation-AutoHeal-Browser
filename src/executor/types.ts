import { RecordedAction } from '../recorder/Recorder';

export type AssertionKind = 'text-contains' | 'visible' | 'value-equals' | 'attribute-equals';

export interface AssertionPayload {
  kind: AssertionKind;
  expected?: string;
  attributeName?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
}

export interface EvidencePolicy {
  screenshotOnFailure: boolean;
  captureConsoleLogs: boolean;
  captureNetworkSummary: boolean;
  captureDomSnapshotOnFailure: boolean;
}

export interface ExecutionOptions {
  headless?: boolean;
  baseUrl?: string;
  continueOnFailure?: boolean;
  defaultStepTimeoutMs?: number;
  retryPolicy?: RetryPolicy;
  evidence?: EvidencePolicy;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  timestamp: number;
}

export interface StepFailureEvidence {
  screenshotBase64?: string;
  domSnapshot?: string;
}

export interface StepExecutionResult {
  index: number;
  action: RecordedAction;
  status: 'passed' | 'failed' | 'skipped';
  startedAt: number;
  endedAt: number;
  durationMs: number;
  retries: number;
  error?: string;
  evidence?: StepFailureEvidence;
}

export interface ExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface ExecutionResult {
  runId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status: 'passed' | 'failed';
  options: Required<Pick<ExecutionOptions, 'continueOnFailure' | 'defaultStepTimeoutMs'>>;
  steps: StepExecutionResult[];
  summary: ExecutionSummary;
  consoleLogs: string[];
  networkSummary: NetworkEntry[];
}
