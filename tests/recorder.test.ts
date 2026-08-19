import { Recorder, RecordedAction } from '../src/recorder/Recorder';

describe('Recorder', () => {
  let recorder: Recorder;

  beforeEach(() => {
    recorder = new Recorder();
  });

  test('should initialize correctly', () => {
    expect(recorder).toBeDefined();
    expect(recorder.isActive()).toBe(false);
  });

  test('should start and stop recording', () => {
    recorder.startRecording('manual');
    expect(recorder.isActive()).toBe(true);

    recorder.stopRecording();
    expect(recorder.isActive()).toBe(false);
  });

  test('should record actions', () => {
    recorder.startRecording();
    
    const action: RecordedAction = {
      type: 'click',
      selector: '#submit-button',
      timestamp: Date.now(),
    };
    
    recorder.recordAction(action);
    const actions = recorder.getActions();
    
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('click');
  });

  test('should export script', async () => {
    recorder.startRecording();
    
    const action: RecordedAction = {
      type: 'input',
      selector: '#username',
      value: 'testuser',
      timestamp: Date.now(),
    };
    
    recorder.recordAction(action);
    const script = await recorder.exportScript('selenium-python');
    
    expect(script).toBeDefined();
    expect(typeof script).toBe('string');
  });

  test('should export playwright assertions and page load waits', async () => {
    recorder.startRecording();

    recorder.recordAction({
      type: 'waitForPageLoad',
      selector: 'window',
      timestamp: Date.now(),
    });

    recorder.recordAction({
      type: 'assert',
      selector: '.success-message',
      timestamp: Date.now(),
      metadata: {
        kind: 'text-contains',
        expected: 'Success',
      },
    });

    const script = await recorder.exportScript('playwright');

    expect(script).toContain("waitForLoadState('domcontentloaded')");
    expect(script).toContain("Assertion failed: expected text to contain Success");
    expect(script).toContain("page.locator('.success-message')");
  });

  test('should clear actions', () => {
    recorder.startRecording();
    recorder.recordAction({
      type: 'click',
      selector: '#button',
      timestamp: Date.now(),
    });
    
    recorder.clearActions();
    expect(recorder.getActions()).toHaveLength(0);
  });

  test('rejects malformed imported actions', () => {
    expect(() => recorder.setActions([
      { type: 'click', selector: '#valid', timestamp: -1 },
    ])).toThrow('timestamp must be a non-negative number');
  });

  test('updates the stored final input action across bridge-style clones', () => {
    recorder.startRecording();
    recorder.recordAction({
      type: 'input',
      selector: '#name',
      value: 'a',
      timestamp: 100,
    });

    const clonedAction = { ...recorder.getActions()[0], value: 'complete text', timestamp: 200 };
    expect(recorder.updateLastAction(clonedAction)).toBe(true);

    expect(recorder.getActions()).toHaveLength(1);
    expect(recorder.getActions()[0].value).toBe('complete text');
    expect(recorder.getActions()[0].timestamp).toBe(200);
  });

  test('does not update a missing final action', () => {
    expect(recorder.updateLastAction({
      type: 'input',
      selector: '#name',
      value: 'text',
      timestamp: 100,
    })).toBe(false);
  });

  test('edits, duplicates, disables, reorders, and deletes steps safely', () => {
    recorder.setActions([
      { type: 'click', selector: '#first', timestamp: 1 },
      { type: 'input', selector: '#second', value: 'old', timestamp: 2 },
    ]);

    recorder.updateAction(1, {
      type: 'input',
      selector: '#second',
      value: 'updated',
      timestamp: 3,
    });
    recorder.duplicateAction(0);
    expect(recorder.getActions()).toHaveLength(3);
    expect(recorder.getActions()[1].selector).toBe('#first');

    expect(recorder.moveAction(2, 0)).toBe(true);
    expect(recorder.getActions()[0].value).toBe('updated');

    recorder.setActionDisabled(1, true);
    expect(recorder.getActions()[1].metadata).toEqual(expect.objectContaining({ disabled: true }));

    const deleted = recorder.deleteAction(2);
    expect(deleted.selector).toBe('#first');
    expect(recorder.getActions()).toHaveLength(2);
    expect(() => recorder.deleteAction(99)).toThrow('out of range');
  });

  test('omits disabled steps and exports extended Playwright assertions', async () => {
    recorder.setActions([
      { type: 'click', selector: '#disabled', timestamp: 1, metadata: { disabled: true } },
      {
        type: 'assert',
        selector: '.row',
        timestamp: 2,
        metadata: { kind: 'count-equals', expected: '3' },
      },
      {
        type: 'assert',
        selector: 'window',
        timestamp: 3,
        metadata: { kind: 'url-contains', expected: '/dashboard' },
      },
      {
        type: 'assert',
        selector: 'window',
        timestamp: 4,
        metadata: { kind: 'response-status', expected: '200', responseUrl: '/api/items' },
      },
    ]);

    const script = await recorder.exportScript('playwright');
    expect(script).not.toContain('#disabled');
    expect(script).toContain("page.locator('.row').count()");
    expect(script).toContain("page.url().includes('/dashboard')");
    expect(script).toContain("response.url().includes('/api/items')");
  });

  test.each([
    ['appium-typescript', "from 'webdriverio'"],
    ['playwright', 'playwright'],
    ['selenium-js', 'selenium-webdriver'],
    ['cypress', 'describe('],
    ['puppeteer', 'puppeteer'],
    ['cdp', 'chrome-remote-interface'],
    ['selenium-python', 'webdriver.Chrome'],
    ['selenium-java', 'ChromeDriver'],
  ] as const)('generates a non-placeholder executable %s export', async (format, marker) => {
    recorder.setActions([
      { type: 'navigate', selector: 'page', value: 'https://example.test', timestamp: 1 },
      { type: 'click', selector: '#submit', timestamp: 2 },
      { type: 'input', selector: '#name', value: 'Ada', timestamp: 3 },
    ]);
    const script = await recorder.exportScript(format);
    expect(script).toContain(marker);
    expect(script).not.toMatch(/placeholder|TODO/i);
    if (!format.startsWith('selenium-p') && format !== 'selenium-java' && format !== 'appium-typescript') {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  test('exports locator-aware Android login steps as Appium TypeScript', async () => {
    recorder.setActions([
      { type: 'input', selector: 'accessibility id=Username', value: 'ada', timestamp: 1 },
      { type: 'input', selector: 'id=org.example:id/password', value: 'secret', timestamp: 2 },
      { type: 'tap', selector: 'accessibility id=Sign in', timestamp: 3 },
      { type: 'assert', selector: 'id=org.example:id/welcome', metadata: { kind: 'text-contains', expected: 'Welcome' }, timestamp: 4 },
    ]);
    const script = await recorder.exportScript('appium-typescript');
    expect(script).toContain("'appium:automationName': 'UiAutomator2'");
    expect(script).toContain('accessibility id=Username');
    expect(script).toContain('await element.setValue');
    expect(script).toContain('await element.click');
    expect(script).toContain('Expected');
    expect(script).toContain('await driver.deleteSession()');
  });
});
