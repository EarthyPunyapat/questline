// M13/T13.C: coverage for backup rotation — snapshot, overwrite, sliding
// window. Isolated via a temp dir; no real config dir is ever touched.
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKUP_DIR, DEFAULT_KEEP, rotateBackups } from './backup.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'questline-backup-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const seed = (name: string, body = '{}'): void => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), body);
};

const backupNames = (): string[] => readdirSync(join(dir, BACKUP_DIR)).sort();

describe('rotateBackups', () => {
  test('missing state.json is a clean no-op (no dir created)', () => {
    expect(rotateBackups(dir, '2026-08-24')).toEqual([]);
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false);
  });

  test('snapshots state.json into backups/state-<today>.json byte-identical', () => {
    seed('state.json', '{"totalXp":42}');
    const kept = rotateBackups(dir, '2026-08-24');
    expect(kept).toEqual(['state-2026-08-24.json']);
    expect(readFileSync(join(dir, BACKUP_DIR, 'state-2026-08-24.json'), 'utf8')).toBe(
      '{"totalXp":42}',
    );
  });

  test('same-day rerun overwrites in place (one slot per day)', () => {
    seed('state.json', '{"v":1}');
    rotateBackups(dir, '2026-08-24');
    seed('state.json', '{"v":2}');
    const kept = rotateBackups(dir, '2026-08-24');
    expect(kept).toEqual(['state-2026-08-24.json']);
    expect(readFileSync(join(dir, BACKUP_DIR, 'state-2026-08-24.json'), 'utf8')).toBe('{"v":2}');
  });

  test('window slides: oldest beyond keep is pruned, newest survive', () => {
    // Seed 7 prior days + today's rotation = 8 snapshots; keep 7 → day-1 drops.
    for (let d = 10; d <= 16; d++) {
      if (d === 10) mkdirSync(join(dir, BACKUP_DIR), { recursive: true });
      writeFileSync(join(dir, BACKUP_DIR, `state-2026-08-${String(d).padStart(2, '0')}.json`), '{}');
    }
    seed('state.json');
    const kept = rotateBackups(dir, '2026-08-17');
    expect(kept).toEqual([
      'state-2026-08-11.json',
      'state-2026-08-12.json',
      'state-2026-08-13.json',
      'state-2026-08-14.json',
      'state-2026-08-15.json',
      'state-2026-08-16.json',
      'state-2026-08-17.json',
    ]);
    expect(existsSync(join(dir, BACKUP_DIR, 'state-2026-08-10.json'))).toBe(false);
  });

  test('foreign files in backups/ are neither counted nor removed', () => {
    mkdirSync(join(dir, BACKUP_DIR), { recursive: true });
    writeFileSync(join(dir, BACKUP_DIR, 'notes.txt'), 'junk');
    seed('state.json');
    const kept = rotateBackups(dir, '2026-08-24');
    expect(kept).toEqual(['state-2026-08-24.json']);
    expect(existsSync(join(dir, BACKUP_DIR, 'notes.txt'))).toBe(true);
    expect(DEFAULT_KEEP).toBe(7); // pin the contract
  });

  test('keep=0 prunes everything including the fresh snapshot', () => {
    seed('state.json');
    expect(rotateBackups(dir, '2026-08-24', 0)).toEqual([]);
    expect(backupNames()).toEqual([]);
  });
});
