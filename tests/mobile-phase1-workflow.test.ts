import { AndroidAutomationDriver } from '../src/drivers/appium/AndroidAutomationDriver';
import type { AppiumClient } from '../src/drivers/appium/AppiumClient';
import { createRecordingDocument, parseRecordingDocument } from '../src/recording/RecordingSchema';
import { Recorder } from '../src/recorder/Recorder';
import { Reporter } from '../src/reporter/Reporter';

describe('Phase 1 deterministic Android login workflow', () => {
  test('records, saves, reopens, replays, reports, and exports the login journey', async () => {
    const recorder = new Recorder();
    recorder.setActions([
      { type: 'input', selector: 'accessibility id=Username', value: 'ada', timestamp: 1 },
      { type: 'input', selector: 'id=org.chromation.fixture:id/password', value: 'correct-horse', timestamp: 2 },
      { type: 'tap', selector: 'accessibility id=Sign in', timestamp: 3 },
      { type: 'assert', selector: 'id=org.chromation.fixture:id/welcome', value: 'Welcome Ada', timestamp: 4,
        metadata: { kind: 'text-contains', expected: 'Welcome Ada' } },
    ]);
    const saved = createRecordingDocument('Android login', recorder.getActions(), 100, {
      platform: 'android', mode: 'native', name: 'Phase1 Emulator', appId: 'org.chromation.fixture',
    });
    const reopened = parseRecordingDocument(JSON.parse(JSON.stringify(saved)));

    let sessionId: string | null = null;
    const client = {
      getSessionId: jest.fn(() => sessionId),
      createSession: jest.fn(async () => { sessionId = 'phase1-session'; return { sessionId, capabilities: {} }; }),
      deleteSession: jest.fn(async () => { sessionId = null; }),
      command: jest.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
        if (method === 'POST' && path === '/element') {
          return { 'element-6066-11e4-a52e-4f735466cecf': String(body?.value || 'element') };
        }
        if (method === 'GET' && path.endsWith('/text')) return 'Welcome Ada';
        if (method === 'GET' && path === '/screenshot') return 'fixture-screenshot-base64';
        if (method === 'GET' && path === '/source') return '<hierarchy><android.widget.TextView text="Welcome Ada" /></hierarchy>';
        return null;
      }),
    } as unknown as AppiumClient;
    const driver = new AndroidAutomationDriver({
      capabilities: { 'appium:deviceName': reopened.target.name, 'appium:appPackage': reopened.target.appId },
    }, client);
    const execution = await driver.execute(reopened.actions);
    const reporter = new Reporter();
    const report = reporter.fromExecutionResult(reopened.name, execution);
    const exported = await recorder.exportScript('appium-typescript');

    expect(reopened.target).toMatchObject({ platform: 'android', mode: 'native' });
    expect(execution.status).toBe('passed');
    expect(execution.summary).toMatchObject({ total: 4, passed: 4, failed: 0 });
    expect(report.status).toBe('passed');
    expect(report.screenshots).toHaveLength(4);
    expect(report.attachments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'android-capabilities.json' }),
      expect.objectContaining({ name: 'android-final-hierarchy.xml' }),
    ]));
    expect(exported).toContain('org.chromation.fixture:id/password');
    expect(client.deleteSession).toHaveBeenCalledTimes(1);
  });
});
