import { ChildProcess, spawn } from 'child_process';
import { AndroidPortBundle, PortAllocator, PortBundleLease } from './PortAllocator';

export type ManagedAppiumStatus = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface ManagedAppiumInstance {
  id: string;
  owned: true;
  pid?: number;
  endpoint: string;
  basePath: string;
  ports: AndroidPortBundle;
  status: ManagedAppiumStatus;
  startedAt: number;
  logs: string[];
  error?: string;
}

export interface StartAppiumOptions {
  executable?: string;
  basePath?: string;
  startupTimeoutMs?: number;
  extraArgs?: string[];
}

type ProcessFactory = typeof spawn;

export class AppiumProcessManager {
  private readonly processes = new Map<string, { info: ManagedAppiumInstance; process: ChildProcess; lease: PortBundleLease }>();

  constructor(
    private readonly allocator = new PortAllocator(),
    private readonly processFactory: ProcessFactory = spawn,
    private readonly healthCheck: (endpoint: string, signal?: AbortSignal) => Promise<boolean> = AppiumProcessManager.defaultHealthCheck
  ) {}

  async start(options: StartAppiumOptions = {}): Promise<ManagedAppiumInstance> {
    const lease = await this.allocator.reserveAndroidBundle();
    const basePath = this.normalizeBasePath(options.basePath ?? '/');
    await lease.releasePort('appium');
    const endpoint = `http://127.0.0.1:${lease.ports.appium}${basePath === '/' ? '' : basePath}`;
    const args = ['--address', '127.0.0.1', '--port', String(lease.ports.appium), '--base-path', basePath, ...(options.extraArgs ?? [])];
    const child = this.processFactory(options.executable ?? (process.platform === 'win32' ? 'appium.cmd' : 'appium'), args, {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
    });
    const info: ManagedAppiumInstance = {
      id: `appium-${Date.now()}-${lease.ports.appium}`, owned: true, pid: child.pid,
      endpoint, basePath, ports: lease.ports, status: 'starting', startedAt: Date.now(), logs: [],
    };
    const append = (source: string, chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) info.logs.push(`[${source}] ${line}`);
      if (info.logs.length > 500) info.logs.splice(0, info.logs.length - 500);
    };
    child.stdout?.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.once('exit', (code, signal) => {
      if (info.status !== 'stopping' && info.status !== 'stopped') {
        info.status = 'failed'; info.error = `Appium exited unexpectedly (${code ?? signal ?? 'unknown'})`;
      } else info.status = 'stopped';
      lease.release().catch(() => undefined);
      this.processes.delete(info.id);
    });
    this.processes.set(info.id, { info, process: child, lease });
    try {
      await this.waitUntilReady(info.endpoint, options.startupTimeoutMs ?? 20_000);
      info.status = 'ready';
      return this.snapshot(info);
    } catch (error) {
      info.status = 'failed'; info.error = error instanceof Error ? error.message : String(error);
      await this.stop(info.id).catch(() => undefined);
      throw new Error(`Managed Appium failed to start: ${info.error}`);
    }
  }

  list(): ManagedAppiumInstance[] { return [...this.processes.values()].map(({ info }) => this.snapshot(info)); }
  get(id: string): ManagedAppiumInstance | undefined {
    const entry = this.processes.get(id); return entry ? this.snapshot(entry.info) : undefined;
  }

  async stop(id: string, graceMs = 3_000): Promise<boolean> {
    const entry = this.processes.get(id);
    if (!entry) return false;
    entry.info.status = 'stopping';
    const exited = new Promise<void>((resolve) => entry.process.once('exit', () => resolve()));
    entry.process.kill();
    const graceful = await Promise.race([exited.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), graceMs))]);
    if (!graceful && entry.process.exitCode === null) entry.process.kill('SIGKILL');
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 1_000))]);
    await entry.lease.release();
    entry.info.status = 'stopped';
    this.processes.delete(id);
    return true;
  }

  async stopAll(): Promise<void> { await Promise.all([...this.processes.keys()].map((id) => this.stop(id))); }

  private async waitUntilReady(endpoint: string, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      while (!controller.signal.aborted) {
        if (await this.healthCheck(endpoint, controller.signal).catch(() => false)) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(`readiness timed out after ${timeoutMs}ms`);
    } finally { clearTimeout(timer); }
  }

  private normalizeBasePath(value: string): string {
    const path = `/${value}`.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    return path || '/';
  }
  private snapshot(info: ManagedAppiumInstance): ManagedAppiumInstance { return { ...info, ports: { ...info.ports }, logs: [...info.logs] }; }
  private static async defaultHealthCheck(endpoint: string, signal?: AbortSignal): Promise<boolean> {
    const response = await fetch(`${endpoint}/status`, { signal });
    if (!response.ok) return false;
    const body = await response.json() as { value?: { ready?: boolean } };
    return body.value?.ready !== false;
  }
}
