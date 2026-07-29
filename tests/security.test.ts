import {
  REDACTED_VALUE,
  redactDOMSnapshot,
  redactText,
  redactURL,
  sanitizeRecordedAction,
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
});
