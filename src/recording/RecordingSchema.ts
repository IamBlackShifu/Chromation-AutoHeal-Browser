import type { ActionType, AssertionMetadata, RecordedAction } from '../recorder/Recorder';
import { AutomationTarget, DEFAULT_WEB_TARGET } from '../automation/types';

export const RECORDING_SCHEMA_VERSION = 2;
export const MAX_RECORDING_ACTIONS = 10_000;

const ACTION_TYPES = new Set<ActionType>([
  'click', 'input', 'select', 'drag', 'upload', 'navigate', 'assert', 'wait',
  'hover', 'keyboard', 'keypress', 'scroll', 'doubleclick', 'rightclick',
  'checkbox', 'radio', 'focus', 'dragstart', 'drop', 'submit', 'waitForPageLoad', 'scrape',
  'visual', 'api', 'mockNetwork', 'accessibility', 'performance',
  'plugin',
  'tap', 'longPress', 'swipe', 'back', 'rotate', 'clear', 'launchApp',
  'terminateApp', 'switchContext', 'hideKeyboard',
  'deepLink', 'acceptAlert', 'dismissAlert', 'grantPermission', 'revokePermission', 'resetApp', 'installApp',
  'clearAppData', 'mobileKey',
]);
const ASSERTION_KINDS = new Set<AssertionMetadata['kind']>([
  'text-contains', 'visible', 'enabled', 'value-equals', 'attribute-equals', 'count-equals',
  'url-equals', 'url-contains', 'title-equals', 'response-status',
]);
const WAIT_KINDS = new Set(['time', 'element', 'url', 'response', 'dom', 'page-load']);
const WAIT_STATES = new Set(['attached', 'detached', 'visible', 'hidden']);

