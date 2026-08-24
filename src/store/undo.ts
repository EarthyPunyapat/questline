// M13/T13.B: undo engine — safe reversal of the LAST task completion.
// Pure functions over GameState: no I/O, no clock reads inside the math
// (capture takes an injectable day string so every rule is unit-testable).
//
// STREAK POLICY (deliberate): profile.streakDays records daily-engagement
// history — the user DID show up that day. Undo reverses the task + XP but
// does NOT decrement the streak: undo ≠ time travel.

import type { GameState } from '../types/state.ts';
import type { Task, TaskStatus } from '../types/task.ts';
import { localDateStr } from '../xp/streaks.ts';
import { getTask } from './tasks.ts';

/** What a single undo can reverse. Stored on profile.lastUndo (optional
 * field — no schema-version bump needed, same precedent as achievements). */
export interface UndoRecord {
  taskId: string;
  xpGained: number;
  /** Local day ('YYYY-MM-DD') on which the completion happened. */
  at: string;
}

export interface UndoneInfo {
  taskId: string;
  title: string;
  xpGained: number;
}

export interface UndoResult {
  /** New state (or the SAME reference when there was nothing to do). */
  state: GameState;
  /** null when nothing was undone (empty/stale pointer or noop). */
  undone: UndoneInfo | null;
}

/**
 * Record the just-completed task as the single undoable action.
 * Called by the integration layer after each successful completion.
 * Only the LAST completion is kept — capturing overwrites any previous
 * record. `at` defaults to today's local day; inject for tests.
 */
export function captureLastCompletion(
  state: GameState,
  record: { taskId: string; xpGained: number },
  at: string = localDateStr(),
): GameState {
  return {
    ...state,
    profile: {
      ...state.profile,
      lastUndo: { taskId: record.taskId, xpGained: record.xpGained, at },
    },
  };
}

/**
 * Reverse the last completion:
 * - No pointer → noop ({ state unchanged by reference, undone: null }).
 * - Pointer to a missing or already-open task → STALE: drop the pointer,
 *   touch nothing else, report undone: null (never crashes on drift).
 * - Otherwise → task back to status:'todo' with completedAt cleared
 *   (`undefined`, matching toggleDone's un-complete convention),
 *   totalXp = max(0, totalXp - xpGained) (XP never goes negative),
 *   streakDays UNCHANGED (see STREAK POLICY above), pointer cleared so
 *   undo is strictly single-shot (double-undo is a safe noop).
 */
export function undoLastCompletion(state: GameState): UndoResult {
  const rec = state.profile.lastUndo;
  if (!rec) return { state, undone: null };

  // The pointer is always consumed — even on the stale paths below.
  const clearedProfile = { ...state.profile, lastUndo: undefined };

  const task: Task | undefined = getTask(state, rec.taskId);
  if (!task || task.status !== 'done') {
    return { state: { ...state, profile: clearedProfile }, undone: null };
  }

  return {
    state: {
      ...state,
      tasks: state.tasks.map((t): Task =>
        t.id === rec.taskId
          ? { ...t, status: 'todo' as TaskStatus, completedAt: undefined }
          : t,
      ),
      profile: {
        ...clearedProfile,
        totalXp: Math.max(0, state.profile.totalXp - rec.xpGained),
      },
    },
    undone: { taskId: rec.taskId, title: task.title, xpGained: rec.xpGained },
  };
}
