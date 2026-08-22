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
    expect(s.version).toBe(2);
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
    expect(s.version).toBe(2); // default
    expect(s.tasks).toEqual([]);
    const backups = readdirSync(dir);
    expect(backups.some((f) => f.includes('.corrupt-') && f.endsWith('.bak'))).toBe(true);
  });

  test('schema mismatch (valid JSON, wrong shape) → default + backup', () => {
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const s = loadState(path);
    expect(s.version).toBe(2);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  test('v1 fixture → migrates to v2 with dailies fields present', () => {
    const v1 = {
      version: 1,
      tasks: [{ id: 't-1', title: 'legacy', difficulty: 'easy', status: 'todo', createdAt: 1 }],
      quests: [],
      profile: { totalXp: 77, streakDays: 2, lastCompletedDay: '2026-08-21' },
      completedQuestIds: ['q-9'],
    };
    writeFileSync(path, JSON.stringify(v1));
    const s = loadState(path);
    expect(s.version).toBe(2);
    expect(s.dailies).toBeNull();
    expect(s.dailiesArchive).toEqual([]);
    expect(s.profile.totalXp).toBe(77);
    expect(s.tasks[0]?.title).toBe('legacy');
    expect(s.completedQuestIds).toEqual(['q-9']);
  });

  test('v2 roundtrip preserves dailies + archive (cap enforced)', () => {
    const s = defaultState();
    s.dailies = { dateISO: '2026-08-22', questIds: ['dq-a', 'dq-b'], completedAll: false };
    s.dailiesArchive = Array.from({ length: 40 }, (_, i) => ({
      dateISO: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      missedCount: i,
    }));
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.dailies?.dateISO).toBe('2026-08-22');
    expect(loaded.dailies?.questIds).toEqual(['dq-a', 'dq-b']);
    expect(loaded.dailiesArchive.length).toBeLessThanOrEqual(30);
  });

  test('v2 roundtrip preserves profile.achievements', () => {
    const s = defaultState();
    s.profile.achievements = [
      { id: 'first-task', unlockedAt: 111 },
      { id: 'streak-3', unlockedAt: 222 },
    ];
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.profile.achievements).toEqual([
      { id: 'first-task', unlockedAt: 111 },
      { id: 'streak-3', unlockedAt: 222 },
    ]);
  });

  test('malformed achievements entries are dropped defensively', () => {
    writeFileSync(
      path,
      JSON.stringify({
        ...defaultState(),
        profile: {
          totalXp: 5,
          streakDays: 0,
          lastCompletedDay: null,
          achievements: [
            { id: 'first-task', unlockedAt: 7 }, // valid
            { id: 'no-ts' }, // missing unlockedAt
            { unlockedAt: 9 }, // missing id
            'garbage', // not an object
            { id: 12, unlockedAt: 3 }, // wrong id type
          ],
        },
      }),
    );
    const loaded = loadState(path);
    expect(loaded.profile.achievements).toEqual([{ id: 'first-task', unlockedAt: 7 }]);
  });
});
