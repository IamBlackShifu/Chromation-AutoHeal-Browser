import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type ScrcpyState = 'starting' | 'live' | 'stopping' | 'stopped' | 'failed';
export interface ScrcpyMirrorInfo {
  id: string;
  serial: string;
  pid?: number;
  state: ScrcpyState;
  startedAt: number;
  title: string;
  logs: string[];
  error?: string;
}

export interface StartScrcpyOptions {
  serial: string;
  executable?: string;
  title?: string;
  maxSize?: number;
  maxFps?: number;
  bitRateMbps?: number;
  stayAwake?: boolean;
  turnScreenOff?: boolean;
}

type ProcessFactory = typeof spawn;
const SERIAL_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class ScrcpyProcessManager {
  private readonly mirrors = new Map<string, { info: ScrcpyMirrorInfo; process: ChildProcess }>();

  constructor(private readonly processFactory: ProcessFactory = spawn) {}

  async start(options: StartScrcpyOptions): Promise<ScrcpyMirrorInfo> {
    const serial = options.serial.trim();
    if (!SERIAL_PATTERN.test(serial)) throw new Error('A valid explicit Android serial is required for scrcpy');
    const existing = [...this.mirrors.values()].find(({ info }) => info.serial === serial && ['starting', 'live'].includes(info.state));
    if (existing) return this.snapshot(existing.info);
    const title = (options.title?.trim() || `OmniFlow QA · ${serial}`).slice(0, 120);
    const args = ['--serial', serial, '--window-title', title, '--no-audio', '--max-size', String(this.bound(options.maxSize, 480, 3840, 1280)), '--max-fps', String(this.bound(options.maxFps, 15, 120, 60)), '--video-bit-rate', `${this.bound(options.bitRateMbps, 1, 50, 8)}M`];
    if (options.stayAwake !== false) args.push('--stay-awake');
    if (options.turnScreenOff === true) args.push('--turn-screen-off');
    const child = this.processFactory(options.executable ?? this.resolveExecutable(), args, { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const info: ScrcpyMirrorInfo = { id: `scrcpy-${Date.now()}-${serial}`, serial, pid: child.pid, state: 'starting', startedAt: Date.now(), title, logs: [] };
    const append = (source: string, chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
        info.logs.push(`[${source}] ${line}`);
        if (/ERROR|failed/i.test(line)) info.error = line;
        if (/INFO.*(?:Renderer|Initial texture|Device)/i.test(line)) info.state = 'live';
      }
      if (info.logs.length > 200) info.logs.splice(0, info.logs.length - 200);
    };
    child.stdout?.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.once('spawn', () => { info.state = 'live'; });
    child.once('error', (error) => { info.state = 'failed'; info.error = error.message; });
    child.once('exit', (code, signal) => {
      if (info.state !== 'stopping') { info.state = code === 0 ? 'stopped' : 'failed'; if (code !== 0) info.error ??= `scrcpy exited (${code ?? signal ?? 'unknown'})`; }
      else info.state = 'stopped';
      this.mirrors.delete(info.id);
    });
    this.mirrors.set(info.id, { info, process: child });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250);
      child.once('error', (error) => { clearTimeout(timer); reject(new Error(`Unable to start scrcpy: ${error.message}`)); });
      child.once('spawn', () => { clearTimeout(timer); resolve(); });
    });
    return this.snapshot(info);
  }

  list(): ScrcpyMirrorInfo[] { return [...this.mirrors.values()].map(({ info }) => this.snapshot(info)); }
  async stop(id: string): Promise<boolean> {
    const entry = this.mirrors.get(id); if (!entry) return false;
    entry.info.state = 'stopping'; entry.process.kill(); this.mirrors.delete(id); return true;
  }
  async stopAll(): Promise<void> { await Promise.all([...this.mirrors.keys()].map((id) => this.stop(id))); }
  private snapshot(info: ScrcpyMirrorInfo): ScrcpyMirrorInfo { return { ...info, logs: [...info.logs] }; }
  private bound(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
    const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
  }
  private resolveExecutable(): string {
    if (process.platform !== 'win32') return 'scrcpy';
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return 'scrcpy.exe';
    const packages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    try {
      const packageDirectory = fs.readdirSync(packages).find((name) => name.startsWith('Genymobile.scrcpy_'));
      if (!packageDirectory) return 'scrcpy.exe';
      const root = path.join(packages, packageDirectory);
      const versionDirectory = fs.readdirSync(root, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.startsWith('scrcpy-'));
      const executable = versionDirectory ? path.join(root, versionDirectory.name, 'scrcpy.exe') : path.join(root, 'scrcpy.exe');
      return fs.existsSync(executable) ? executable : 'scrcpy.exe';
    } catch { return 'scrcpy.exe'; }
  }
}
