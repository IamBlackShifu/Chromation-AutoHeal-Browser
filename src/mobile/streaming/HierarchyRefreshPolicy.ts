export type HierarchyRefreshReason = 'pause' | 'hover' | 'manual' | 'action';

export class HierarchyRefreshPolicy {
  private lastRefreshAt = 0;
  private hoverTimer: NodeJS.Timeout | null = null;

  constructor(private readonly refresh: (reason: HierarchyRefreshReason) => Promise<void>, private readonly hoverDebounceMs = 180) {}

  request(reason: HierarchyRefreshReason): Promise<void> {
    if (reason !== 'hover') return this.run(reason);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    return new Promise<void>((resolve, reject) => {
      this.hoverTimer = setTimeout(() => {
        this.hoverTimer = null;
        this.run('hover').then(resolve, reject);
      }, this.hoverDebounceMs);
    });
  }

  getAge(now = Date.now()): number { return this.lastRefreshAt ? Math.max(0, now - this.lastRefreshAt) : Number.POSITIVE_INFINITY; }
  dispose(): void { if (this.hoverTimer) clearTimeout(this.hoverTimer); this.hoverTimer = null; }

  private async run(reason: HierarchyRefreshReason): Promise<void> {
    await this.refresh(reason);
    this.lastRefreshAt = Date.now();
  }
}
