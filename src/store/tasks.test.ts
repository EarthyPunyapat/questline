import { describe, expect, test } from 'bun:test';
import { addTask, deleteTask, getTask, listByStatus, toggleDone } from './tasks.ts';
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
