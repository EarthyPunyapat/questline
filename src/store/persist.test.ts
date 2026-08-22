import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveStateAtomic, defaultState } from './persist.ts';
import { makeTask } from '../types/task.ts';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'questline-persist-'));
  path = join(dir, 'state.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('persist', () => {
  test('missing file → default state', () => {
    const s = loadState(path);
    expect(s.version).toBe(1);
    expect(s.tasks).toEqual([]);
    expect(s.profile.totalXp).toBe(0);
  });

  test('roundtrip save/load preserves tasks and profile', () => {
    const s = defaultState();
    s.tasks = [makeTask('t-1', 'write tests', 'hard')];
    s.profile.totalXp = 42;
    s.profile.streakDays = 3;
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.tasks.length).toBe(1);
    expect(loaded.tasks[0]?.title).toBe('write tests');
    expect(loaded.profile.totalXp).toBe(42);
    expect(loaded.profile.streakDays).toBe(3);
  });

  test('atomicity: tmp file renamed away after successful save', () => {
    saveStateAtomic(defaultState(), path);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toBeTruthy();
    expect(existsSync(`${path}.tmp-${process.pid}`)).toBe(false);
  });

  test('writer failure → throws AND leaves no tmp litter', () => {
    const bomb = (_p: string, _d: string): void => {
      throw new Error('disk full');
    };
    expect(() => saveStateAtomic(defaultState(), path, bomb)).toThrow('disk full');
    // no state.json created, no tmp leftovers
    expect(existsSync(path)).toBe(false);
    const litter = readdirSync(dir).filter((f) => f.includes('.tmp-'));
    expect(litter.length).toBe(0);
  });

  test('corruption guard: corrupt JSON → quarantined .bak + default returned', () => {
    writeFileSync(path, '{ this is not json !!!');
    const s = loadState(path);
    expect(s.version).toBe(1); // default
    expect(s.tasks).toEqual([]);
    const backups = readdirSync(dir);
    expect(backups.some((f) => f.includes('.corrupt-') && f.endsWith('.bak'))).toBe(true);
  });

  test('schema mismatch (valid JSON, wrong shape) → default + backup', () => {
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const s = loadState(path);
    expect(s.version).toBe(1);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });
});
