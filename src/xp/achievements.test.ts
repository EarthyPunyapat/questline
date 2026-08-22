import { describe, test, expect } from 'bun:test';
import { defaultState } from '../store/persist.ts';
import { makeId, makeTask, type Task } from '../types/task.ts';
import type { GameState } from '../types/state.ts';
import { xpForLevel } from './levels.ts';
import { ACHIEVEMENTS, evaluateAchievements } from './achievements.ts';

/** Local-time epoch-ms builder (deterministic across TZs). */
const ts = (hour: number, minute = 0): number => new Date(2026, 7, 22, hour, minute).getTime();

const done = (completedAt?: number): Task => ({
  ...makeTask(makeId('t'), 'x', 'easy'),
  status: 'done',
  completedAt,
});

const todo = (): Task => makeTask(makeId('t'), 'y', 'easy');

function stateWith(over: Partial<GameState>): GameState {
  return { ...defaultState(), ...over };
}

function xpToReach(level: number): number {
  let xp = 0;
  for (let k = 1; k < level; k++) xp += xpForLevel(k);
  return xp;
}

describe('ACHIEVEMENTS catalog', () => {
  test('defines at least 10 achievements with unique ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
  });

  test('every def has non-empty title + desc + check fn', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(0);
      expect(typeof a.check).toBe('function');
    }
  });
});

describe('condition boundaries', () => {
  test('first-task: unlocks on first completion only', () => {
    const none = defaultState();
    expect(none.tasks.some((t) => t.status === 'done')).toBe(false);
    const one = stateWith({ tasks: [done(), todo()] });
    const def = ACHIEVEMENTS.find((a) => a.id === 'first-task')!;
    expect(def.check(none)).toBe(false);
    expect(def.check(one)).toBe(true);
  });

  test('ten-tasks: boundary at exactly 10 cumulative completions', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'ten-tasks')!;
    expect(def.check(stateWith({ tasks: Array.from({ length: 9 }, done) }))).toBe(false);
    expect(def.check(stateWith({ tasks: Array.from({ length: 10 }, done) }))).toBe(true);
  });

  test('fifty-tasks: boundary at exactly 50', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'fifty-tasks')!;
    expect(def.check(stateWith({ tasks: Array.from({ length: 49 }, done) }))).toBe(false);
    expect(def.check(stateWith({ tasks: Array.from({ length: 50 }, done) }))).toBe(true);
  });

  test('streak-3 / streak-7 boundaries', () => {
    const s3 = ACHIEVEMENTS.find((a) => a.id === 'streak-3')!;
    const s7 = ACHIEVEMENTS.find((a) => a.id === 'streak-7')!;
    const st = (n: number) => ({
      profile: { totalXp: 0, streakDays: n, lastCompletedDay: null, achievements: [] },
    });
    expect(s3.check(stateWith(st(2)))).toBe(false);
    expect(s3.check(stateWith(st(3)))).toBe(true);
    expect(s7.check(stateWith(st(6)))).toBe(false);
    expect(s7.check(stateWith(st(7)))).toBe(true);
  });

  test('level-5 / level-10 boundaries (exact XP thresholds)', () => {
    const l5 = ACHIEVEMENTS.find((a) => a.id === 'level-5')!;
    const l10 = ACHIEVEMENTS.find((a) => a.id === 'level-10')!;
    const prof = (xp: number) => ({
      profile: { totalXp: xp, streakDays: 0, lastCompletedDay: null, achievements: [] },
    });
    // sanity: threshold construction is exact
    expect(xpToReach(5)).toBeGreaterThan(0);
    expect(l5.check(stateWith(prof(xpToReach(5) - 1)))).toBe(false);
    expect(l5.check(stateWith(prof(xpToReach(5))))).toBe(true);
    expect(l10.check(stateWith(prof(xpToReach(10) - 1)))).toBe(false);
    expect(l10.check(stateWith(prof(xpToReach(10))))).toBe(true);
  });

  test('quest-complete-first: first rewarded quest id', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'quest-complete-first')!;
    expect(def.check(defaultState())).toBe(false);
    expect(def.check(stateWith({ completedQuestIds: ['q-1'] }))).toBe(true);
  });

  test('all-dailies-day: requires completedAll flag today', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'all-dailies-day')!;
    expect(def.check(defaultState())).toBe(false); // no set yet
    expect(
      def.check(stateWith({ dailies: { dateISO: '2026-08-22', questIds: [], completedAll: false } })),
    ).toBe(false);
    expect(
      def.check(stateWith({ dailies: { dateISO: '2026-08-22', questIds: ['dq-a'], completedAll: true } })),
    ).toBe(true);
  });

  test('night-owl: completions between 23:00–04:59 local', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'night-owl')!;
    expect(def.check(stateWith({ tasks: [done(ts(22, 59))] }))).toBe(false);
    expect(def.check(stateWith({ tasks: [done(ts(23, 0))] }))).toBe(true);
    expect(def.check(stateWith({ tasks: [done(ts(23, 30))] }))).toBe(true);
    expect(def.check(stateWith({ tasks: [done(ts(4, 59))] }))).toBe(true);
    expect(def.check(stateWith({ tasks: [done(ts(5, 0))] }))).toBe(false);
    expect(def.check(stateWith({ tasks: [todo()] }))).toBe(false); // nothing done
    expect(def.check(stateWith({ tasks: [done()] }))).toBe(false); // done but never stamped
  });

  test('early-bird: completions between 05:00–07:59 local', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'early-bird')!;
    expect(def.check(stateWith({ tasks: [done(ts(4, 59))] }))).toBe(false);
    expect(def.check(stateWith({ tasks: [done(ts(5, 0))] }))).toBe(true);
    expect(def.check(stateWith({ tasks: [done(ts(7, 59))] }))).toBe(true);
    expect(def.check(stateWith({ tasks: [done(ts(8, 0))] }))).toBe(false);
  });
});

