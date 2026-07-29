import { ExecutionOptions, ExecutionResult } from './types';
import { RecordedAction } from '../recorder/Recorder';

export type MatrixValue = string | number | boolean;
export interface MatrixJob {
  id: string;
  testId: string;
  name: string;
  actions: RecordedAction[];
  dimensions: Record<string, MatrixValue>;
  options?: ExecutionOptions;
}
export interface MatrixRunResult {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  jobs: Array<MatrixJob & { result?: ExecutionResult; error?: string }>;
  summary: { total: number; passed: number; failed: number };
}
export type JobExecutor = (job: MatrixJob) => Promise<ExecutionResult>;

export class MatrixRunner {
  constructor(private readonly executeJob: JobExecutor) {}

  expand(
    tests: Array<{ id: string; name: string; actions: RecordedAction[]; options?: ExecutionOptions }>,
    matrix: Record<string, MatrixValue[]>
  ): MatrixJob[] {
    const dimensions = Object.entries(matrix);
    const combinations = dimensions.reduce<Record<string, MatrixValue>[]>((items, [name, values]) =>
      items.flatMap((item) => values.map((value) => ({ ...item, [name]: value }))), [{}]);
    return tests.flatMap((test) => combinations.map((combination, index) => ({
      ...test, id: `${test.id}:${index}`, testId: test.id, dimensions: combination,
      options: {
        ...test.options,
        channel: typeof combination.browser === 'string' ? combination.browser : test.options?.channel,
        baseUrl: typeof combination.baseUrl === 'string' ? combination.baseUrl : test.options?.baseUrl,
      },
    })));
  }

  async run(jobs: MatrixJob[], maxConcurrency = 2): Promise<MatrixRunResult> {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32) {
      throw new Error('maxConcurrency must be an integer from 1 to 32');
    }
    const startedAt = Date.now();
    const output: MatrixRunResult['jobs'] = new Array(jobs.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const index = cursor++;
        const job = jobs[index];
        try { output[index] = { ...job, result: await this.executeJob(job) }; }
        catch (error) { output[index] = { ...job, error: error instanceof Error ? error.message : String(error) }; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, jobs.length) }, worker));
    const endedAt = Date.now();
    const passed = output.filter((job) => job.result?.status === 'passed').length;
    return {
      startedAt, endedAt, durationMs: endedAt - startedAt, jobs: output,
      summary: { total: jobs.length, passed, failed: jobs.length - passed },
    };
  }
}
