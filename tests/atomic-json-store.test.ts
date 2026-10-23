import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  purgeJsonStoreSync,
  readJsonWithRecoverySync,
  writeJsonAtomicSync,
} from '../src/storage/AtomicJsonStore';

describe('atomic JSON persistence', () => {
  let directory: string;
  let storePath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-atomic-json-'));
    storePath = path.join(directory, 'history.json');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('atomically rotates the previous valid value into a backup', () => {
    writeJsonAtomicSync(storePath, [{ id: 'first' }]);
    expect(JSON.parse(fs.readFileSync(`${storePath}.bak`, 'utf8'))).toEqual([{ id: 'first' }]);
    writeJsonAtomicSync(storePath, [{ id: 'second' }]);

    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual([{ id: 'second' }]);
    expect(JSON.parse(fs.readFileSync(`${storePath}.bak`, 'utf8'))).toEqual([{ id: 'first' }]);
    expect(fs.readdirSync(directory).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  test('recovers a corrupt primary from backup and quarantines the bad file', () => {
    writeJsonAtomicSync(storePath, [{ id: 'known-good' }]);
    writeJsonAtomicSync(storePath, [{ id: 'new-value' }]);
    fs.writeFileSync(storePath, '{broken', 'utf8');

    const result = readJsonWithRecoverySync<Array<{ id: string }>>(storePath);

    expect(result.value).toEqual([{ id: 'known-good' }]);
    expect(result).toMatchObject({ source: 'backup', recovered: true });
    expect(result.quarantinedPaths).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual([{ id: 'known-good' }]);
  });

  test('quarantines corrupt primary and backup before restoring a safe default', () => {
    fs.writeFileSync(storePath, '{bad-primary', 'utf8');
    fs.writeFileSync(`${storePath}.bak`, '{bad-backup', 'utf8');

    const result = readJsonWithRecoverySync<unknown[]>(storePath, { defaultValue: [] });

    expect(result).toMatchObject({ value: [], source: 'default', recovered: true });
    expect(result.quarantinedPaths).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual([]);
  });

  test('enforces validation and byte limits without replacing the valid primary', () => {
    const options = {
      maxBytes: 100,
      validate: (value: unknown) => {
        if (!Array.isArray(value)) throw new Error('Expected an array');
      },
    };
    writeJsonAtomicSync(storePath, ['valid'], options);

    expect(() => writeJsonAtomicSync(storePath, { invalid: true }, options)).toThrow('Expected an array');
    expect(() => writeJsonAtomicSync(storePath, ['x'.repeat(200)], options)).toThrow(/byte limit/);
    expect(readJsonWithRecoverySync<string[]>(storePath, options).value).toEqual(['valid']);
  });

  test('initializes a missing store from its default without reporting corruption', () => {
    const result = readJsonWithRecoverySync<unknown[]>(storePath, { defaultValue: [] });

    expect(result).toMatchObject({ value: [], source: 'default', recovered: false });
    expect(result.recoveryReason).toBeUndefined();
  });

  test('upgrades an existing valid JSON file with a recovery backup on first read', () => {
    fs.writeFileSync(storePath, JSON.stringify(['legacy-value']), 'utf8');

    const result = readJsonWithRecoverySync<string[]>(storePath);

    expect(result).toMatchObject({ value: ['legacy-value'], source: 'primary', recovered: false });
    expect(JSON.parse(fs.readFileSync(`${storePath}.bak`, 'utf8'))).toEqual(['legacy-value']);
  });

  test('purges only files owned by the selected store', () => {
    writeJsonAtomicSync(storePath, ['private-history']);
    fs.writeFileSync(`${storePath}.corrupt-123-aabbcc`, 'corrupt', 'utf8');
    fs.writeFileSync(path.join(directory, 'unrelated.json'), '{}', 'utf8');

    expect(purgeJsonStoreSync(storePath)).toBe(3);
    expect(fs.existsSync(storePath)).toBe(false);
    expect(fs.existsSync(`${storePath}.bak`)).toBe(false);
    expect(fs.existsSync(path.join(directory, 'unrelated.json'))).toBe(true);
  });
});
