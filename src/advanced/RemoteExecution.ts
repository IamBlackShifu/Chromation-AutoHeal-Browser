import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export interface RemoteJob { id: string; payload: unknown; createdAt: number; attempts: number; }
export interface RemoteWorker { id: string; capabilities: string[]; lastSeenAt: number; busy: boolean; }
export interface SynchronizedResult { jobId: string; workerId: string; status: 'passed' | 'failed'; payload: unknown; completedAt: number; }

export class RemoteWorkerCoordinator {
  private workers = new Map<string, RemoteWorker>();
  private queue: RemoteJob[] = [];
  private results = new Map<string, SynchronizedResult>();
  constructor(private readonly sharedSecret: string) {
    if (sharedSecret.length < 16) throw new Error('Remote worker shared secret must be at least 16 characters');
  }
  register(id: string, capabilities: string[], signature: string): RemoteWorker {
    this.verify(`register:${id}`, signature);
    const worker = { id, capabilities: [...new Set(capabilities)].sort(), lastSeenAt: Date.now(), busy: false };
    this.workers.set(id, worker);
    return { ...worker };
  }
  enqueue(payload: unknown): RemoteJob {
    const job = { id: randomUUID(), payload, createdAt: Date.now(), attempts: 0 };
    this.queue.push(job);
    return { ...job };
  }
  claim(workerId: string, requiredCapabilities: string[] = []): RemoteJob | null {
    const worker = this.workers.get(workerId);
    if (!worker || worker.busy || !requiredCapabilities.every((item) => worker.capabilities.includes(item))) return null;
    const job = this.queue.shift();
    if (!job) return null;
    job.attempts++; worker.busy = true; worker.lastSeenAt = Date.now();
    return { ...job };
  }
  synchronize(result: Omit<SynchronizedResult, 'completedAt'>, signature: string): SynchronizedResult {
    this.verify(`result:${result.jobId}:${result.workerId}:${result.status}`, signature);
    const worker = this.workers.get(result.workerId);
    if (!worker) throw new Error(`Unknown remote worker: ${result.workerId}`);
    const synchronized = { ...result, completedAt: Date.now() };
    worker.busy = false; worker.lastSeenAt = Date.now();
    this.results.set(result.jobId, synchronized);
    return { ...synchronized };
  }
  getResult(jobId: string): SynchronizedResult | undefined {
    const result = this.results.get(jobId);
    return result ? { ...result } : undefined;
  }
  sign(message: string): string { return createHmac('sha256', this.sharedSecret).update(message).digest('hex'); }
  private verify(message: string, signature: string): void {
    const expected = Buffer.from(this.sign(message), 'hex');
    const actual = Buffer.from(signature, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid remote worker signature');
  }
}

export class CIResultSynchronizer {
  private pending: SynchronizedResult[] = [];
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly request: typeof fetch = fetch
  ) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error('CI synchronization requires HTTPS or localhost');
    }
  }
  async synchronize(result: SynchronizedResult): Promise<boolean> {
    try {
      const response = await this.request(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify(result),
      });
      if (!response.ok) throw new Error(`CI endpoint returned ${response.status}`);
      return true;
    } catch {
      this.pending.push(result);
      return false;
    }
  }
  async retryPending(): Promise<{ synchronized: number; remaining: number }> {
    const queued = this.pending.splice(0);
    let synchronized = 0;
    for (const result of queued) {
      if (await this.synchronize(result)) synchronized++;
    }
    return { synchronized, remaining: this.pending.length };
  }
  pendingCount(): number { return this.pending.length; }
}
