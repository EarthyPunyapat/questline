import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveStateAtomic, defaultState } from './persist.ts';
import { migrateV2toV3, migrateV3toV4, MAX_NOTE_BODY_LEN, MAX_NOTE_TITLE_LEN } from '../types/state.ts';
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
    expect(s.version).toBe(4);
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
    expect(s.version).toBe(4); // default
    expect(s.tasks).toEqual([]);
    const backups = readdirSync(dir);
    expect(backups.some((f) => f.includes('.corrupt-') && f.endsWith('.bak'))).toBe(true);
  });

  test('schema mismatch (valid JSON, wrong shape) → default + backup', () => {
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const s = loadState(path);
    expect(s.version).toBe(4);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  test('v1 fixture → migrates to v4 with dailies fields present', () => {
    const v1 = {
      version: 1,
      tasks: [{ id: 't-1', title: 'legacy', difficulty: 'easy', status: 'todo', createdAt: 1 }],
      quests: [],
      profile: { totalXp: 77, streakDays: 2, lastCompletedDay: '2026-08-21' },
      completedQuestIds: ['q-9'],
    };
    writeFileSync(path, JSON.stringify(v1));
    const s = loadState(path);
    expect(s.version).toBe(4);
    expect(s.dailies).toBeNull();
    expect(s.dailiesArchive).toEqual([]);
    expect(s.notes).toEqual([]);
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
    expect(s.version).toBe(4);
    expect(s.notes).toEqual([]);
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

describe('v4 notes migration', () => {
  test('migrateV3toV4 preserves every field incl. recurrence + achievements', () => {
    const v3 = {
      version: 3 as const,
      tasks: [
        { ...makeTask('t-1', 'chore', 'easy'), recurrence: { freq: 'daily' as const } },
      ],
      quests: [],
      profile: {
        totalXp: 250,
        streakDays: 6,
        lastCompletedDay: '2026-08-22',
        achievements: [{ id: 'first-task', unlockedAt: 42 }],
      },
      completedQuestIds: ['q-1'],
      dailies: { dateISO: '2026-08-22', questIds: ['t-1'], completedAll: false },
      dailiesArchive: [{ dateISO: '2026-08-21', missedCount: 1 }],
    };
    const v4 = migrateV3toV4(v3);
    expect(v4.version).toBe(4);
    expect(v4.notes).toEqual([]);
    expect(v4.tasks).toEqual(v3.tasks);
    expect(v4.profile).toEqual(v3.profile);
    expect(v4.completedQuestIds).toEqual(v3.completedQuestIds);
    expect(v4.dailies).toEqual(v3.dailies);
    expect(v4.dailiesArchive).toEqual(v3.dailiesArchive);
    // pure — input untouched
    expect(v3.version).toBe(3);
  });

  test('v3 save on disk loads as v4 with everything intact + fresh notes []', () => {
    writeFileSync(
      path,
      JSON.stringify({
        version: 3,
        tasks: [{ ...makeTask('t-w', 'weekly review', 'medium'), recurrence: { freq: 'weekly', weekdays: [1] } }],
        quests: [],
        profile: {
          totalXp: 99,
          streakDays: 2,
          lastCompletedDay: '2026-08-20',
          achievements: [{ id: 'streak-3', unlockedAt: 7 }],
        },
        completedQuestIds: [],
        dailies: null,
        dailiesArchive: [{ dateISO: '2026-08-19', missedCount: 3 }],
      }),
    );
    const s = loadState(path);
    expect(s.version).toBe(4);
    expect(s.notes).toEqual([]);
    expect(s.tasks[0]?.recurrence).toEqual({ freq: 'weekly', weekdays: [1] });
    expect(s.profile.achievements).toEqual([{ id: 'streak-3', unlockedAt: 7 }]);
    expect(s.dailiesArchive).toEqual([{ dateISO: '2026-08-19', missedCount: 3 }]);
  });

  test('v4 roundtrip preserves notes; malformed rows dropped; long strings clamped', () => {
    const s = defaultState();
    s.notes = [
      { id: 'n-ok', title: 'keep me', body: 'fine', createdAt: 1, updatedAt: 2, pinned: true },
      // malformed: missing id
      { id: '', title: 'no id', body: '', createdAt: 1, updatedAt: 1, pinned: false },
      // malformed: wrong types
      { id: 'n-bad1', title: 5, body: '', createdAt: 1, updatedAt: 1, pinned: false } as never,
      { id: 'n-bad2', title: 'x', body: 'y', createdAt: 'soon', updatedAt: 1, pinned: false } as never,
      // non-object row
      'junk' as never,
    ];
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.notes.length).toBe(1);
    expect(loaded.notes[0]).toEqual({
      id: 'n-ok',
      title: 'keep me',
      body: 'fine',
      createdAt: 1,
      updatedAt: 2,
      pinned: true,
    });

    // hand-edited save with over-long fields → clamped, row kept
    writeFileSync(
      path,
      JSON.stringify({
        version: 4,
        tasks: [],
        quests: [],
        profile: { totalXp: 0, streakDays: 0, lastCompletedDay: null },
        completedQuestIds: [],
        dailies: null,
        dailiesArchive: [],
        notes: [
          { id: 'n-big', title: 'T'.repeat(200), body: 'B'.repeat(5000), createdAt: 3, updatedAt: 4, pinned: false },
        ],
      }),
    );
    const clamped = loadState(path);
    expect(clamped.notes.length).toBe(1);
    expect(clamped.notes[0]!.title.length).toBe(MAX_NOTE_TITLE_LEN);
    expect(clamped.notes[0]!.body.length).toBe(MAX_NOTE_BODY_LEN);
  });
});

describe('lastPomodoroAwardedAt (M10/T10.D restart guard)', () => {
  test('survives save/load; absent stays undefined', () => {
    const s = defaultState();
    s.profile.lastPomodoroAwardedAt = '2026-08-23';
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.profile.lastPomodoroAwardedAt).toBe('2026-08-23');

    const bare = defaultState();
    delete bare.profile.lastPomodoroAwardedAt;
    saveStateAtomic(bare, path);
    expect(loadState(path).profile.lastPomodoroAwardedAt).toBeUndefined();
  });
});

describe('lastUndo persistence (M13/T13.C, SYNC-14)', () => {
  test('v4 roundtrip preserves a well-formed undo pointer', () => {
    const s = defaultState();
    s.profile.lastUndo = { taskId: 't-abc', xpGained: 30, at: '2026-08-24' };
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.profile.lastUndo).toEqual({ taskId: 't-abc', xpGained: 30, at: '2026-08-24' });
  });

  test('absent pointer stays absent; malformed shapes drop to undefined', () => {
    const s = defaultState();
    saveStateAtomic(s, path);
    expect(loadState(path).profile.lastUndo).toBeUndefined();

    const cases = ['42', '"x"', 'null', '{"taskId":7,"xpGained":5,"at":"2026-08-24"}',
      '{"taskId":"t","xpGained":"5","at":"2026-08-24"}', '{"taskId":"t","xpGained":5}'];
    for (const [i, shape] of cases.entries()) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      (raw.profile as Record<string, unknown>).lastUndo = JSON.parse(shape) as unknown;
      writeFileSync(path, JSON.stringify(raw));
      expect(loadState(path).profile.lastUndo, `case ${i}`).toBeUndefined();
    }
  });

  test('fractional/negative xpGained is floored into a safe integer', () => {
    const s = defaultState();
    s.profile.lastUndo = { taskId: 't', xpGained: -7, at: '2026-08-24' };
    saveStateAtomic(s, path);
    // Writer stores as-is; reader sanitizes to >=0 so undo can never ADD xp.
    const loaded = loadState(path);
    expect(loaded.profile.lastUndo?.xpGained).toBe(0);
  });
});
