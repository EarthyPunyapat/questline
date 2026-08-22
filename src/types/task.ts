// Task domain model: types, factories, difficulty→XP table.
// Timestamps are epoch-ms numbers (pinned by store tests); completedAt is
// undefined while todo and set on completion.

export type Difficulty = 'easy' | 'medium' | 'hard';

/** XP awarded on completion, by difficulty. */
export const XP_TABLE: Record<Difficulty, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
};

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'] as const;

export type TaskStatus = 'todo' | 'done';

export interface Task {
  id: string;
  title: string;
  difficulty: Difficulty;
  status: TaskStatus;
  createdAt: number; // epoch ms
  /** Epoch ms when completed; undefined while todo. */
  completedAt?: number;
  /** Optional quest chain membership. */
  questId?: string;
  /** True for generated daily-quest tasks (v2 dailies live in state.tasks). */
  isDaily?: boolean;
}

/** Short unique id: `<prefix>-<8 hex>`. */
export function makeId(prefix: string): string {
  const rand = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  return `${prefix}-${rand}`;
}

/** Id-explicit factory (used by store + persistence tests). */
export function makeTask(
  id: string,
  title: string,
  difficulty: Difficulty,
  questId?: string,
): Task {
  const task: Task = {
    id,
    title,
    difficulty,
    status: 'todo',
    createdAt: Date.now(),
    completedAt: undefined,
  };
  if (questId !== undefined && questId !== '') task.questId = questId;
  return task;
}

/** Convenience factory: generates id, trims title, stamps createdAt. */
export function createTask(
  title: string,
  difficulty: Difficulty = 'medium',
  questId?: string,
): Task {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new Error('task title must be non-empty');
  return makeTask(makeId('t'), trimmed, difficulty, questId);
}

/** Runtime validator (zod-free): narrows unknown → Task. */
export function isValidTask(u: unknown): u is Task {
  if (typeof u !== 'object' || u === null) return false;
  const t = u as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    (t.difficulty === 'easy' || t.difficulty === 'medium' || t.difficulty === 'hard') &&
    (t.status === 'todo' || t.status === 'done') &&
    typeof t.createdAt === 'number' &&
    (t.completedAt === undefined || typeof t.completedAt === 'number') &&
    (t.questId === undefined || typeof t.questId === 'string') &&
    (t.isDaily === undefined || typeof t.isDaily === 'boolean')
  );
}

/** XP awarded for completing this task. */
export function xpValue(task: Pick<Task, 'difficulty'>): number {
  return XP_TABLE[task.difficulty];
}