describe('evaluateAchievements', () => {
  test('fresh empty state → zero churn (same reference)', () => {
    const s = defaultState();
    const res = evaluateAchievements(s, 1000);
    expect(res.unlocked).toEqual([]);
    expect(res.state).toBe(s);
  });

  test('unlocks every satisfied condition at once with timestamps', () => {
    const s = stateWith({
      tasks: Array.from({ length: 12 }, done),
      profile: { totalXp: xpToReach(6), streakDays: 4, lastCompletedDay: null, achievements: [] },
    });
    const res = evaluateAchievements(s, 12345);
    const ids = res.unlocked.map((u) => u.id).sort();
    expect(ids).toContain('first-task');
    expect(ids).toContain('ten-tasks');
    expect(ids).toContain('streak-3');
    expect(ids).toContain('level-5');
    expect(ids).not.toContain('streak-7');
    expect(ids).not.toContain('fifty-tasks');
    // each unlock carries title + timestamp
    for (const u of res.unlocked) {
      expect(u.title.length).toBeGreaterThan(0);
    }
    const stored = res.state.profile.achievements ?? [];
    expect(stored.length).toBe(res.unlocked.length);
    expect(stored.every((a) => a.unlockedAt === 12345)).toBe(true);
    expect(ids.every((id) => stored.some((a) => a.id === id))).toBe(true);
  });

  test('idempotent: re-evaluation after unlock changes nothing', () => {
    let s = stateWith({ tasks: [done()] });
    const first = evaluateAchievements(s, 1);
    s = first.state;
    expect(first.unlocked.map((u) => u.id)).toContain('first-task');
    const second = evaluateAchievements(s, 2);
    expect(second.unlocked).toEqual([]);
    expect(second.state).toBe(s); // reference-equal zero churn
    expect((s.profile.achievements ?? []).length).toBe(1);
  });

  test('never re-unlocks a pre-seeded achievement', () => {
    const s = stateWith({
      tasks: [done()],
      profile: {
        totalXp: 0,
        streakDays: 0,
        lastCompletedDay: null,
        achievements: [{ id: 'first-task', unlockedAt: 42 }],
      },
    });
    const res = evaluateAchievements(s, 99);
    expect(res.unlocked).toEqual([]);
    expect(res.state.profile.achievements).toEqual([{ id: 'first-task', unlockedAt: 42 }]);
  });
});
