export type DeviceStreamTransport = 'scrcpy' | 'mjpeg' | 'screenshot';
export type DeviceStreamState = 'idle' | 'starting' | 'live' | 'paused' | 'failed' | 'stopped';

export interface DeviceFrame {
  data: Uint8Array | string;
  contentType: string;
  width?: number;
  height?: number;
  capturedAt: number;
}

export interface DeviceStreamStatus {
  transport: DeviceStreamTransport;
  state: DeviceStreamState;
  latencyMs?: number;
  lastFrameAt?: number;
  fallbackReason?: string;
}

export interface DeviceStream {
  readonly transport: DeviceStreamTransport;
  start(onFrame: (frame: DeviceFrame) => void): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
  getStatus(): DeviceStreamStatus;
}

export class FallbackDeviceStream implements DeviceStream {
  readonly transport: DeviceStreamTransport = 'screenshot';
  private active: DeviceStream | null = null;
  private status: DeviceStreamStatus = { transport: 'screenshot', state: 'idle' };

  constructor(private readonly candidates: Array<() => DeviceStream>) {
    if (candidates.length === 0) throw new Error('At least one stream transport is required');
  }

  async start(onFrame: (frame: DeviceFrame) => void): Promise<void> {
    const failures: string[] = [];
    for (const create of this.candidates) {
      const candidate = create();
      this.status = { transport: candidate.transport, state: 'starting', fallbackReason: failures[failures.length - 1] };
      try {
        await candidate.start((frame) => {
          const now = Date.now();
          this.status = { transport: candidate.transport, state: 'live', lastFrameAt: now, latencyMs: Math.max(0, now - frame.capturedAt), fallbackReason: failures[failures.length - 1] };
          onFrame(frame);
        });
        this.active = candidate;
        this.status = { ...this.status, state: 'live' };
        return;
      } catch (error) {
        await candidate.stop().catch(() => undefined);
        failures.push(`${candidate.transport}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.status = { transport: this.status.transport, state: 'failed', fallbackReason: failures.join('; ') };
    throw new Error(`No device stream transport is available: ${failures.join('; ')}`);
  }

  pause(): void { this.active?.pause(); this.status = { ...this.status, state: 'paused' }; }
  resume(): void { this.active?.resume(); this.status = { ...this.status, state: 'live' }; }
  async stop(): Promise<void> { await this.active?.stop(); this.active = null; this.status = { ...this.status, state: 'stopped' }; }
  getStatus(): DeviceStreamStatus { return { ...this.status }; }
}

export class ScreenshotPollingStream implements DeviceStream {
  readonly transport = 'screenshot' as const;
  private timer: NodeJS.Timeout | null = null;
  private state: DeviceStreamState = 'idle';
  private latestFrameAt?: number;
  private fetching = false;

  constructor(private readonly capture: () => Promise<string>, private readonly intervalMs = 500) {}

  async start(onFrame: (frame: DeviceFrame) => void): Promise<void> {
    if (this.timer) return;
    this.state = 'starting';
    const tick = async () => {
      if (this.state !== 'live' || this.fetching) return;
      this.fetching = true;
      try {
        const capturedAt = Date.now();
        const data = await this.capture();
        this.latestFrameAt = Date.now();
        onFrame({ data, contentType: 'image/png', capturedAt });
      } finally { this.fetching = false; }
    };
    this.state = 'live';
    await tick();
    this.timer = setInterval(() => { void tick(); }, this.intervalMs);
  }

  pause(): void { if (this.state === 'live') this.state = 'paused'; }
  resume(): void { if (this.state === 'paused') this.state = 'live'; }
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); this.timer = null; this.state = 'stopped'; }
  getStatus(): DeviceStreamStatus { return { transport: this.transport, state: this.state, lastFrameAt: this.latestFrameAt }; }
}

export class MjpegDeviceStream implements DeviceStream {
  readonly transport = 'mjpeg' as const;
  private controller: AbortController | null = null;
  private state: DeviceStreamState = 'idle';
  private lastFrameAt?: number;

  constructor(private readonly endpoint: string, private readonly request: typeof fetch = fetch) {}

  async start(onFrame: (frame: DeviceFrame) => void): Promise<void> {
    if (this.controller) return;
    this.controller = new AbortController();
    this.state = 'starting';
    const response = await this.request(this.endpoint, { signal: this.controller.signal });
    if (!response.ok || !response.body) throw new Error(`MJPEG endpoint returned HTTP ${response.status}`);
    this.state = 'live';
    const reader = response.body.getReader();
    let pending = new Uint8Array();
    const pump = async () => {
      try {
        while (this.controller && !this.controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          pending = concatBytes(pending, new Uint8Array(value));
          let start = findBytes(pending, [0xff, 0xd8]);
          let end = start >= 0 ? findBytes(pending, [0xff, 0xd9], start + 2) : -1;
          while (start >= 0 && end >= 0) {
            const frame = pending.slice(start, end + 2);
            pending = pending.slice(end + 2);
            if (this.state === 'live') { this.lastFrameAt = Date.now(); onFrame({ data: frame, contentType: 'image/jpeg', capturedAt: this.lastFrameAt }); }
            start = findBytes(pending, [0xff, 0xd8]); end = start >= 0 ? findBytes(pending, [0xff, 0xd9], start + 2) : -1;
          }
          if (pending.length > 8_000_000) pending = pending.slice(-1_000_000);
        }
      } catch { if (!this.controller?.signal.aborted) this.state = 'failed'; }
    };
    void pump();
  }

  pause(): void { if (this.state === 'live') this.state = 'paused'; }
  resume(): void { if (this.state === 'paused') this.state = 'live'; }
  async stop(): Promise<void> { this.controller?.abort(); this.controller = null; this.state = 'stopped'; }
  getStatus(): DeviceStreamStatus { return { transport: this.transport, state: this.state, lastFrameAt: this.lastFrameAt }; }
}

const concatBytes = (left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(left.length + right.length); output.set(left); output.set(right, left.length); return output;
};
const findBytes = (input: Uint8Array<ArrayBufferLike>, needle: number[], from = 0): number => {
  for (let index = from; index <= input.length - needle.length; index++) if (needle.every((byte, offset) => input[index + offset] === byte)) return index;
  return -1;
};
