import type { ExecutionReport } from './Reporter';

export interface HistoryQuery {
  text?: string;
  status?: ExecutionReport['status'];
  from?: number;
  to?: number;
}
export interface RunAnalytics {
  runs: number;
  completedRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  stepPassRate: number;
  averageDuration: number;
  healingFrequency: number;
  flakySteps: Array<{ name: string; failures: number; passes: number; failureRate: number }>;
  durationTrend: Array<{ runId: string; timestamp: number; duration: number }>;
  failureTrend: Array<{ runId: string; timestamp: number; failed: number }>;
}

export class RunHistoryStore {
  private reports: ExecutionReport[] = [];
  constructor(private readonly limit = 500) {}
  add(report: ExecutionReport): void {
    this.reports.unshift(JSON.parse(JSON.stringify(report)) as ExecutionReport);
    this.reports = this.reports.slice(0, this.limit);
  }
  search(query: HistoryQuery = {}): ExecutionReport[] {
    const text = query.text?.toLowerCase();
    return this.reports.filter((report) =>
      (!query.status || report.status === query.status) &&
      (!query.from || report.startTime >= query.from) &&
      (!query.to || report.startTime <= query.to) &&
      (!text || report.testName.toLowerCase().includes(text) || report.steps.some((step) =>
        `${step.name} ${step.selector ?? ''} ${step.error ?? ''}`.toLowerCase().includes(text)
      ))
    );
  }
  analytics(): RunAnalytics {
    const stepStats = new Map<string, { failures: number; passes: number }>();
    for (const report of this.reports) for (const step of report.steps) {
      const stats = stepStats.get(step.name) ?? { failures: 0, passes: 0 };
      if (step.status === 'failed') stats.failures++;
      if (step.status === 'passed') stats.passes++;
      stepStats.set(step.name, stats);
    }
    const runs = this.reports.length;
    const passedRuns = this.reports.filter((report) => report.status === 'passed').length;
    const failedRuns = this.reports.filter((report) => report.status === 'failed').length;
    const completedRuns = passedRuns + failedRuns;
    const passedSteps = this.reports.reduce((sum, report) =>
      sum + report.steps.filter((step) => step.status === 'passed').length, 0);
    const failedSteps = this.reports.reduce((sum, report) =>
      sum + report.steps.filter((step) => step.status === 'failed').length, 0);
    const completedSteps = passedSteps + failedSteps;
    return {
      runs,
      completedRuns,
      passedRuns,
      failedRuns,
      passRate: completedRuns ? passedRuns / completedRuns : 0,
      stepPassRate: completedSteps ? passedSteps / completedSteps : 0,
      averageDuration: runs ? this.reports.reduce((sum, report) => sum + report.duration, 0) / runs : 0,
      healingFrequency: runs ? this.reports.reduce((sum, report) => sum + report.healingEvents, 0) / runs : 0,
      flakySteps: [...stepStats.entries()].filter(([, item]) => item.failures && item.passes).map(([name, item]) => ({
        name, ...item, failureRate: item.failures / (item.failures + item.passes),
      })).sort((a, b) => b.failureRate - a.failureRate),
      durationTrend: this.reports.map((report) => ({
        runId: report.runId ?? report.testName, timestamp: report.startTime, duration: report.duration,
      })).reverse(),
      failureTrend: this.reports.map((report) => ({
        runId: report.runId ?? report.testName, timestamp: report.startTime,
        failed: report.steps.filter((step) => step.status === 'failed').length,
      })).reverse(),
    };
  }
  export(): string { return JSON.stringify(this.reports); }
  import(value: string): void {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Run history must be an array');
    this.reports = parsed.slice(0, this.limit);
  }
  clear(): void { this.reports = []; }
}
