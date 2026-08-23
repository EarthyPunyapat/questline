// Task CRUD over GameState — immutable updates; caller persists via saveStateAtomic.
import { randomUUID } from 'node:crypto';
import {
  makeTask,
  type Difficulty,
  type Recurrence,
  type Task,
  type TaskStatus,
} from '../types/task.ts';
import type { GameState } from '../types/state.ts';
import { localDateStr } from '../xp/streaks.ts';

export function addTask(
  state: GameState,
  title: string,
  difficulty: Difficulty = 'medium',
  questId?: string,
  recurrence?: Recurrence,
  dueDate?: string,
): GameState {
  const task = makeTask(nextId(), title.trim(), difficulty, questId, recurrence, dueDate);
  return { ...state, tasks: [...state.tasks, task] };
}

/** Toggle done/todo. completedAt = epoch ms when done; undefined when reverted. */
export function toggleDone(state: GameState, id: string, now: number = Date.now()): GameState {
  return {
    ...state,
    tasks: state.tasks.map((t) => {
      if (t.id !== id) return t;
      if (t.status === 'todo') return { ...t, status: 'done' as TaskStatus, completedAt: now };
      return { ...t, status: 'todo' as TaskStatus, completedAt: undefined };
    }),
  };
}

export function deleteTask(state: GameState, id: string): GameState {
  return { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
}

/**
 * M9 delete-selection continuity: after removing `removedId` from an ordered
 * id list, the selection lands on the item that NOW occupies the removed
 * row's index, clamped to the last item. Empty list → undefined. Unknown id
 * → keep the tail (defensive).
 */
export function selectNextId(
  ids: readonly string[],
  removedId: string,
): string | undefined {
  const rest = ids.filter((id) => id !== removedId);
  if (rest.length === 0) return undefined;
  const idx = ids.indexOf(removedId);
  return rest[Math.min(idx < 0 ? rest.length - 1 : idx, rest.length - 1)]!;
}

export interface DeletePermission {
  ok: boolean;
  /** Human-readable blocker shown as a transient flash when ok === false. */
  reason?: string;
}

/** Pure gate for the 'd' key so the block path is unit-testable. */
export function canDelete(task: Task | undefined): DeletePermission {
  if (!task) return { ok: false, reason: 'Nothing selected.' };
  if (task.isDaily) {
    return {
      ok: false,
      reason: "☀ dailies renew daily — they can't be deleted. Press x to dismiss for today.",
    };
  }
  return { ok: true };
}

export function listByStatus(state: GameState, status: TaskStatus): Task[] {
  return state.tasks.filter((t) => t.status === status);
}

export function getTask(state: GameState, id: string): Task | undefined {
  return state.tasks.find((t) => t.id === id);
}

/**
 * Display order (M11/B): among todos, tasks due today or overdue float to the
 * top; done rows stay after. Within each class the original rules hold
 * (done: most recent completion first; todos: stable createdAt tie-break).
 */
export function sortedForDisplay(tasks: readonly Task[], todayISO: string = localDateStr()): Task[] {
  const urgency = (t: Task): number =>
    t.status !== 'todo' ? 2 : t.dueDate !== undefined && t.dueDate <= todayISO ? 0 : 1;
  return [...tasks].sort((a, b) => {
    const ua = urgency(a);
    const ub = urgency(b);
    if (ua !== ub) return ua - ub;
    if (a.status !== b.status) return a.status === 'todo' ? -1 : 1;
    const ca = a.completedAt ?? 0;
    const cb = b.completedAt ?? 0;
    if (ca !== cb) return cb - ca;
    return a.createdAt - b.createdAt;
  });
}

function nextId(): string {
  return `t-${randomUUID().slice(0, 8)}`;
}
