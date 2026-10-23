import { execFile } from 'child_process';

export interface ClearAppDataRequest {
  serial: string;
  appPackage: string;
  confirmed: boolean;
}

export interface ClearAppDataResult {
  serial: string;
  appPackage: string;
  durationMs: number;
  output: string;
  cleared: boolean;
}

export type AdbRunner = (args: string[], signal?: AbortSignal) => Promise<{ stdout: string; stderr: string }>;

const TOKEN = /^[A-Za-z0-9._:-]+$/;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;

export class AndroidDeviceCommands {
  constructor(private readonly runner: AdbRunner = AndroidDeviceCommands.execAdb) {}

  async clearAppData(request: ClearAppDataRequest, signal?: AbortSignal): Promise<ClearAppDataResult> {
    if (!request.confirmed) throw new Error('Clear app data requires explicit confirmation');
    if (!TOKEN.test(request.serial)) throw new Error('Invalid Android device serial');
    if (!PACKAGE.test(request.appPackage)) throw new Error('Invalid Android application package');
    const startedAt = Date.now();
    const result = await this.runner(['-s', request.serial, 'shell', 'pm', 'clear', request.appPackage], signal);
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (!/^success$/im.test(output)) throw new Error(`Android app-data reset failed: ${output || 'no response from adb'}`);
    return { serial: request.serial, appPackage: request.appPackage, durationMs: Date.now() - startedAt, output, cleared: true };
  }

  private static execAdb(args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile('adb', args, { windowsHide: true, signal }, (error, stdout, stderr) => {
        if (error) reject(error); else resolve({ stdout, stderr });
      });
    });
  }
}
