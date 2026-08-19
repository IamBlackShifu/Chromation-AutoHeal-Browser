import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { AppiumProcessManager } from '../src/drivers/appium/AppiumProcessManager';
import { PortAllocator } from '../src/drivers/appium/PortAllocator';
import { AndroidDeviceCommands } from '../src/drivers/appium/AndroidDeviceCommands';
import { FallbackDeviceStream, ScreenshotPollingStream, type DeviceStream } from '../src/mobile/streaming/DeviceStream';
import { HierarchyRefreshPolicy } from '../src/mobile/streaming/HierarchyRefreshPolicy';
import { Recorder } from '../src/recorder/Recorder';
import { ScrcpyProcessManager } from '../src/mobile/streaming/ScrcpyProcessManager';
import { AndroidDeviceDiscovery, parseAdbDevices } from '../src/mobile/diagnostics/AndroidDeviceDiscovery';

describe('mobile Phase 2.1 hardening', () => {
  it('discovers ready, unauthorized, emulator, and network Android targets with friendly labels', async () => {
    const output = `List of devices attached\nKKES250227044644 device product:KINGKONG_ES_EEA model:KINGKONG_ES device:KINGKONG_ES transport_id:11\nemulator-5554 offline transport_id:2\n192.168.1.12:5555 unauthorized product:pixel model:Pixel_7\n`;
    const devices = parseAdbDevices(output);
    expect(devices[0]).toMatchObject({ serial: 'KKES250227044644', model: 'KINGKONG_ES', connection: 'usb', ready: true });
    expect(devices[0].label).toBe('KINGKONG ES · USB · Ready');
    expect(devices[1]).toMatchObject({ connection: 'emulator', state: 'offline', ready: false });
    expect(devices[2]).toMatchObject({ connection: 'network', state: 'unauthorized', ready: false });
    const discovery = new AndroidDeviceDiscovery(async () => output);
    await expect(discovery.list()).resolves.toEqual(devices);
  });
  it('reserves unique Android auxiliary port bundles and releases them', async () => {
    const allocator = new PortAllocator();
    const first = await allocator.reserveAndroidBundle();
    const second = await allocator.reserveAndroidBundle();
    expect(new Set([...Object.values(first.ports), ...Object.values(second.ports)]).size).toBe(8);
    await Promise.all([first.release(), second.release()]);
  });

  it('owns, reports, and stops only managed Appium processes', async () => {
    const children: FakeChild[] = [];
    const factory = (() => { const child = new FakeChild(); children.push(child); return child; }) as never;
    const manager = new AppiumProcessManager(new PortAllocator(), factory, async () => true);
    const instance = await manager.start();
    expect(instance.owned).toBe(true);
    expect(instance.status).toBe('ready');
    expect(new Set(Object.values(instance.ports)).size).toBe(4);
    expect(manager.list()).toHaveLength(1);
    await manager.stop(instance.id, 10);
    expect(children[0].killed).toBe(true);
    expect(manager.list()).toHaveLength(0);
    expect(await manager.stop('external-process')).toBe(false);
  });

  it('certifies two concurrent managed sessions receive collision-free port bundles', async () => {
    const manager = new AppiumProcessManager(new PortAllocator(), (() => new FakeChild()) as never, async () => true);
    const [first, second] = await Promise.all([manager.start(), manager.start()]);
    expect(first.endpoint).not.toBe(second.endpoint);
    expect(new Set([...Object.values(first.ports), ...Object.values(second.ports)]).size).toBe(8);
    expect(manager.list()).toHaveLength(2);
    await manager.stopAll();
    expect(manager.list()).toHaveLength(0);
  });

  it('starts one native scrcpy control mirror per explicit device and owns cleanup', async () => {
    const children: ScrcpyFakeChild[] = [];
    const manager = new ScrcpyProcessManager(((_command: string, args: string[]) => {
      const child = new ScrcpyFakeChild(); children.push(child); child.args = args; queueMicrotask(() => child.emit('spawn')); return child;
    }) as never);
    const first = await manager.start({ serial: 'emulator-5554' });
    const same = await manager.start({ serial: 'emulator-5554' });
    expect(same.id).toBe(first.id);
    expect(children).toHaveLength(1);
    expect(children[0].args).toEqual(expect.arrayContaining(['--serial', 'emulator-5554', '--no-audio']));
    expect(await manager.stop(first.id)).toBe(true);
    await expect(manager.start({ serial: 'bad serial' })).rejects.toThrow('valid explicit');
  });

  it('validates destructive reset targeting and preserves diagnostics', async () => {
    const calls: string[][] = [];
    const commands = new AndroidDeviceCommands(async (args) => { calls.push(args); return { stdout: 'Success\n', stderr: '' }; });
    await expect(commands.clearAppData({ serial: 'emulator-5554', appPackage: 'com.example.app', confirmed: false })).rejects.toThrow('confirmation');
    const result = await commands.clearAppData({ serial: 'emulator-5554', appPackage: 'com.example.app', confirmed: true });
    expect(calls[0]).toEqual(['-s', 'emulator-5554', 'shell', 'pm', 'clear', 'com.example.app']);
    expect(result).toMatchObject({ cleared: true, serial: 'emulator-5554', appPackage: 'com.example.app' });
  });

  it('falls back between stream transports and avoids overlapping screenshot pulls', async () => {
    const frames: string[] = [];
    const broken: DeviceStream = {
      transport: 'scrcpy', start: async () => { throw new Error('not installed'); }, pause() {}, resume() {}, stop: async () => undefined,
      getStatus: () => ({ transport: 'scrcpy', state: 'failed' }),
    };
    const fallback = new FallbackDeviceStream([
      () => broken,
      () => new ScreenshotPollingStream(async () => 'png', 10_000),
    ]);
    await fallback.start((frame) => frames.push(String(frame.data)));
    expect(frames).toEqual(['png']);
    expect(fallback.getStatus()).toMatchObject({ transport: 'screenshot', state: 'live' });
    expect(fallback.getStatus().fallbackReason).toContain('scrcpy');
    await fallback.stop();
  });

  it('debounces hover hierarchy refreshes while refreshing explicit actions immediately', async () => {
    jest.useFakeTimers();
    const reasons: string[] = [];
    const policy = new HierarchyRefreshPolicy(async (reason) => { reasons.push(reason); }, 50);
    void policy.request('hover');
    void policy.request('hover');
    await policy.request('action');
    await jest.advanceTimersByTimeAsync(50);
    expect(reasons).toEqual(['action', 'hover']);
    policy.dispose();
    jest.useRealTimers();
  });

  it('exports equivalent mobile key and WebView workflows for TypeScript, Java, and Python', async () => {
    const recorder = new Recorder();
    recorder.setActions([
      { type: 'switchContext', selector: '', value: 'WEBVIEW', timestamp: 1, metadata: { timeoutMs: 5000 } },
      { type: 'mobileKey', selector: '', value: 'Search', timestamp: 2 },
      { type: 'tap', selector: 'accessibility id=Submit', timestamp: 3 },
    ]);
    const [typescript, java, python] = await Promise.all([
      recorder.exportScript('appium-typescript'), recorder.exportScript('appium-java'), recorder.exportScript('appium-python'),
    ]);
    expect(typescript).toContain("mobile: pressKey");
    expect(typescript).toContain('getContexts');
    expect(java).toContain('mobile: pressKey');
    expect(java).toContain('getContextHandles');
    expect(python).toContain('mobile: pressKey');
    expect(python).toContain('driver.contexts');
  });
});

class FakeChild extends EventEmitter {
  pid = 1234;
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.exitCode = 0;
    queueMicrotask(() => this.emit('exit', 0, null));
    return true;
  }
}

class ScrcpyFakeChild extends FakeChild { args: string[] = []; }
