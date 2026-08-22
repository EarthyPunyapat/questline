import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveStateAtomic, defaultState } from './persist.ts';
import { migrateV2toV3 } from '../types/state.ts';
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
    expect(s.version).toBe(3);
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
    expect(s.version).toBe(3); // default
    expect(s.tasks).toEqual([]);
    const backups = readdirSync(dir);
    expect(backups.some((f) => f.includes('.corrupt-') && f.endsWith('.bak'))).toBe(true);
  });

  test('schema mismatch (valid JSON, wrong shape) → default + backup', () => {
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const s = loadState(path);
    expect(s.version).toBe(3);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  test('v1 fixture → migrates to v3 with dailies fields present', () => {
    const v1 = {
      version: 1,
      tasks: [{ id: 't-1', title: 'legacy', difficulty: 'easy', status: 'todo', createdAt: 1 }],
      quests: [],
      profile: { totalXp: 77, streakDays: 2, lastCompletedDay: '2026-08-21' },
      completedQuestIds: ['q-9'],
    };
    writeFileSync(path, JSON.stringify(v1));
    const s = loadState(path);
    expect(s.version).toBe(3);
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

describe('v3 recurrence migration', () => {
  test('migrateV2toV3 preserves every field incl. achievements (pure fn)', () => {
    const v2 = {
      version: 2 as const,
      tasks: [makeTask('t-1', 'legacy task', 'easy')],
      quests: [],
      profile: {
        totalXp: 42,
        streakDays: 3,
        lastCompletedDay: '2026-08-20',
        achievements: [{ id: 'first-task', unlockedAt: 111 }],
      },
      completedQuestIds: ['q-1'],
      dailies: { dateISO: '2026-08-21', questIds: [], completedAll: true },
      dailiesArchive: [{ dateISO: '2026-08-20', missedCount: 2 }],
    };
    const v3 = migrateV2toV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.tasks).toEqual(v2.tasks);
    expect(v3.profile).toEqual(v2.profile);
    expect(v3.completedQuestIds).toEqual(['q-1']);
    expect(v3.dailies).toEqual(v2.dailies);
    expect(v3.dailiesArchive).toEqual(v2.dailiesArchive);
  });

  test('v2 save on disk loads as v3 with achievements intact', () => {
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        tasks: [],
        quests: [],
        profile: {
          totalXp: 9,
          streakDays: 1,
          lastCompletedDay: '2026-08-01',
          achievements: [{ id: 'streak-3', unlockedAt: 55 }],
        },
        completedQuestIds: [],
        dailies: null,
        dailiesArchive: [],
      }),
    );
    const s = loadState(path);
    expect(s.version).toBe(3);
    expect(s.profile.achievements).toEqual([{ id: 'streak-3', unlockedAt: 55 }]);
  });

  test('v3 roundtrip keeps valid daily + weekly recurrence', () => {
    const s = defaultState();
    s.tasks = [
      { ...makeTask('t-d', 'daily chore', 'easy'), recurrence: { freq: 'daily' } },
      {
        ...makeTask('t-w', 'weekly review', 'medium'),
        recurrence: { freq: 'weekly', weekdays: [1, 4] },
      },
    ];
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.tasks[0]?.recurrence).toEqual({ freq: 'daily' });
    expect(loaded.tasks[1]?.recurrence).toEqual({ freq: 'weekly', weekdays: [1, 4] });
  });

  test('malformed recurrence shapes are dropped defensively', () => {
    writeFileSync(
      path,
      JSON.stringify({
        ...defaultState(),
        tasks: [
          // valid daily
          { ...makeTask('t-ok', 'fine', 'easy'), recurrence: { freq: 'daily' } },
          // unknown freq
          { ...makeTask('t-bad1', 'monthly?', 'easy'), recurrence: { freq: 'monthly' } },
          // weekly without weekdays
          { ...makeTask('t-bad2', 'vague weekly', 'easy'), recurrence: { freq: 'weekly' } },
          // weekday out of range / wrong type → filtered; empty → dropped
          {
            ...makeTask('t-bad3', 'bad weekdays', 'easy'),
            recurrence: { freq: 'weekly', weekdays: [7, -1, 'x' as unknown as number] },
          },
          // non-object recurrence
          { ...makeTask('t-bad4', 'string rec', 'easy'), recurrence: 'daily' as unknown as never },
        ],
      }),
    );
    const loaded = loadState(path);
    const byId = new Map(loaded.tasks.map((t) => [t.id, t]));
    expect(byId.get('t-ok')?.recurrence).toEqual({ freq: 'daily' });
    for (const bad of ['t-bad1', 't-bad2', 't-bad3', 't-bad4']) {
      expect(byId.get(bad)?.recurrence).toBeUndefined();
    }
  });
});