export interface RecordingDocument {
  schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  name: string;
  actions: RecordedAction[];
  createdAt: number;
  updatedAt: number;
  actionCount: number;
  target: AutomationTarget;
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
    } else {
      if (value.metadata.breakpoint !== undefined && typeof value.metadata.breakpoint !== 'boolean') {
        issues.push(`${path}.metadata.breakpoint must be a boolean`);
      }
      if (value.metadata.disabled !== undefined && typeof value.metadata.disabled !== 'boolean') {
        issues.push(`${path}.metadata.disabled must be a boolean`);
      }
      if (
        value.metadata.timeoutMs !== undefined &&
        (!Number.isFinite(value.metadata.timeoutMs) || Number(value.metadata.timeoutMs) <= 0)
      ) {
        issues.push(`${path}.metadata.timeoutMs must be a positive number`);
      }
      if (
        value.metadata.maxRetries !== undefined &&
        (!Number.isInteger(value.metadata.maxRetries) || Number(value.metadata.maxRetries) < 0)
      ) {
        issues.push(`${path}.metadata.maxRetries must be a non-negative integer`);
      }
      if (
        value.metadata.retryDelayMs !== undefined &&
        (!Number.isFinite(value.metadata.retryDelayMs) || Number(value.metadata.retryDelayMs) < 0)
      ) {
        issues.push(`${path}.metadata.retryDelayMs must be a non-negative number`);
      }
      if (
        value.metadata.frameSelectors !== undefined &&
        (
          !Array.isArray(value.metadata.frameSelectors) ||
          value.metadata.frameSelectors.length === 0 ||
          value.metadata.frameSelectors.length > 10 ||
          !value.metadata.frameSelectors.every(
            (selector) => typeof selector === 'string' && selector.length > 0 && selector.length <= 4096
          )
        )
      ) {
        issues.push(`${path}.metadata.frameSelectors must contain 1 to 10 valid selectors`);
      }
      if (value.type === 'assert' && (
        typeof value.metadata.kind !== 'string' ||
        !ASSERTION_KINDS.has(value.metadata.kind as AssertionMetadata['kind'])
      )) {
        issues.push(`${path}.metadata.kind is not a supported assertion`);
      }
      if (
        value.type === 'wait' &&
        value.metadata.waitKind !== undefined &&
        (typeof value.metadata.waitKind !== 'string' || !WAIT_KINDS.has(value.metadata.waitKind))
      ) {
        issues.push(`${path}.metadata.waitKind is not supported`);
      }
      if (
        value.type === 'wait' &&
        value.metadata.state !== undefined &&
        (typeof value.metadata.state !== 'string' || !WAIT_STATES.has(value.metadata.state))
      ) {
        issues.push(`${path}.metadata.state is not supported`);
      }
      if (
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
      if (fingerprint.mobileContext !== undefined && !isValidMobileContext(fingerprint.mobileContext)) {
        issues.push(`${path}.locatorFingerprint.mobileContext is invalid`);
      }
      if (fingerprint.nodePath !== undefined && (
        !Array.isArray(fingerprint.nodePath) ||
        !fingerprint.nodePath.every((part) => Number.isInteger(part) && Number(part) >= 0)
      )) {
        issues.push(`${path}.locatorFingerprint.nodePath must contain non-negative integers`);
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
  timestamp = Date.now(),
  target?: AutomationTarget
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
    target: resolveRecordingTarget(target, validatedActions),
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
  if (value.schemaVersion !== 1 && value.schemaVersion !== RECORDING_SCHEMA_VERSION) {
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
    target: resolveRecordingTarget(value.target, actions),
  };
}

/**
 * Mobile recordings created before target metadata was reliable must never fall
 * through to a web executor. Action evidence is intentionally allowed to
 * upgrade a missing or incorrectly-web target to Android; the opposite is never
 * inferred because launching Appium is the higher-risk operation.
 */
export function resolveRecordingTarget(value: unknown, actions: RecordedAction[]): AutomationTarget {
  const explicit = value === undefined ? { ...DEFAULT_WEB_TARGET } : validateAutomationTarget(value);
  if (explicit.platform !== 'web' || !hasMobileActionEvidence(actions)) return explicit;
  const launch = actions.find((action) => action.type === 'launchApp');
  const launchMetadata = isRecord(launch?.metadata) ? launch.metadata : {};
  const context = actions.find((action) => action.locatorFingerprint?.mobileContext)?.locatorFingerprint?.mobileContext;
  return {
    platform: context?.platform || 'android',
    mode: context?.mode || 'native',
    automationName: context?.automationName || 'UiAutomator2',
    appId: context?.appId || launch?.value || undefined,
    appActivity: typeof launchMetadata.appActivity === 'string' ? launchMetadata.appActivity : undefined,
  };
}

function hasMobileActionEvidence(actions: RecordedAction[]): boolean {
  const mobileTypes = new Set([
    'tap', 'longPress', 'swipe', 'back', 'rotate', 'clear', 'launchApp', 'terminateApp',
    'switchContext', 'hideKeyboard', 'deepLink', 'acceptAlert', 'dismissAlert',
    'grantPermission', 'revokePermission', 'resetApp', 'installApp', 'clearAppData', 'mobileKey',
  ]);
  return actions.some((action) => {
    const metadata = isRecord(action.metadata) ? action.metadata : {};
    return (
    mobileTypes.has(action.type) ||
    metadata.mobileRecording === true ||
    Boolean(action.locatorFingerprint?.mobileContext)
    );
  });
}

function validateAutomationTarget(value: unknown): AutomationTarget {
  if (!isRecord(value)) {
    throw new RecordingValidationError(['target must be an object']);
  }
  const platforms = new Set(['web', 'android', 'ios']);
  const modes = new Set(['web', 'native', 'hybrid', 'mobileWeb']);
  if (typeof value.platform !== 'string' || !platforms.has(value.platform)) {
    throw new RecordingValidationError(['target.platform is unsupported']);
  }
  if (typeof value.mode !== 'string' || !modes.has(value.mode)) {
    throw new RecordingValidationError(['target.mode is unsupported']);
  }
  if (value.platform === 'web' && !['web', 'mobileWeb'].includes(value.mode)) {
    throw new RecordingValidationError(['web targets must use web or mobileWeb mode']);
  }
  if (value.platform !== 'web' && value.mode === 'web') {
    throw new RecordingValidationError(['mobile targets cannot use web mode']);
  }
  for (const field of ['name', 'appId', 'appActivity', 'deviceProfile', 'deviceUdid', 'automationName', 'serverUrl'] as const) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > 500)) {
      throw new RecordingValidationError([`target.${field} must be a string no longer than 500 characters`]);
    }
  }
  return value as unknown as AutomationTarget;
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

function isValidMobileContext(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.platform === 'android' || value.platform === 'ios') &&
    ['native', 'hybrid', 'mobileWeb'].includes(String(value.mode)) &&
    ['appId', 'automationName', 'contextName'].every((name) =>
      typeof value[name] === 'string' && String(value[name]).length > 0);
}
