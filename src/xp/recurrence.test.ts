// Recurrence rollover tests (S8.3.2): midnight crossing, weekday math with
// Sunday=0 edge, same-day idempotency, profile untouched.
import { describe, test, expect } from 'bun:test';
import { applyRecurrenceRollover, isRecurrenceDue } from './recurrence.ts';
import { makeTask } from '../types/task.ts';
import type { GameState } from '../types/state.ts';
import { DEFAULT_STATE } from '../types/state.ts';

/** Epoch ms of LOCAL noon on an ISO day (safe from TZ midnight shifts). */
function noon(iso: string): number {
  return new Date(`${iso}T12:00:00`).getTime();
}

function doneRec(title: string, rec: { freq: 'daily' } | { freq: 'weekly'; weekdays: number[] }, completedAtMs: number) {
  const t = makeTask('t-r1', title, 'easy');
  t.status = 'done';
  t.completedAt = completedAtMs;
  // Cast keeps literal narrowness while matching the optional field shape.
  t.recurrence = rec as typeof t.recurrence;
  return t;
}

function stateWith(...tasks: GameState['tasks']): GameState {
  return structuredClone({ ...DEFAULT_STATE, tasks });
}

describe('isRecurrenceDue', () => {
  test('daily due on any later day', () => {
    expect(isRecurrenceDue({ freq: 'daily' }, noon('2026-08-21'), '2026-08-22')).toBe(true);
  });

  test('midnight boundary: done yesterday late evening → due today', () => {
    const late = new Date('2026-08-21T23:59:00').getTime();
    expect(isRecurrenceDue({ freq: 'daily' }, late, '2026-08-22')).toBe(true);
    // ...but still same LOCAL day → not due
    expect(isRecurrenceDue({ freq: 'daily' }, late, '2026-08-21')).toBe(false);
  });

  test('same-day completion never resets (idempotent)', () => {
    expect(isRecurrenceDue({ freq: 'daily' }, noon('2026-08-22'), '2026-08-22')).toBe(false);
  });

  test('weekly Sunday=0 edge: scheduled [0] fires on Sunday', () => {
    // 2026-08-23 is a Sunday (getDay() === 0)
    expect(new Date('2026-08-23T00:00:00').getDay()).toBe(0);
    expect(
      isRecurrenceDue({ freq: 'weekly', weekdays: [0] }, noon('2026-08-16'), '2026-08-23'),
    ).toBe(true);
  });

  test('weekly non-scheduled day does not reset', () => {
    expect(
      isRecurrenceDue({ freq: 'weekly', weekdays: [1] }, noon('2026-08-16'), '2026-08-23'),
    ).toBe(false); // Sunday boot, Monday-only task
  });

  test('weekly completed today stays done even on a scheduled day', () => {
    expect(
      isRecurrenceDue({ freq: 'weekly', weekdays: [0] }, noon('2026-08-23'), '2026-08-23'),
    ).toBe(false);
  });

  test('weekly empty weekdays never due', () => {
    expect(
      isRecurrenceDue({ freq: 'weekly', weekdays: [] }, noon('2026-08-16'), '2026-08-23'),
    ).toBe(false);
  });
});

describe('applyRecurrenceRollover', () => {
  test('resets due daily task: todo, completedAt cleared, identity kept', () => {
    const s = stateWith(doneRec('stretch', { freq: 'daily' }, noon('2026-08-21')));
    const next = applyRecurrenceRollover(s, '2026-08-22');
    expect(next).not.toBe(s);
    const t = next.tasks[0]!;
    expect(t.status).toBe('todo');
    expect(t.completedAt).toBeUndefined();
    expect(t.id).toBe('t-r1');
    expect(t.title).toBe('stretch');
    expect(t.recurrence?.freq).toBe('daily');
  });

  test('returns SAME reference when nothing due (skip-persist hint)', () => {
    const s = stateWith(makeTask('t-plain', 'plain', 'easy'));
    expect(applyRecurrenceRollover(s, '2026-08-22')).toBe(s);
  });

  test('profile untouched by resets (streak logic driven by completions only)', () => {
    const s = stateWith(doneRec('jog', { freq: 'daily' }, noon('2026-08-20')));
    s.profile = { totalXp: 777, streakDays: 5, lastCompletedDay: '2026-08-21', achievements: [] };
    const next = applyRecurrenceRollover(s, '2026-08-22');
    expect(next.profile).toEqual(s.profile);
  });
});
