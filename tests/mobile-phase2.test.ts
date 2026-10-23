import { AndroidAutomationDriver } from '../src/drivers/appium/AndroidAutomationDriver';
import type { AppiumClient } from '../src/drivers/appium/AppiumClient';
import { ANDROID_ACTION_MATRIX, preflightAndroidActions, validateMobileProfile } from '../src/mobile/diagnostics/MobileReadiness';

describe('Android Phase 2 capabilities', () => {
  test('validates reusable local profiles and preflights fragile or unsupported steps', () => {
    expect(validateMobileProfile({ id: 'pixel-api-36', name: 'Pixel API 36', platform: 'android', mode: 'native', serverUrl: 'http://127.0.0.1:4723', deviceName: 'Pixel' }))
      .toMatchObject({ serverUrl: 'http://127.0.0.1:4723', deviceName: 'Pixel' });
    expect(() => validateMobileProfile({ id: 'bad', name: 'Bad', platform: 'android', mode: 'native', serverUrl: 'https://remote.test', deviceName: 'Pixel' })).toThrow(/local HTTP/);
    expect(() => validateMobileProfile({ id: 'secret', name: 'Secret', platform: 'android', mode: 'native', serverUrl: 'http://localhost:4723', deviceName: 'Pixel', capabilities: { 'appium:accessToken': 'unsafe' } })).toThrow(/encrypted environment vault/);
    const result = preflightAndroidActions([
      { type: 'tap', selector: 'coordinates=10,20', timestamp: 1 },
      { type: 'tap', selector: 'xpath=//Button', timestamp: 2 },
    ]);
    expect(result.supported).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(ANDROID_ACTION_MATRIX.deepLink).toBe('supported');
  });

  test('maps gestures, lifecycle, alerts, permissions, waits, retries, and evidence to Appium', async () => {
    let session: string | null = null;
    let flaky = true;
    const client = {
      getSessionId: jest.fn(() => session),
      createSession: jest.fn(async () => { session = 'phase2'; return { sessionId: session, capabilities: {} }; }),
      deleteSession: jest.fn(async () => { session = null; }),
      command: jest.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
        if (method === 'POST' && path === '/element') {
          if (body?.value === 'Retry' && flaky) { flaky = false; throw new Error('transient lookup'); }
          return { 'element-6066-11e4-a52e-4f735466cecf': 'element' };
        }
        if (method === 'GET' && path === '/context') return 'NATIVE_APP';
        if (method === 'GET' && path === '/screenshot') return 'phase2-shot';
        if (method === 'GET' && path === '/source') return '<hierarchy />';
        if (method === 'POST' && path === '/log') return [{ level: 'INFO', message: 'fixture ready' }];
        return null;
      }),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({ capabilities: { 'appium:deviceName': 'Pixel', 'appium:appPackage': 'org.example' } }, client);
    const execution = await driver.execute([
      { type: 'swipe', selector: 'device', timestamp: 1, metadata: { startX: 100, startY: 500, endX: 100, endY: 100, durationMs: 350 } },
      { type: 'longPress', selector: 'accessibility id=Menu', timestamp: 2 },
      { type: 'deepLink', selector: 'device', value: 'example://profile', timestamp: 3 },
      { type: 'grantPermission', selector: 'device', value: 'android.permission.CAMERA', timestamp: 4 },
      { type: 'acceptAlert', selector: 'device', timestamp: 5 },
      { type: 'tap', selector: 'accessibility id=Retry', timestamp: 6, metadata: { maxRetries: 1, retryDelayMs: 0 } },
      { type: 'resetApp', selector: 'device', timestamp: 7 },
      { type: 'installApp', selector: 'device', value: 'C:\\fixtures\\app.apk', timestamp: 8 },
      { type: 'upload', selector: 'device', timestamp: 9, metadata: { files: [require.resolve('../package.json')], remotePath: '/sdcard/Download/package.json' } },
    ]);
    expect(execution.summary).toMatchObject({ passed: 9, failed: 0 });
    expect(client.command).toHaveBeenCalledWith('POST', '/actions', expect.any(Object), expect.any(AbortSignal));
    expect(client.command).toHaveBeenCalledWith('POST', '/execute/sync', expect.objectContaining({ script: 'mobile: deepLink' }), expect.any(AbortSignal));
    expect(client.command).toHaveBeenCalledWith('POST', '/alert/accept', {}, expect.any(AbortSignal));
    expect(client.command).toHaveBeenCalledWith('POST', '/appium/device/install_app', { appPath: 'C:\\fixtures\\app.apk' }, expect.any(AbortSignal));
    expect(client.command).toHaveBeenCalledWith('POST', '/appium/device/push_file', expect.objectContaining({ path: '/sdcard/Download/package.json' }), expect.any(AbortSignal));
    expect(execution.steps[5].retries).toBe(1);
    expect(execution.attachments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'android-logcat.json' }),
      expect.objectContaining({ name: 'android-final-hierarchy.xml' }),
    ]));
  });
});
