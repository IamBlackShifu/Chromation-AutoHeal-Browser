import { AndroidAutomationDriver } from '../src/drivers/appium/AndroidAutomationDriver';
import type { AppiumClient } from '../src/drivers/appium/AppiumClient';

describe('AndroidAutomationDriver', () => {
  test('executes basic native actions and cleans up the session', async () => {
    const client = {
      getSessionId: jest.fn().mockReturnValue(null),
      createSession: jest.fn().mockResolvedValue({ sessionId: 's1', capabilities: {} }),
      command: jest.fn().mockImplementation((method: string, path: string, body?: { value?: string }) => {
        if (method === 'POST' && path === '/element') return Promise.resolve({
          'element-6066-11e4-a52e-4f735466cecf': body?.value?.includes('login') ? 'login' : 'username',
        });
        if (method === 'GET' && path === '/screenshot') return Promise.resolve('step-screenshot');
        return Promise.resolve(null);
      }),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({
      capabilities: { 'appium:deviceName': 'Pixel' },
    }, client);

    const result = await driver.execute([
      { type: 'input', selector: 'accessibility id=username', value: 'Ada', timestamp: 1 },
      { type: 'tap', selector: 'id=org.example:id/login', timestamp: 2 },
    ]);

    expect(result.status).toBe('passed');
    expect(result.summary.passed).toBe(2);
    expect(client.createSession).toHaveBeenCalledWith(expect.objectContaining({
      platformName: 'Android', 'appium:automationName': 'UiAutomator2',
    }), expect.any(AbortSignal));
    expect(client.command).toHaveBeenCalledWith('POST', '/element/username/value', {
      text: 'Ada', value: ['A', 'd', 'a'],
    }, expect.any(AbortSignal));
    expect(client.deleteSession).toHaveBeenCalled();
    expect(result.steps.every((step) => step.evidence?.screenshotBase64 === 'step-screenshot')).toBe(true);
    expect(result.attachments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'android-capabilities.json' }),
    ]));
  });

  test('reuses a connected authoring session without creating or deleting it', async () => {
    const client = {
      getSessionId: jest.fn().mockReturnValue('live-session'),
      createSession: jest.fn(),
      deleteSession: jest.fn(),
      command: jest.fn().mockImplementation((method: string, path: string) => {
        if (method === 'POST' && path === '/element') return Promise.resolve({ 'element-6066-11e4-a52e-4f735466cecf': 'login' });
        if (method === 'GET' && path === '/screenshot') return Promise.resolve('live-shot');
        if (method === 'GET' && path === '/source') return Promise.resolve('<hierarchy />');
        return Promise.resolve(null);
      }),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel' } }, client);
    const result = await driver.execute([{ type: 'tap', selector: 'accessibility id=Sign in', timestamp: 1 }]);
    expect(result.status).toBe('passed');
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.deleteSession).not.toHaveBeenCalled();
    expect(result.attachments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'android-final-hierarchy.xml' }),
    ]));
  });

  test('fails preflight before opening a session for unsupported actions', async () => {
    const client = { createSession: jest.fn() } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({
      capabilities: { 'appium:deviceName': 'Pixel' },
    }, client);

    await expect(driver.execute([
      { type: 'navigate', selector: 'window', value: 'https://example.com', timestamp: 1 },
    ])).rejects.toThrow('Android driver does not support: navigate');
    expect(client.createSession).not.toHaveBeenCalled();
  });

  test('requires a device name', async () => {
    const driver = new AndroidAutomationDriver({ capabilities: {} });
    await expect(driver.execute([])).rejects.toThrow('appium:deviceName is required');
  });

  test('combines page source and screenshot for hierarchy inspection', async () => {
    const client = {
      command: jest.fn()
        .mockResolvedValueOnce('<hierarchy><android.widget.Button content-desc="Save" /></hierarchy>')
        .mockResolvedValueOnce('base64-image'),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({
      capabilities: { 'appium:deviceName': 'Pixel' },
    }, client);

    const inspection = await driver.inspectHierarchy();
    expect(inspection.screenshotBase64).toBe('base64-image');
    expect(inspection.elements[1]).toEqual(expect.objectContaining({ label: 'Save' }));
    expect(client.command).toHaveBeenCalledWith('GET', '/source', undefined, undefined);
    expect(client.command).toHaveBeenCalledWith('GET', '/screenshot', undefined, undefined);
  });

  test('opens a persistent inspection session and reports live context', async () => {
    const client = {
      getSessionId: jest.fn().mockReturnValueOnce(null).mockReturnValue('session-1'),
      createSession: jest.fn().mockResolvedValue({ sessionId: 'session-1', capabilities: { platformName: 'Android' } }),
      command: jest.fn()
        .mockResolvedValueOnce('NATIVE_APP')
        .mockResolvedValueOnce(['NATIVE_APP', 'WEBVIEW_org.example'])
        .mockResolvedValueOnce('LoginActivity')
        .mockResolvedValueOnce('PORTRAIT'),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel' } }, client);

    await expect(driver.connect()).resolves.toEqual(expect.objectContaining({
      sessionId: 'session-1', context: 'NATIVE_APP', contexts: ['NATIVE_APP', 'WEBVIEW_org.example'],
      screen: 'LoginActivity', orientation: 'PORTRAIT',
    }));
    expect(driver.isConnected()).toBe(true);
    await driver.disconnect();
    expect(client.deleteSession).toHaveBeenCalled();
  });

  test('executes an action through an already connected live session', async () => {
    const client = {
      getSessionId: jest.fn().mockReturnValue('session-1'),
      command: jest.fn()
        .mockResolvedValueOnce({ 'element-6066-11e4-a52e-4f735466cecf': 'save-button' })
        .mockResolvedValueOnce(null),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel' } }, client);

    await driver.executeLiveAction({ type: 'tap', selector: 'accessibility id=Save', timestamp: 1 });
    expect(client.command).toHaveBeenCalledWith('POST', '/element/save-button/click', {}, expect.any(AbortSignal));
  });

  test('uses the Appium 3 device route for application activation', async () => {
    const client = { getSessionId: jest.fn().mockReturnValue('session-1'), command: jest.fn().mockResolvedValue(null) } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel' } }, client);
    await driver.executeLiveAction({ type: 'launchApp', selector: 'device', value: 'com.example.app', timestamp: 1 });
    expect(client.command).toHaveBeenCalledWith('POST', '/appium/device/activate_app', { appId: 'com.example.app' }, expect.any(AbortSignal));
  });

  test('starts the configured Android activity when launch metadata is available', async () => {
    const client = { getSessionId: jest.fn().mockReturnValue('session-1'), command: jest.fn().mockResolvedValue(null) } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: {
      'appium:deviceName': 'Pixel', 'appium:appPackage': 'com.example.app', 'appium:appActivity': '.MainActivity',
    } }, client);
    await driver.executeLiveAction({ type: 'launchApp', selector: 'device', value: 'com.example.app', timestamp: 1,
      metadata: { appActivity: '.MainActivity' } });
    expect(client.command).toHaveBeenCalledWith('POST', '/execute/sync', {
      script: 'mobile: startActivity', args: [{ intent: 'com.example.app/.MainActivity', wait: true, stop: true }],
    }, expect.any(AbortSignal));
  });

  test('clears application data before deterministic launch when reset is enabled', async () => {
    const client = { getSessionId: jest.fn().mockReturnValue('session-1'), command: jest.fn().mockResolvedValue(null) } as unknown as AppiumClient;
    const clearAppData = jest.fn().mockResolvedValue({ cleared: true });
    const driver = new AndroidAutomationDriver({ capabilities: {
      'appium:deviceName': 'Pixel', 'appium:udid': 'emulator-5554', 'appium:appPackage': 'com.example.app', 'appium:appActivity': '.MainActivity',
    }, deviceCommands: { clearAppData } as any }, client);
    await driver.executeLiveAction({ type: 'launchApp', selector: 'device', value: 'com.example.app', timestamp: 1,
      metadata: { appActivity: '.MainActivity', resetAppState: true } });
    expect(clearAppData).toHaveBeenCalledWith({ serial: 'emulator-5554', appPackage: 'com.example.app', confirmed: true }, expect.any(AbortSignal));
  });

  test('passes Android UiAutomator selectors through to Appium', async () => {
    const client = {
      getSessionId: jest.fn().mockReturnValue('session-1'),
      command: jest.fn()
        .mockResolvedValueOnce({ 'element-6066-11e4-a52e-4f735466cecf': 'login-button' })
        .mockResolvedValueOnce(null),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel' } }, client);

    await driver.executeLiveAction({
      type: 'tap',
      selector: '-android uiautomator=new UiSelector().text("Log in")',
      timestamp: 1,
    });
    expect(client.command).toHaveBeenCalledWith('POST', '/element', {
      using: '-android uiautomator', value: 'new UiSelector().text("Log in")',
    }, expect.any(AbortSignal));
  });

  test('switches hybrid contexts and rotates the live device', async () => {
    const client = {
      getSessionId: jest.fn().mockReturnValue('session-1'),
      command: jest.fn().mockResolvedValue(null),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel' } }, client);

    await driver.executeLiveAction({ type: 'switchContext', selector: 'device', value: 'WEBVIEW_org.example', timestamp: 1 });
    await driver.executeLiveAction({ type: 'rotate', selector: 'device', value: 'LANDSCAPE', timestamp: 2 });
    expect(client.command).toHaveBeenCalledWith('POST', '/context', { name: 'WEBVIEW_org.example' }, expect.any(AbortSignal));
    expect(client.command).toHaveBeenCalledWith('POST', '/orientation', { orientation: 'LANDSCAPE' }, expect.any(AbortSignal));
  });
});
