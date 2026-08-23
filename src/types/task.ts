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

/** Recurring schedule (v3). `daily` resets every day; `weekly` resets only on
 * the listed weekdays (0=Sun..6=Sat, non-empty). */
export interface Recurrence {
  freq: 'daily' | 'weekly';
  weekdays?: number[];
}

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
  /** Optional repeat schedule (v3); absent = one-shot task. */
  recurrence?: Recurrence;
  /** Optional due day (M11/B), LOCAL 'YYYY-MM-DD'. Additive like skippedIds:
   * no schema bump; older saves load unchanged. */
  dueDate?: string;
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
  recurrence?: Recurrence,
  dueDate?: string,
): Task {
  if (dueDate !== undefined && !isValidDueDate(dueDate)) {
    throw new Error(`invalid dueDate '${dueDate}' (want YYYY-MM-DD)`);
  }
  const task: Task = {
    id,
    title,
    difficulty,
    status: 'todo',
    createdAt: Date.now(),
    completedAt: undefined,
  };
  if (questId !== undefined && questId !== '') task.questId = questId;
  if (recurrence !== undefined) task.recurrence = recurrence;
  if (dueDate !== undefined) task.dueDate = dueDate;
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
    (t.isDaily === undefined || typeof t.isDaily === 'boolean') &&
    (t.dueDate === undefined || isValidDueDate(t.dueDate))
  );
}

/** True for a real LOCAL calendar day in strict 'YYYY-MM-DD' form
 * (rejects 2026-02-30, short forms, non-strings). */
export function isValidDueDate(u: unknown): u is string {
  if (typeof u !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u)) return false;
  const [y, m, d] = u.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const DUE_OFFSETS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  'next-week': 7,
};

/**
 * Resolve a due spec against a local day: 'today' | 'tomorrow' | 'next-week'
 * shift relative to `todayISO`; anything else must already be a valid
 * 'YYYY-MM-DD'. Returns undefined when the spec is malformed/unknown.
 */
export function resolveDueSpec(spec: string, todayISO: string): string | undefined {
  const off = DUE_OFFSETS[spec];
  if (off === undefined) return isValidDueDate(spec) ? spec : undefined;
  const [y, m, d] = todayISO.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + off);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** XP awarded for completing this task. */
export function xpValue(task: Pick<Task, 'difficulty'>): number {
  return XP_TABLE[task.difficulty];
}
