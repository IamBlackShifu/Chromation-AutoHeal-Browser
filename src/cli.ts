import { promises as fs } from 'fs';
import path from 'path';
import { MatrixRunner, MatrixValue } from './executor/MatrixRunner';
import { ScriptExecutor } from './executor/ScriptExecutor';
import { ResultArtifactStore } from './advanced/AdvancedTesting';
import { SuiteManager } from './suite/SuiteManager';

interface CliOptions {
  suiteFile: string;
  resultDirectory: string;
  tags: string[];
  excludeTags: string[];
  matrix: Record<string, MatrixValue[]>;
  concurrency: number;
}
export function parseCliArguments(argv: string[]): CliOptions {
  const value = (name: string, fallback = '') => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] ?? fallback : fallback;
  };
  const suiteFile = value('--suite');
  if (!suiteFile) throw new Error('Usage: chromation-cli --suite <suite.json> [--tags smoke] [--matrix \'{"browser":["chrome"]}\']');
  const matrixText = value('--matrix', '{}');
  const matrix = parseMatrix(matrixText);
  if (!Object.values(matrix).every((values) => Array.isArray(values) && values.length)) {
    throw new Error('Every matrix dimension must contain at least one value');
  }
  return {
    suiteFile: path.resolve(suiteFile),
    resultDirectory: path.resolve(value('--results', './chromation-results')),
    tags: value('--tags').split(',').map((item) => item.trim()).filter(Boolean),
    excludeTags: value('--exclude-tags').split(',').map((item) => item.trim()).filter(Boolean),
    matrix,
    concurrency: Math.max(1, Math.min(32, Number(value('--concurrency', '2')) || 2)),
  };
}

export function parseMatrix(value: string): Record<string, MatrixValue[]> {
  try {
    return JSON.parse(value) as Record<string, MatrixValue[]>;
  } catch {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) throw new Error('Matrix must be a JSON object');
    const body = trimmed.slice(1, -1).trim();
    if (!body) return {};
    const output: Record<string, MatrixValue[]> = {};
    const dimensions = body.split(/,(?=[A-Za-z_][A-Za-z0-9_-]*\s*:\s*\[)/);
    for (const dimension of dimensions) {
      const match = dimension.match(/^\s*["']?([A-Za-z_][A-Za-z0-9_-]*)["']?\s*:\s*\[(.*)\]\s*$/);
      if (!match) throw new Error(`Invalid matrix dimension: ${dimension}`);
      const values = match[2].split(',').map((item) => item.trim()).filter(Boolean).map((item): MatrixValue => {
        const unquoted = item.replace(/^(["'])(.*)\1$/, '$2');
        if (/^(true|false)$/i.test(unquoted)) return unquoted.toLowerCase() === 'true';
        if (/^-?\d+(?:\.\d+)?$/.test(unquoted)) return Number(unquoted);
        if (!/^[A-Za-z0-9_.:/-]+$/.test(unquoted)) throw new Error(`Invalid matrix value: ${item}`);
        return unquoted;
      });
      output[match[1]] = values;
    }
    return output;
  }
}
export async function runCli(argv: string[]): Promise<number> {
  const options = parseCliArguments(argv);
  const manager = new SuiteManager();
  manager.import(await fs.readFile(options.suiteFile, 'utf8'));
  const selected = manager.filter({
    tags: options.tags, excludeTags: options.excludeTags, enabledOnly: true,
  });
  const runner = new MatrixRunner(async (job) =>
    new ScriptExecutor().execute(job.actions, { ...job.options, headless: true }));
  const jobs = runner.expand(selected.map(({ test }) => ({
    id: test.id, name: test.name, actions: test.actions,
  })), options.matrix);
  const result = await runner.run(jobs, options.concurrency);
  const store = new ResultArtifactStore(options.resultDirectory);
  await store.save('cli', result.summary.failed ? 'failed' : 'passed', result);
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
  return result.summary.failed ? 1 : 0;
}
if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
}
