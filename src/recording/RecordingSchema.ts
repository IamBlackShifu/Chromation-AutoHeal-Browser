import type { ActionType, AssertionMetadata, RecordedAction } from '../recorder/Recorder';

export const RECORDING_SCHEMA_VERSION = 1;
export const MAX_RECORDING_ACTIONS = 10_000;

const ACTION_TYPES = new Set<ActionType>([
  'click', 'input', 'select', 'drag', 'upload', 'navigate', 'assert', 'wait',
  'hover', 'keyboard', 'keypress', 'scroll', 'doubleclick', 'rightclick',
  'checkbox', 'radio', 'focus', 'dragstart', 'drop', 'submit', 'waitForPageLoad',
]);
const ASSERTION_KINDS = new Set<AssertionMetadata['kind']>([
  'text-contains', 'visible', 'value-equals', 'attribute-equals',
]);

export interface RecordingDocument {
  schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  name: string;
  actions: RecordedAction[];
  createdAt: number;
  updatedAt: number;
  actionCount: number;
}

export class RecordingValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid recording: ${issues.join('; ')}`);
    this.name = 'RecordingValidationError';
  }
}

export function validateRecordedAction(value: unknown, path = 'action'): RecordedAction {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new RecordingValidationError([`${path} must be an object`]);
  }

  if (typeof value.type !== 'string' || !ACTION_TYPES.has(value.type as ActionType)) {
    issues.push(`${path}.type is unsupported`);
  }
  if (typeof value.selector !== 'string') {
    issues.push(`${path}.selector must be a string`);
  } else if (value.selector.length > 4_096) {
    issues.push(`${path}.selector exceeds 4096 characters`);
  }
  if (!Number.isFinite(value.timestamp) || Number(value.timestamp) < 0) {
    issues.push(`${path}.timestamp must be a non-negative number`);
  }
  for (const field of ['value', 'extra', 'xpath'] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && typeof fieldValue !== 'string') {
      issues.push(`${path}.${field} must be a string`);
    }
  }

  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      issues.push(`${path}.metadata must be an object`);
    } else if (value.type === 'assert') {
      if (
        typeof value.metadata.kind !== 'string' ||
        !ASSERTION_KINDS.has(value.metadata.kind as AssertionMetadata['kind'])
      ) {
        issues.push(`${path}.metadata.kind is not a supported assertion`);
      }
    } else if (
      value.type === 'upload' &&
      'files' in value.metadata &&
      (
        !Array.isArray(value.metadata.files) ||
        value.metadata.files.length === 0 ||
        !value.metadata.files.every((file) => typeof file === 'string' && file.length > 0)
      )
    ) {
      issues.push(`${path}.metadata.files must be a non-empty string array`);
    }
  }

  if (value.locatorFingerprint !== undefined) {
    const fingerprint = value.locatorFingerprint;
    if (!isRecord(fingerprint)) {
      issues.push(`${path}.locatorFingerprint must be an object`);
    } else {
      if (typeof fingerprint.tagName !== 'string' || fingerprint.tagName.length === 0) {
        issues.push(`${path}.locatorFingerprint.tagName is required`);
      }
      if (!isStringRecord(fingerprint.attributes)) {
        issues.push(`${path}.locatorFingerprint.attributes must contain string values`);
      }
    }
  }

  if (issues.length > 0) {
    throw new RecordingValidationError(issues);
  }
  return value as unknown as RecordedAction;
}

export function validateRecordedActions(values: unknown): RecordedAction[] {
  if (!Array.isArray(values)) {
    throw new RecordingValidationError(['actions must be an array']);
  }
  if (values.length > MAX_RECORDING_ACTIONS) {
    throw new RecordingValidationError([`actions exceeds the ${MAX_RECORDING_ACTIONS} action limit`]);
  }
  return values.map((value, index) => validateRecordedAction(value, `actions[${index}]`));
}

export function createRecordingDocument(
  name: string,
  actions: unknown,
  timestamp = Date.now()
): RecordingDocument {
  const normalizedName = validateName(name);
  const validatedActions = validateRecordedActions(actions);
  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    name: normalizedName,
    actions: validatedActions,
    createdAt: timestamp,
    updatedAt: timestamp,
    actionCount: validatedActions.length,
  };
}

export function parseRecordingDocument(value: unknown): RecordingDocument {
  if (!isRecord(value)) {
    throw new RecordingValidationError(['recording must be an object']);
  }

  if (value.schemaVersion === undefined) {
    return createRecordingDocument(
      typeof value.name === 'string' ? value.name : 'Imported recording',
      value.actions,
      typeof value.timestamp === 'number' ? value.timestamp : Date.now()
    );
  }
  if (value.schemaVersion !== RECORDING_SCHEMA_VERSION) {
    throw new RecordingValidationError([
      `schemaVersion ${String(value.schemaVersion)} is not supported; expected ${RECORDING_SCHEMA_VERSION}`,
    ]);
  }

  const actions = validateRecordedActions(value.actions);
  const createdAt = Number(value.createdAt);
  const updatedAt = Number(value.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    throw new RecordingValidationError(['createdAt and updatedAt must be numbers']);
  }
  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    name: validateName(value.name),
    actions,
    createdAt,
    updatedAt,
    actionCount: actions.length,
  };
}

function validateName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RecordingValidationError(['name is required']);
  }
  if (value.trim().length > 200) {
    throw new RecordingValidationError(['name exceeds 200 characters']);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}
