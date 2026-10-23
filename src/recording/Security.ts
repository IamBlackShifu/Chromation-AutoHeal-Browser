import type { RecordedAction } from '../recorder/Recorder';

export const REDACTED_VALUE = '[REDACTED]';

/**
 * Browser fields that should be obscured in captured evidence by default.
 *
 * Keep this selector declarative so Playwright can resolve it immediately before
 * capture. That catches sensitive fields added after the recording was authored,
 * without reading their values into OmniFlow.
 */
export const SENSITIVE_WEB_ELEMENT_SELECTOR = [
  'input[type="password" i]',
  'input[autocomplete~="current-password" i]',
  'input[autocomplete~="new-password" i]',
  'input[autocomplete~="one-time-code" i]',
  'input[autocomplete~="cc-number" i]',
  'input[autocomplete~="cc-csc" i]',
  'input[name*="password" i]',
  'input[id*="password" i]',
  'input[name*="passwd" i]',
  'input[id*="passwd" i]',
  'input[name*="secret" i]',
  'input[id*="secret" i]',
  'input[name*="token" i]',
  'input[id*="token" i]',
  'textarea[name*="secret" i]',
  'textarea[id*="secret" i]',
  'textarea[name*="token" i]',
  'textarea[id*="token" i]',
  '[data-sensitive="true" i]',
  '[data-private="true" i]',
  '[data-redact="true" i]',
].join(', ');

const SECRET_NAME = /(?:pass(?:word)?|secret|token|api[-_]?key|auth(?:orization)?|credential|session|cookie|private[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token|otp|pin|cvv|cvc)/i;
const SECRET_ASSIGNMENT = /((?:["']?)(?:pass(?:word)?|secret|token|api[-_]?key|authorization|set-cookie|cookie|private[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token|otp|pin|cvv|cvc)(?:["']?)\s*[:=]\s*(?:["']?))([^"'\s,;&}]+)/gi;
const BEARER_CREDENTIAL = /(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const BASIC_CREDENTIAL = /(\bBasic\s+)[A-Za-z0-9+/=]+/gi;
const JWT_CREDENTIAL = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PRIVATE_KEY = /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g;

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
  return value
    .replace(PRIVATE_KEY, `$1\n${REDACTED_VALUE}\n$2`)
    .replace(BEARER_CREDENTIAL, `$1${REDACTED_VALUE}`)
    .replace(BASIC_CREDENTIAL, `$1${REDACTED_VALUE}`)
    .replace(JWT_CREDENTIAL, REDACTED_VALUE)
    .replace(SECRET_ASSIGNMENT, `$1${REDACTED_VALUE}`);
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

export function redactMobileHierarchy(value: string): string {
  return redactText(value).replace(/<[^>]+>/g, (tag) => {
    const sensitive = /\bpassword\s*=\s*["']true["']/i.test(tag) ||
      /\b(?:resource-id|name|label|content-desc)\s*=\s*["'][^"']*(?:password|passwd|secret|token|otp|pin|cvv|cvc)[^"']*["']/i.test(tag);
    if (!sensitive) return tag;
    return tag.replace(
      /\b(text|value|content-desc|label)\s*=\s*(["'])[^"']*\2/gi,
      (_match, name: string, quote: string) => `${name}=${quote}${REDACTED_VALUE}${quote}`
    );
  });
}

export function isSensitiveFieldName(name: string): boolean {
  return SECRET_NAME.test(name);
}

export function redactStructuredValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (isSensitiveFieldName(key) && value !== undefined && value !== null) return REDACTED_VALUE;
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? redactURL(value) : redactText(value);
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactStructuredValue(item, key, seen));
  return Object.fromEntries(Object.entries(value).map(([name, item]) =>
    [name, redactStructuredValue(item, name, seen)]));
}

export function screenshotRedactionSelectors(
  redactSecrets: boolean | undefined,
  configuredSelectors: string[] = []
): string[] {
  const selectors = configuredSelectors
    .filter((selector): selector is string => typeof selector === 'string')
    .map((selector) => selector.trim())
    .filter(Boolean);

  if (redactSecrets !== false) selectors.unshift(SENSITIVE_WEB_ELEMENT_SELECTOR);
  return [...new Set(selectors)];
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
