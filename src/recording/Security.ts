import type { RecordedAction } from '../recorder/Recorder';

export const REDACTED_VALUE = '[REDACTED]';

const SECRET_NAME = /(?:pass(?:word)?|secret|token|api[-_]?key|auth|credential|session|cookie)/i;
const SECRET_ASSIGNMENT = /((?:pass(?:word)?|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*)([^\s,;&]+)/gi;

export function sanitizeRecordedAction(action: RecordedAction): RecordedAction {
  const metadata = action.metadata as Record<string, unknown> | undefined;
  if (metadata?.sensitive === true || isSensitiveInput(action)) {
    return {
      ...action,
      value: action.value === undefined ? undefined : REDACTED_VALUE,
      metadata: { ...(metadata ?? {}), sensitive: true },
    };
  }
  return action;
}

export function redactText(value: string): string {
  return value.replace(SECRET_ASSIGNMENT, `$1${REDACTED_VALUE}`);
}

export function redactURL(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_NAME.test(key)) url.searchParams.set(key, REDACTED_VALUE);
    }
    return url.toString();
  } catch {
    return redactText(value);
  }
}

export function redactDOMSnapshot(value: string): string {
  return redactText(value)
    .replace(
      /(<input\b[^>]*\btype\s*=\s*["']password["'][^>]*\bvalue\s*=\s*["'])[^"']*(["'])/gi,
      `$1${REDACTED_VALUE}$2`
    )
    .replace(
      /(<input\b[^>]*\b(?:name|id)\s*=\s*["'][^"']*(?:password|token|secret|api[-_]?key)[^"']*["'][^>]*\bvalue\s*=\s*["'])[^"']*(["'])/gi,
      `$1${REDACTED_VALUE}$2`
    );
}

function isSensitiveInput(action: RecordedAction): boolean {
  if (action.type !== 'input') return false;
  const attributes = action.locatorFingerprint?.attributes ?? {};
  return (
    attributes.type?.toLowerCase() === 'password' ||
    SECRET_NAME.test(action.selector) ||
    Object.entries(attributes).some(([name, value]) =>
      SECRET_NAME.test(name) || (['name', 'id', 'autocomplete'].includes(name) && SECRET_NAME.test(value))
    )
  );
}
