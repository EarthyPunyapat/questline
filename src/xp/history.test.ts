// M12/T12.B: pure coverage for the weekly review aggregation.
import { describe, expect, test } from 'bun:test';
import { DEFAULT_STATE, type GameState } from '../types/state.ts';
import { createTask, type Task } from '../types/task.ts';
import { weekReview } from './history.ts';

const TODAY = '2026-08-24';

/** Epoch-ms for TODAY + offset local calendar days (Aug has no DST traps). */
const dayMs = (offset: number): number => new Date(2026, 7, 24 + offset).getTime();

/** Fixture task created `created` days ago; done `done` days ago when given. */
function mk(
  title: string,
  difficulty: Task['difficulty'],
  created: number,
  done?: number,
): Task {
  const t = createTask(title, difficulty);
  t.createdAt = dayMs(created);
  if (done !== undefined) {
    t.status = 'done';
    t.completedAt = dayMs(done);
  }
  return t;
}

describe('weekReview', () => {
  test('known 7-day fixture: rate, avg and best day across a none-day', () => {
    const state: GameState = {
      ...DEFAULT_STATE,
      tasks: [
        mk('gym', 'easy', -1, 0), // done today, +10
        mk('thesis', 'hard', -2, -2), // done 2d ago, +50
        mk('laundry', 'medium', -3), // still open
        mk('ancient', 'easy', -9, -9), // outside window entirely
      ],
      completedQuestIds: ['q1', 'q2'],
      profile: { ...DEFAULT_STATE.profile, streakDays: 3 },
    };
    const r = weekReview(state, TODAY);
    expect(r.completionRatePct).toBe(67); // 2 of 3 in-window creations
    expect(r.bestDay).toEqual({ dateISO: '2026-08-22', xp: 50 });
    expect(r.avgXpPerDay).toBe(9); // round(60 / 7)
    expect(r.currentStreak).toBe(3);
    expect(r.questsCompletedTotal).toBe(2);
  });

  test('best-day tie-break picks the MOST RECENT day', () => {
    const state: GameState = {
      ...DEFAULT_STATE,
      tasks: [
        mk('a', 'medium', -5, -4), // 25 XP on Aug 20
        mk('b', 'medium', -3, -2), // 25 XP on Aug 22
      ],
    };
    expect(weekReview(state, TODAY).bestDay).toEqual({
      dateISO: '2026-08-22',
      xp: 25,
    });
  });

  test('streak scan crosses month boundaries; gaps reset runs', () => {
    // Jul 30+31, Aug 1+2 = run of 4; an isolated Aug 10 does not extend it.
    const jul = (d: number): number => new Date(2026, 6, d).getTime();
    const done = (
      title: string,
      ms: number,
    ): Task => {
      const t = createTask(title, 'easy');
      t.createdAt = ms;
      t.status = 'done';
      t.completedAt = ms;
      return t;
    };
    const state: GameState = {
      ...DEFAULT_STATE,
      profile: { ...DEFAULT_STATE.profile, streakDays: 1 },
      tasks: [
        done('j1', jul(30)),
        done('j2', jul(31)),
        done('a1', dayMs(-23)), // Aug 1
        done('a2', dayMs(-22)), // Aug 2
        done('lone', dayMs(-14)), // Aug 10
      ],
    };
    const r = weekReview(state, TODAY);
    expect(r.bestStreakEver).toBe(4);
    expect(r.currentStreak).toBe(1); // mirrors profile, not the scan
  });

  test('zero-division guard: nothing created in-window → rate 0, no NaN', () => {
    const state: GameState = {
      ...DEFAULT_STATE,
      tasks: [mk('old-but-done', 'hard', -30, -30)],
    };
    const r = weekReview(state, TODAY);
    expect(r.completionRatePct).toBe(0);
    expect(r.bestDay).toBeNull(); // its XP falls outside the window
    expect(r.avgXpPerDay).toBe(0);
  });

  test('empty state degrades to graceful zeros/nulls', () => {
    const r = weekReview(DEFAULT_STATE, TODAY);
    expect(r.completionRatePct).toBe(0);
    expect(r.bestDay).toBeNull();
    expect(r.avgXpPerDay).toBe(0);
    expect(r.currentStreak).toBe(0);
    expect(r.bestStreakEver).toBe(0);
    expect(r.questsCompletedTotal).toBe(0);
  });

  test('defaults todayISO to the real local today', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const probe: GameState = {
      ...DEFAULT_STATE,
      tasks: [mk('today-hero', 'easy', 0, 0)],
    };
    const r = weekReview(probe);
    expect(r.bestDay?.dateISO).toBe(expected);
    expect(r.avgXpPerDay).toBe(1); // round(10 / 7)
  });
});
