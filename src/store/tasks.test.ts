import { describe, expect, test } from 'bun:test';
import {
  addTask,
  canDelete,
  deleteTask,
  getTask,
  listByStatus,
  selectNextId,
  toggleDone,
} from './tasks.ts';
import { makeTask } from '../types/task.ts';
import { defaultState } from '../store/persist.ts';
import type { GameState } from '../types/state.ts';

const base = (): GameState => defaultState();

/** ids are generated — always grab from returned state, never assume. */
function lastId(s: GameState): string {
  const t = s.tasks[s.tasks.length - 1];
  if (!t) throw new Error('expected a task');
  return t.id;
}

describe('tasks store', () => {
  test('addTask trims title and appends immutably', () => {
    const s0 = base();
    const s1 = addTask(s0, '  slay the dragon  ', 'hard');
    expect(s1.tasks.length).toBe(1);
    expect(s1.tasks[0]!.title).toBe('slay the dragon');
    expect(s1.tasks[0]!.status).toBe('todo');
    expect(s1.tasks[0]!.completedAt).toBeUndefined();
    // original state untouched
    expect(s0.tasks.length).toBe(0);
  });

  test('addTask links questId when provided', () => {
    const s = addTask(base(), 'step one', 'easy', 'q_1');
    expect(s.tasks[0]!.questId).toBe('q_1');
    const s2 = addTask(base(), 'no quest', 'easy');
    expect(s2.tasks[0]!.questId).toBeUndefined();
  });

  test('toggleDone stamps epoch-ms completedAt; second toggle reverts', () => {
    let s = addTask(base(), 'x', 'medium');
    const id = lastId(s);
    const t0 = 1724000000000;
    s = toggleDone(s, id, t0);
    expect(s.tasks[0]!.status).toBe('done');
    expect(s.tasks[0]!.completedAt).toBe(t0);
    s = toggleDone(s, id);
    expect(s.tasks[0]!.status).toBe('todo');
    expect(s.tasks[0]!.completedAt).toBeUndefined();
  });

  test('toggle unknown id is a no-op (new object, equal data)', () => {
    const s = addTask(base(), 'x', 'easy');
    const after = toggleDone(s, 'does-not-exist');
    expect(after).toEqual(s);
  });

  test('deleteTask removes only the target', () => {
    let s = addTask(base(), 'a', 'easy');
    const aId = lastId(s);
    s = addTask(s, 'b', 'easy');
    s = addTask(s, 'c', 'easy');
    s = deleteTask(s, aId);
    expect(s.tasks.map((t) => t.title)).toEqual(['b', 'c']);
  });

  test('getTask finds by id', () => {
    const s = addTask(base(), 'findme', 'hard');
    const id = lastId(s);
    expect(getTask(s, id)?.title).toBe('findme');
    expect(getTask(s, 'missing')).toBeUndefined();
  });

  test('listByStatus filters', () => {
    let s = addTask(base(), 'a', 'easy');
    const aId = lastId(s);
    s = addTask(s, 'b', 'easy');
    s = toggleDone(s, aId);
    expect(listByStatus(s, 'done').map((t) => t.title)).toEqual(['a']);
    expect(listByStatus(s, 'todo').map((t) => t.title)).toEqual(['b']);
  });
});

describe('selectNextId (M9 delete continuity)', () => {
  const ids = ['a', 'b', 'c'];

  test('delete middle of 3 → selection lands on following row', () => {
    expect(selectNextId(ids, 'b')).toBe('c');
  });

  test('delete head → following item becomes the new head', () => {
    expect(selectNextId(ids, 'a')).toBe('b');
  });

  test('delete tail → clamps to new tail (never undefined)', () => {
    expect(selectNextId(ids, 'c')).toBe('b');
  });

  test('list becomes empty → undefined', () => {
    expect(selectNextId(['x'], 'x')).toBeUndefined();
    expect(selectNextId([], 'x')).toBeUndefined();
  });

  test('unknown removed id keeps the tail defensively', () => {
    expect(selectNextId(ids, 'zz')).toBe('c');
  });
});

describe('canDelete (M9 blocker feedback)', () => {
  test('daily blocks with an actionable reason pointing at x-dismiss', () => {
    const daily = { ...makeTask('dq-1', 'stretch', 'easy'), isDaily: true };
    const res = canDelete(daily);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("can't be deleted");
    expect(res.reason).toMatch(/\bx\b/);
  });

  test('regular task deletes freely', () => {
    expect(canDelete(makeTask('t-1', 'alpha', 'easy')).ok).toBe(true);
  });

  test('nothing selected blocks softly with a reason', () => {
    const res = canDelete(undefined);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });
});
