import { AppiumClient, AppiumTransport } from '../src/drivers/appium/AppiumClient';

function response(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ value }) };
}

describe('AppiumClient', () => {
  test('creates, uses, and deletes a W3C session', async () => {
    const transport = jest.fn()
      .mockResolvedValueOnce(response({ sessionId: 'abc', capabilities: { platformName: 'Android' } }))
      .mockResolvedValueOnce(response('source'))
      .mockResolvedValueOnce(response(null)) as jest.MockedFunction<AppiumTransport>;
    const client = new AppiumClient('http://localhost:4723/', transport);

    await expect(client.createSession({ platformName: 'Android' })).resolves.toEqual({
      sessionId: 'abc', capabilities: { platformName: 'Android' },
    });
    await expect(client.command('GET', '/source')).resolves.toBe('source');
    await client.deleteSession();

    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:4723/session',
      'http://localhost:4723/session/abc/source',
      'http://localhost:4723/session/abc',
    ]);
  });

  test('surfaces Appium protocol errors with command context', async () => {
    const transport = jest.fn().mockResolvedValue(response({ message: 'device offline' }, 500));
    const client = new AppiumClient('http://localhost:4723', transport);
    await expect(client.createSession({})).rejects.toEqual(expect.objectContaining({
      message: 'device offline', status: 500, command: 'POST /session',
    }));
  });
});
