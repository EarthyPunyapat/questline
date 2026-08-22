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

export function addTask(
  state: GameState,
  title: string,
  difficulty: Difficulty = 'medium',
  questId?: string,
  recurrence?: Recurrence,
): GameState {
  const task = makeTask(nextId(), title.trim(), difficulty, questId, recurrence);
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

export function listByStatus(state: GameState, status: TaskStatus): Task[] {
  return state.tasks.filter((t) => t.status === status);
}

export function getTask(state: GameState, id: string): Task | undefined {
  return state.tasks.find((t) => t.id === id);
}

/** Display order: todos first by createdAt; done after, most recent completion last. */
export function sortedForDisplay(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
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
