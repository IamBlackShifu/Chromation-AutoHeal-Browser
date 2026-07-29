import { RecordedAction } from '../recorder/Recorder';
import type { HealingResult } from '../healing/HealingEngine';

export type AssertionKind =
  | 'text-contains'
  | 'visible'
  | 'value-equals'
  | 'attribute-equals'
  | 'count-equals'
  | 'url-equals'
  | 'url-contains'
  | 'title-equals'
  | 'response-status';

export interface AssertionPayload {
  kind: AssertionKind;
  expected?: string;
  attributeName?: string;
  responseUrl?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
}

export type ExecutionState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'passed'
  | 'failed'
  | 'cancelled';

export interface ExecutionStateSnapshot {
  state: ExecutionState;
  runId?: string;
  currentStep: number;
  totalSteps: number;
  breakpointStep?: number;
  reason?: string;
  updatedAt: number;
}

export interface StepExecutionPolicy {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  breakpoint?: boolean;
  disabled?: boolean;
}

export type DialogPolicy = 'dismiss' | 'accept' | 'fail';
export type ResourcePolicy = 'allow' | 'deny' | 'fail';

export interface WaitPayload {
  waitKind?: 'time' | 'element' | 'url' | 'response' | 'dom' | 'page-load';
  expected?: string;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}

export interface EvidencePolicy {
  screenshotOnFailure: boolean;
  captureConsoleLogs: boolean;
  captureNetworkSummary: boolean;
  captureDomSnapshotOnFailure: boolean;
  redactSecrets?: boolean;
  redactSelectors?: string[];
  captureTrace?: boolean;
  captureVideo?: boolean;
  artifactDirectory?: string;
  retentionLimit?: number;
  captureNetworkBodies?: boolean;
  maxNetworkBodyBytes?: number;
}

export interface ExecutionOptions {
  headless?: boolean;
  channel?: string;
  executablePath?: string;
  baseUrl?: string;
  continueOnFailure?: boolean;
  defaultStepTimeoutMs?: number;
  globalTimeoutMs?: number;
  dialogPolicy?: DialogPolicy;
  downloadPolicy?: ResourcePolicy;
  popupPolicy?: ResourcePolicy;
  retryPolicy?: RetryPolicy;
  evidence?: EvidencePolicy;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  timestamp: number;
  contentType?: string;
  body?: string;
}

export interface StepFailureEvidence {
  screenshotBase64?: string;
  screenshotError?: string;
  domSnapshot?: string;
}

export interface StepExecutionResult {
  index: number;
  action: RecordedAction;
  status: 'passed' | 'failed' | 'skipped' | 'cancelled';
  startedAt: number;
  endedAt: number;
  durationMs: number;
  retries: number;
  healing?: HealingResult;
  error?: string;
  evidence?: StepFailureEvidence;
  expected?: string;
  actual?: string;
}

export interface ExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cancelled?: number;
  durationMs: number;
}

export interface ExecutionResult {
  runId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status: 'passed' | 'failed';
  runError?: string;
  options: Required<Pick<ExecutionOptions, 'continueOnFailure' | 'defaultStepTimeoutMs' | 'globalTimeoutMs'>>;
  steps: StepExecutionResult[];
  summary: ExecutionSummary;
  consoleLogs: string[];
  networkSummary: NetworkEntry[];
  finalState?: ExecutionState;
  attachments?: Array<{ name: string; contentType: string; path?: string; data?: string }>;
}
