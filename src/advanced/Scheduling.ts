import { randomUUID } from 'crypto';

export interface ScheduleDefinition {
  id: string;
  name: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: number;
  payload: unknown;
}
export class RunScheduler {
  private schedules = new Map<string, ScheduleDefinition>();
  create(name: string, intervalMinutes: number, payload: unknown, startAt = Date.now()): ScheduleDefinition {
    if (!name.trim()) throw new Error('Schedule name is required');
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) throw new Error('Schedule interval must be at least one minute');
    const schedule = {
      id: randomUUID(), name: name.trim(), intervalMinutes, enabled: true,
      nextRunAt: startAt, payload,
    };
    this.schedules.set(schedule.id, schedule);
    return { ...schedule };
  }
  due(now = Date.now()): ScheduleDefinition[] {
    return [...this.schedules.values()].filter((schedule) => schedule.enabled && schedule.nextRunAt <= now)
      .map((schedule) => ({ ...schedule }));
  }
  markRun(id: string, completedAt = Date.now()): ScheduleDefinition {
    const schedule = this.schedules.get(id);
    if (!schedule) throw new Error(`Unknown schedule: ${id}`);
    schedule.nextRunAt = completedAt + schedule.intervalMinutes * 60_000;
    return { ...schedule };
  }
  setEnabled(id: string, enabled: boolean): void {
    const schedule = this.schedules.get(id);
    if (!schedule) throw new Error(`Unknown schedule: ${id}`);
    schedule.enabled = enabled;
  }
  list(): ScheduleDefinition[] { return [...this.schedules.values()].map((item) => ({ ...item })); }
  export(): string { return JSON.stringify({ version: 1, schedules: this.list() }, null, 2); }
  import(value: string): void {
    const parsed = JSON.parse(value) as { version?: number; schedules?: ScheduleDefinition[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.schedules)) throw new Error('Unsupported schedule document');
    this.schedules = new Map(parsed.schedules.map((schedule) => [schedule.id, { ...schedule }]));
  }
  async runDue(
    execute: (schedule: ScheduleDefinition) => Promise<unknown>,
    now = Date.now()
  ): Promise<Array<{ schedule: ScheduleDefinition; result?: unknown; error?: string }>> {
    return Promise.all(this.due(now).map(async (schedule) => {
      try {
        const result = await execute(schedule);
        this.markRun(schedule.id, now);
        return { schedule, result };
      } catch (error) {
        this.markRun(schedule.id, now);
        return { schedule, error: error instanceof Error ? error.message : String(error) };
      }
    }));
  }
}
