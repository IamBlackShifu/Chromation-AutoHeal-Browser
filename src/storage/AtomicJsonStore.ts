import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_QUARANTINE_LIMIT = 3;

export interface AtomicJsonOptions<T> {
  maxBytes?: number;
  backupPath?: string;
  defaultValue?: T;
  validate?: (value: unknown) => void;
  quarantineLimit?: number;
}

export interface AtomicJsonReadResult<T> {
  value: T;
  source: 'primary' | 'backup' | 'default';
  recovered: boolean;
  recoveryReason?: string;
  quarantinedPaths: string[];
}

function assertStorePath(filePath: string): void {
  if (!path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.json') {
    throw new Error('JSON store path must be an absolute .json path');
  }
}

function serializeBounded<T>(value: T, options: AtomicJsonOptions<T>): string {
  options.validate?.(value);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('JSON store byte limit is invalid');
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error(`JSON store exceeds the ${maxBytes} byte limit`);
  }
  return serialized;
}

function readBounded<T>(filePath: string, options: AtomicJsonOptions<T>): T {
  const stats = fs.statSync(filePath);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) {
    throw new Error(`JSON store must be a non-empty file no larger than ${maxBytes} bytes`);
  }
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  options.validate?.(value);
  return value as T;
}

function temporaryPath(filePath: string): string {
  return `${filePath}.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}.tmp`;
}

function writeTemporaryFile(filePath: string, serialized: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = temporaryPath(filePath);
  const descriptor = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return tempPath;
}

function replaceFromTemporary(tempPath: string, filePath: string): void {
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
}

function commitPrimary(filePath: string, serialized: string, backupPath: string): void {
  const tempPath = writeTemporaryFile(filePath, serialized);
  let rotatedPrimary = false;
  try {
    if (fs.existsSync(filePath)) {
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      fs.renameSync(filePath, backupPath);
      rotatedPrimary = true;
    }
    fs.renameSync(tempPath, filePath);
    if (!fs.existsSync(backupPath)) {
      replaceFromTemporary(writeTemporaryFile(backupPath, serialized), backupPath);
    }
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (rotatedPrimary && !fs.existsSync(filePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, filePath);
    }
    throw error;
  }
}

function safeReason(error: unknown): string {
  if (error instanceof SyntaxError) return 'Stored JSON is malformed';
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  ) return 'Store file is missing';
  return error instanceof Error ? error.message : 'Stored JSON could not be read';
}

function quarantineFile(filePath: string, limit: number): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const quarantinePath = `${filePath}.corrupt-${Date.now()}-${randomBytes(3).toString('hex')}`;
  fs.renameSync(filePath, quarantinePath);

  const prefix = `${path.basename(filePath)}.corrupt-`;
  const quarantined = fs.readdirSync(path.dirname(filePath))
    .filter((name) => name.startsWith(prefix))
    .map((name) => {
      const candidate = path.join(path.dirname(filePath), name);
      return { candidate, modified: fs.statSync(candidate).mtimeMs };
    })
    .sort((a, b) => b.modified - a.modified);
  for (const stale of quarantined.slice(Math.max(1, limit))) fs.unlinkSync(stale.candidate);
  return quarantinePath;
}

export function writeJsonAtomicSync<T>(
  filePath: string,
  value: T,
  options: AtomicJsonOptions<T> = {}
): void {
  assertStorePath(filePath);
  const backupPath = options.backupPath ?? `${filePath}.bak`;
  const serialized = serializeBounded(value, options);

  // Never replace a known-good backup with a corrupt primary.
  if (fs.existsSync(filePath)) {
    try {
      readBounded(filePath, options);
    } catch {
      quarantineFile(filePath, options.quarantineLimit ?? DEFAULT_QUARANTINE_LIMIT);
    }
  }
  commitPrimary(filePath, serialized, backupPath);
}

export function readJsonWithRecoverySync<T>(
  filePath: string,
  options: AtomicJsonOptions<T> = {}
): AtomicJsonReadResult<T> {
  assertStorePath(filePath);
  const backupPath = options.backupPath ?? `${filePath}.bak`;
  const quarantineLimit = options.quarantineLimit ?? DEFAULT_QUARANTINE_LIMIT;
  const quarantinedPaths: string[] = [];
  let primaryError: unknown;

  try {
    const value = readBounded<T>(filePath, options);
    if (!fs.existsSync(backupPath)) writeJsonAtomicSync(filePath, value, options);
    return {
      value,
      source: 'primary',
      recovered: false,
      quarantinedPaths,
    };
  } catch (error) {
    primaryError = error;
  }

  try {
    const value = readBounded<T>(backupPath, options);
    const quarantined = quarantineFile(filePath, quarantineLimit);
    if (quarantined) quarantinedPaths.push(quarantined);
    const serialized = serializeBounded(value, options);
    replaceFromTemporary(writeTemporaryFile(filePath, serialized), filePath);
    return {
      value,
      source: 'backup',
      recovered: true,
      recoveryReason: safeReason(primaryError),
      quarantinedPaths,
    };
  } catch (backupError) {
    const primaryQuarantine = quarantineFile(filePath, quarantineLimit);
    const backupQuarantine = quarantineFile(backupPath, quarantineLimit);
    if (primaryQuarantine) quarantinedPaths.push(primaryQuarantine);
    if (backupQuarantine) quarantinedPaths.push(backupQuarantine);

    if (options.defaultValue !== undefined) {
      const serialized = serializeBounded(options.defaultValue, options);
      commitPrimary(filePath, serialized, backupPath);
      const bothMissing = safeReason(primaryError) === 'Store file is missing' &&
        safeReason(backupError) === 'Store file is missing';
      return {
        value: options.defaultValue,
        source: 'default',
        recovered: !bothMissing,
        recoveryReason: bothMissing
          ? undefined
          : `${safeReason(primaryError)}; backup: ${safeReason(backupError)}`,
        quarantinedPaths,
      };
    }

    throw new Error(
      `JSON store recovery failed: ${safeReason(primaryError)}; backup: ${safeReason(backupError)}`
    );
  }
}

/** Removes a store and only the backup, temporary, and quarantine files owned by it. */
export function purgeJsonStoreSync(filePath: string): number {
  assertStorePath(filePath);
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) return 0;
  const basename = path.basename(filePath);
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownedFile = new RegExp(
    `^${escaped}(?:\\.bak|(?:\\.bak)?\\.corrupt-[0-9]+-[a-f0-9]+|(?:\\.bak)?\\.[0-9]+\\.[0-9]+\\.[a-f0-9]+\\.tmp)?$`
  );
  let removed = 0;
  for (const name of fs.readdirSync(directory)) {
    if (!ownedFile.test(name)) continue;
    const target = path.join(directory, name);
    if (!fs.statSync(target).isFile()) continue;
    fs.unlinkSync(target);
    removed++;
  }
  return removed;
}
