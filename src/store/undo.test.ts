// M13/T13.B: pure coverage for the undo engine.
// Isolated: imports ONLY the target module + type/factory helpers (no I/O).
import { describe, expect, test } from 'bun:test';
import { DEFAULT_STATE, type GameState } from '../types/state.ts';
import { createTask } from '../types/task.ts';

import {
  captureLastCompletion,
  undoLastCompletion,
} from './undo.ts';

/** Fixture: one done task worth `xp` completed at a known epoch-ms,
 * with the undo pointer captured against it and totalXp seeded to `xp`. */
function doneState(xp = 25): { state: GameState; taskId: string } {
  const t = createTask('write report', 'medium');
  t.status = 'done';
  t.completedAt = 1787500000000;
  const state: GameState = {
    ...DEFAULT_STATE,
    tasks: [t],
    profile: {
      ...DEFAULT_STATE.profile,
      totalXp: xp,
      streakDays: 4,
      lastUndo: { taskId: t.id, xpGained: xp, at: '2026-08-24' },
    },
  };
  return { state, taskId: t.id };
}

describe('captureLastCompletion', () => {
  test('stores taskId/xpGained/at on profile.lastUndo', () => {
    const t = createTask('gym', 'easy');
    const state: GameState = { ...DEFAULT_STATE, tasks: [t] };
    const next = captureLastCompletion(
      { ...state },
      { taskId: t.id, xpGained: 10 },
      '2026-08-24',
    );
    expect(next.profile.lastUndo).toEqual({
      taskId: t.id,
      xpGained: 10,
      at: '2026-08-24',
    });
  });

  test('overwrites any previous record (only LAST completion is undoable)', () => {
    const { state } = doneState();
    const next = captureLastCompletion(
      state,
      { taskId: 't-other', xpGained: 50 },
      '2026-08-25',
    );
    expect(next.profile.lastUndo?.taskId).toBe('t-other');
  });

  test('defaults `at` to today without mutating other fields', () => {
    const next = captureLastCompletion(DEFAULT_STATE, {
      taskId: 'x',
      xpGained: 5,
    });
    expect(typeof next.profile.lastUndo?.at).toBe('string');
    expect(next.profile.totalXp).toBe(0);
  });
});

describe('undoLastCompletion', () => {
  test('full undo: task back to todo, completedAt cleared, exact XP subtracted', () => {
    const { state, taskId } = doneState(25);
    const res = undoLastCompletion(state);
    expect(res.undone).toEqual({
      taskId,
      title: 'write report',
      xpGained: 25,
    });
    const t = res.state.tasks.find((x) => x.id === taskId);
    expect(t?.status).toBe('todo');
    expect(t?.completedAt).toBeUndefined();
    expect(res.state.profile.totalXp).toBe(0);
    // STREAK POLICY: daily-engagement history is NOT time-travelled.
    expect(res.state.profile.streakDays).toBe(4);
    expect(res.state.profile.lastUndo).toBeUndefined();
  });

  test('XP floors at 0 when the profile has less than xpGained', () => {
    const { state } = doneState(25);
    const drained: GameState = {
      ...state,
      profile: { ...state.profile, totalXp: 7 },
    };
    const res = undoLastCompletion(drained);
    expect(res.state.profile.totalXp).toBe(0);
  });

  test('empty lastUndo is a noop returning undone:null', () => {
    const res = undoLastCompletion(DEFAULT_STATE);
    expect(res.undone).toBeNull();
    expect(res.state).toBe(DEFAULT_STATE); // same reference — nothing rebuilt
  });

  test('double-undo: second call is a noop (pointer cleared after first)', () => {
    const { state } = doneState(25);
    const once = undoLastCompletion(state);
    expect(once.undone).not.toBeNull();
    const twice = undoLastCompletion(once.state);
    expect(twice.undone).toBeNull();
    expect(twice.state.tasks[0]?.status).toBe('todo'); // stays undone, no change
    expect(twice.state.profile.totalXp).toBe(0); // not subtracted twice
  });

  test('stale pointer (task deleted since): clears pointer safely, no crash', () => {
    const { state } = doneState();
    const pruned: GameState = { ...state, tasks: [] }; // task deleted elsewhere
    const res = undoLastCompletion(pruned);
    expect(res.undone).toBeNull();
    expect(res.state.profile.lastUndo).toBeUndefined();
    expect(res.state.profile.totalXp).toBe(25); // untouched
  });

  test('stale pointer (task already re-opened): clears pointer only', () => {
    const { state, taskId } = doneState();
    const reopened: GameState = {
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'todo' as const } : t,
      ),
    };
    const res = undoLastCompletion(reopened);
    expect(res.undone).toBeNull();
    expect(res.state.profile.lastUndo).toBeUndefined();
    expect(res.state.profile.totalXp).toBe(25);
  });
});
