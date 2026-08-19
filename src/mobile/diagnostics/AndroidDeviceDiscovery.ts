import { execFile } from 'child_process';

export type AndroidDeviceState = 'device' | 'unauthorized' | 'offline' | 'unknown';
export interface ConnectedAndroidDevice {
  serial: string;
  state: AndroidDeviceState;
  model?: string;
  product?: string;
  device?: string;
  transportId?: string;
  connection: 'usb' | 'emulator' | 'network';
  ready: boolean;
  label: string;
}

export type AdbDevicesRunner = () => Promise<string>;

export function parseAdbDevices(output: string): ConnectedAndroidDevice[] {
  return output.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [serial = '', stateValue = 'unknown', ...details] = line.split(/\s+/);
    const metadata = Object.fromEntries(details.map((entry) => {
      const separator = entry.indexOf(':'); return separator > 0 ? [entry.slice(0, separator), entry.slice(separator + 1)] : [entry, ''];
    }));
    const state: AndroidDeviceState = ['device', 'unauthorized', 'offline'].includes(stateValue) ? stateValue as AndroidDeviceState : 'unknown';
    const connection = serial.startsWith('emulator-') ? 'emulator' : /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(serial) ? 'network' : 'usb';
    const name = metadata.model?.replace(/_/g, ' ') || metadata.device?.replace(/_/g, ' ') || serial;
    return {
      serial, state, model: metadata.model, product: metadata.product, device: metadata.device,
      transportId: metadata.transport_id, connection, ready: state === 'device',
      label: `${name} · ${connection === 'usb' ? 'USB' : connection} · ${state === 'device' ? 'Ready' : state}`,
    };
  });
}

export class AndroidDeviceDiscovery {
  constructor(private readonly runner: AdbDevicesRunner = AndroidDeviceDiscovery.runAdb) {}
  async list(): Promise<ConnectedAndroidDevice[]> { return parseAdbDevices(await this.runner()); }
  private static runAdb(): Promise<string> {
    return new Promise((resolve, reject) => execFile('adb', ['devices', '-l'], { encoding: 'utf8', timeout: 8_000, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message))) : resolve(stdout)));
  }
}
