import {
  REDACTED_VALUE,
  redactDOMSnapshot,
  redactMobileHierarchy,
  redactStructuredValue,
  redactText,
  redactURL,
  sanitizeRecordedAction,
  screenshotRedactionSelectors,
  SENSITIVE_WEB_ELEMENT_SELECTOR,
} from '../src/recording/Security';

describe('recording and evidence security', () => {
  test('masks password input values at recording ingestion', () => {
    const action = sanitizeRecordedAction({
      type: 'input',
      selector: '#password',
      value: 'super-secret',
      timestamp: Date.now(),
      locatorFingerprint: {
        tagName: 'input',
        attributes: { type: 'password', name: 'password' },
      },
    });

    expect(action.value).toBe(REDACTED_VALUE);
    expect(action.metadata).toEqual(expect.objectContaining({ sensitive: true }));
  });

  test('does not mask ordinary text input', () => {
    const action = sanitizeRecordedAction({
      type: 'input',
      selector: '#display-name',
      value: 'Ada',
      timestamp: Date.now(),
    });
    expect(action.value).toBe('Ada');
  });

  test('redacts secret-like URL parameters, logs, and password DOM values', () => {
    expect(redactURL('https://example.test/callback?token=abc&next=home')).toContain(
      `token=${encodeURIComponent(REDACTED_VALUE)}`
    );
    expect(redactText('authorization=Bearer-secret')).not.toContain('Bearer-secret');
    expect(redactDOMSnapshot('<input type="password" value="visible-secret">'))
      .toContain(`value="${REDACTED_VALUE}"`);
  });

  test('automatically masks sensitive web fields while preserving configured selectors', () => {
    const selectors = screenshotRedactionSelectors(true, ['.account-number', '  .account-number  ', '']);

    expect(selectors).toEqual([SENSITIVE_WEB_ELEMENT_SELECTOR, '.account-number']);
    expect(SENSITIVE_WEB_ELEMENT_SELECTOR).toContain('input[type="password" i]');
    expect(SENSITIVE_WEB_ELEMENT_SELECTOR).toContain('input[autocomplete~="cc-number" i]');
    expect(SENSITIVE_WEB_ELEMENT_SELECTOR).toContain('[data-sensitive="true" i]');
  });

  test('allows automatic masking to be disabled without dropping explicit masks', () => {
    expect(screenshotRedactionSelectors(false, ['.customer-defined-secret']))
      .toEqual(['.customer-defined-secret']);
  });

  test('redacts structured secrets, authorization schemes, JWTs, and private keys', () => {
    const jwt = 'eyJheader.eyJpayload.signature';
    const structured = redactStructuredValue({
      authorization: 'Bearer live-access-token',
      nested: { clientSecret: 'client-value', url: 'https://example.test/?token=query-value' },
      message: `Basic dXNlcjpwYXNz ${jwt}`,
    });

    expect(JSON.stringify(structured)).not.toContain('live-access-token');
    expect(JSON.stringify(structured)).not.toContain('client-value');
    expect(JSON.stringify(structured)).not.toContain('query-value');
    expect(JSON.stringify(structured)).not.toContain('dXNlcjpwYXNz');
    expect(JSON.stringify(structured)).not.toContain(jwt);
    expect(redactText('private_key=-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'))
      .not.toContain('\nabc\n');
  });

  test('redacts values from password-like mobile hierarchy nodes', () => {
    const hierarchy = '<node resource-id="org.example:id/password" password="true" text="visible-secret" content-desc="Password field" bounds="[0,0][10,10]" />';
    const redacted = redactMobileHierarchy(hierarchy);

    expect(redacted).not.toContain('visible-secret');
    expect(redacted).toContain(`text="${REDACTED_VALUE}"`);
    expect(redacted).toContain(`content-desc="${REDACTED_VALUE}"`);
    expect(redacted).toContain('bounds="[0,0][10,10]"');
  });
});
