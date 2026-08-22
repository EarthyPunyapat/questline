import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultState, loadState, saveStateAtomic } from './persist.ts';
import {
  IMPORT_BAK_SUFFIX,
  defaultExportPath,
  exportState,
  importState,
  parseBackup,
} from './export.ts';
import { makeTask } from '../types/task.ts';

let dir: string;
let live: string;
let backupFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'questline-export-'));
  live = join(dir, 'state.json');
  backupFile = join(dir, 'backup.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seededState() {
  const s = defaultState();
  const a = makeTask('t-1', 'alpha', 'medium');
  a.status = 'done';
  a.completedAt = 1787000000000;
  s.tasks = [a, makeTask('t-2', 'beta', 'easy')];
  s.profile.totalXp = 123;
  s.profile.streakDays = 4;
  s.profile.lastCompletedDay = '2026-08-21';
  s.profile.achievements = [{ id: 'first-task', unlockedAt: 1787000000001 }];
  s.completedQuestIds = ['q-1'];
  s.dailies = { dateISO: '2026-08-22', questIds: ['dq-a', 'dq-b'], completedAll: false };
  s.dailiesArchive = [{ dateISO: '2026-08-20', missedCount: 1 }];
  return s;
}

describe('defaultExportPath', () => {
  test('questline-backup-<local YYYY-MM-DD>.json in cwd', () => {
    expect(defaultExportPath(new Date(2026, 7, 22))).toBe('questline-backup-2026-08-22.json');
  });

  test('zero-pads month and day', () => {
    expect(defaultExportPath(new Date(2026, 0, 5))).toBe('questline-backup-2026-01-05.json');
  });
});

describe('exportState', () => {
  test('snapshot roundtrips to an identical state', () => {
    saveStateAtomic(seededState(), live);
    const res = exportState(backupFile, live);
    expect(res.path).toBe(backupFile);
    expect(res.taskCount).toBe(2);
    expect(res.totalXp).toBe(123);

    const parsed = JSON.parse(readFileSync(backupFile, 'utf8'));
    expect(parsed).toEqual(loadState(live));
  });

  test('output is pretty-printed with 2-space indent', () => {
    saveStateAtomic(seededState(), live);
    exportState(backupFile, live);
    const text = readFileSync(backupFile, 'utf8');
    expect(text).toBe(JSON.stringify(loadState(live), null, 2));
  });
});

describe('importState', () => {
  test('valid backup replaces live state atomically; .import-bak holds prior data', () => {
    // Live has OLD data; backup carries NEW data.
    const old = seededState();
    old.profile.totalXp = 5;
    saveStateAtomic(old, live);

    const fresh = seededState();
    fresh.profile.totalXp = 999;
    fresh.tasks = [makeTask('t-new', 'from backup', 'hard')];
    saveStateAtomic(fresh, backupFile); // any GameState-shaped file works

    const res = importState(backupFile, live);
    expect(res.backupPath).toBe(`${live}${IMPORT_BAK_SUFFIX}`);
    expect(loadState(live)).toEqual(fresh);
    // Prior state preserved verbatim in the safety copy.
    expect(JSON.parse(readFileSync(res.backupPath!, 'utf8'))).toEqual(old);
  });

  test('no live file → no .bak created, import still lands', () => {
    saveStateAtomic(seededState(), backupFile);
    const res = importState(backupFile, live);
    expect(res.backupPath).toBeNull();
    expect(existsSync(live)).toBe(true);
    expect(loadState(live).profile.totalXp).toBe(123);
  });

  test('missing backup file refused before any mutation', () => {
    saveStateAtomic(seededState(), live);
    expect(() => importState(join(dir, 'nope.json'), live)).toThrow(/cannot read backup/);
    expect(existsSync(`${live}${IMPORT_BAK_SUFFIX}`)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  test('invalid JSON refused; live untouched; no bak; no tmp litter', () => {
    saveStateAtomic(seededState(), live);
    const garbagePath = join(dir, 'garbage.json');
    writeFileSync(garbagePath, '{ this is not json !!!');

    expect(() => importState(garbagePath, live)).toThrow(/invalid JSON/);
    expect(existsSync(`${live}${IMPORT_BAK_SUFFIX}`)).toBe(false);
    expect(loadState(live).profile.totalXp).toBe(123);
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  test('schema mismatches each refuse cleanly', () => {
    saveStateAtomic(seededState(), live);
    const cases: unknown[] = [
      { hello: 'world' }, // no version
      { ...seededState(), version: 3 }, // future version
      { ...seededState(), tasks: 'not-an-array' }, // tasks not array
      { ...seededState(), tasks: [{ id: 't-1' }] }, // invalid task element
      { ...seededState(), profile: {} }, // missing totalXp
      { ...seededState(), profile: { totalXp: -5 } }, // negative xp
      { ...seededState(), quests: [{ nope: true }] }, // quest without id
    ];
    for (const c of cases) {
      writeFileSync(backupFile, JSON.stringify(c));
      let msg = '';
      try {
        importState(backupFile, live);
      } catch (err) {
        msg = (err as Error).message;
      }
      expect(msg).toContain('schema mismatch');
      // Nothing was touched by ANY failed attempt.
      expect(loadState(live).profile.totalXp).toBe(123);
      expect(existsSync(`${live}${IMPORT_BAK_SUFFIX}`)).toBe(false);
    }
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  test('legacy v1 backup accepted and migrated to v2', () => {
    const v1 = {
      version: 1,
      tasks: [
        { id: 't-old', title: 'legacy', difficulty: 'easy', status: 'todo', createdAt: 1 },
      ],
      quests: [],
      profile: { totalXp: 77, streakDays: 2, lastCompletedDay: '2026-08-21' },
      completedQuestIds: [],
    };
    writeFileSync(backupFile, JSON.stringify(v1));
    const res = importState(backupFile, live);
    expect(res.imported.version).toBe(2);
    expect(res.imported.dailies).toBeNull();
    expect(res.imported.dailiesArchive).toEqual([]);
    expect(res.imported.tasks[0]?.title).toBe('legacy');
    expect(loadState(live).profile.totalXp).toBe(77);
  });
});

describe('parseBackup', () => {
  test('non-object payloads rejected with reason', () => {
    expect(parseBackup(null).ok).toBe(false);
    expect(parseBackup([1, 2]).ok).toBe(false);
    expect(parseBackup('json').ok).toBe(false);
  });

  test('v2 roundtrip preserves achievements, dailies and archive', () => {
    const res = parseBackup(JSON.parse(JSON.stringify(seededState())));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.profile.achievements).toEqual([
      { id: 'first-task', unlockedAt: 1787000000001 },
    ]);
    expect(res.state.dailies?.questIds).toEqual(['dq-a', 'dq-b']);
    expect(res.state.dailiesArchive).toEqual([{ dateISO: '2026-08-20', missedCount: 1 }]);
  });

  test('malformed secondary rows dropped defensively instead of refusing', () => {
    const s = seededState() as unknown as Record<string, unknown>;
    s.profile = {
      totalXp: 9,
      streakDays: 0,
      lastCompletedDay: null,
      achievements: [
        { id: 'good', unlockedAt: 1 },
        { id: 42, unlockedAt: 2 },
        'junk',
      ],
    };
    s.dailies = { dateISO: 'nope' }; // invalid shape
    const res = parseBackup(s);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.profile.achievements).toEqual([{ id: 'good', unlockedAt: 1 }]);
    expect(res.state.dailies).toBeNull();
  });
});
