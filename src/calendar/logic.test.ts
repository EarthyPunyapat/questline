// M10/T10.A: pure-logic coverage for calendar grid + day activity.
import { describe, expect, test } from 'bun:test';
import { DEFAULT_STATE, type GameState } from '../types/state.ts';
import { makeTask, type Task } from '../types/task.ts';
import {
  buildMonthGrid,
  dayActivity,
  monthLabel,
  toDayISO,
} from './logic.ts';

const cells = (g: ReadonlyArray<ReadonlyArray<string | null>>): string[] =>
  g.flat().filter((c): c is string => c !== null);

const doneTask = (
  title: string,
  difficulty: Task['difficulty'],
  atMs: number,
): Task => ({
  ...makeTask('t', title, difficulty),
  status: 'done',
  completedAt: atMs,
});

describe('buildMonthGrid', () => {
  test('always returns a 6x7 grid', () => {
    for (let m = 0; m < 12; m++) {
      const g = buildMonthGrid(2026, m);
      expect(g.length).toBe(6);
      for (const row of g) expect(row.length).toBe(7);
    }
  });

  test('Jan 2026 starts Thursday -> Mon-Wed pad, day 1 at col 3', () => {
    const g = buildMonthGrid(2026, 0);
    expect(g[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(g[0]![3]).toBe('2026-01-01');
    expect(cells(g).length).toBe(31);
    expect(cells(g).at(-1)).toBe('2026-01-31');
  });

  test('Feb 2026 starts Sunday -> six leading nulls (Mon-start invariant)', () => {
    const g = buildMonthGrid(2026, 1);
    expect(g[0]!.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(g[0]![6]).toBe('2026-02-01');
    expect(cells(g).length).toBe(28); // non-leap: exactly 4 weeks
    expect(g[5]!.every((c) => c === null)).toBe(true); // last row all padding
  });

  test('leap-year Feb 2028 exposes 29 days', () => {
    const g = buildMonthGrid(2028, 1);
    expect(cells(g).length).toBe(29);
    expect(cells(g).at(-1)).toBe('2028-02-29');
  });

  test('all 12 months of 2026: lead + first-day + real length', () => {
    const lens = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let m = 0; m < 12; m++) {
      const lead = (new Date(2026, m, 1).getDay() + 6) % 7;
      const flat = buildMonthGrid(2026, m).flat();
      for (let i = 0; i < lead; i++) expect(flat[i]).toBeNull();
      expect(flat[lead]).toBe(`2026-${String(m + 1).padStart(2, '0')}-01`);
      expect(cells(buildMonthGrid(2026, m)).length).toBe(lens[m]!);
    }
  });
});

describe('toDayISO / monthLabel', () => {
  test('epoch ms -> local YYYY-MM-DD (no UTC spill)', () => {
    expect(toDayISO(new Date(2026, 7, 23, 12))).toBe('2026-08-23');
  });

  test('monthLabel renders "August 2026" style', () => {
    expect(monthLabel(2026, 7)).toBe('August 2026');
    expect(monthLabel(2028, 0)).toBe('January 2028');
  });
});

describe('dayActivity', () => {
  const aug22 = new Date(2026, 7, 22, 15).getTime();
  const aug21 = new Date(2026, 7, 21, 9).getTime();

  test('same-day completions sum base XP_TABLE values (10/25/50)', () => {
    const state: GameState = {
      ...DEFAULT_STATE,
      tasks: [
        doneTask('a', 'easy', aug22),
        doneTask('b', 'hard', aug22 + 3_600_000),
        doneTask('c', 'medium', aug22 + 7_200_000),
      ],
    };
    expect(dayActivity(state, '2026-08-22')).toEqual({
      completions: 3,
      xpGained: 85,
    });
  });

  test('other days and empty state are zero; todo tasks ignored', () => {
    const state: GameState = {
      ...DEFAULT_STATE,
      tasks: [
        doneTask('a', 'easy', aug22),
        { ...makeTask('t2', 'open', 'medium') }, // status todo
      ],
    };
    expect(dayActivity(state, '2026-08-21')).toEqual({ completions: 0, xpGained: 0 });
    expect(dayActivity(DEFAULT_STATE, '2026-08-22')).toEqual({
      completions: 0,
      xpGained: 0,
    });
  });

  test("today's daily tasks count while they live in state.tasks", () => {
    const daily: Task = {
      ...makeTask('d1', 'drink water', 'easy'),
      isDaily: true,
      status: 'done',
      completedAt: aug22,
    };
    const state: GameState = { ...DEFAULT_STATE, tasks: [daily] };
    expect(dayActivity(state, '2026-08-22')).toEqual({
      completions: 1,
      xpGained: 10,
    });
  });

  test('late-night completion lands on its LOCAL date', () => {
    // 23:30 local stays same day even if UTC already rolled over.
    const late = new Date(2026, 7, 22, 23, 30).getTime();
    const state: GameState = {
      ...DEFAULT_STATE,
      tasks: [doneTask('night', 'hard', late)],
    };
    expect(dayActivity(state, '2026-08-22').completions).toBe(1);
    expect(dayActivity(state, '2026-08-23').completions).toBe(0);
  });
});
