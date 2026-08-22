import { describe, test, expect } from 'bun:test';
import { awardQuestIfComplete } from './quests.ts';
import { DEFAULT_STATE, type GameState } from '../types/state.ts';
import { createQuest } from '../types/quest.ts';
import { makeTask } from '../types/task.ts';

function stateWith(partial: Partial<GameState>): GameState {
  return { ...structuredClone(DEFAULT_STATE), ...partial };
}

const doneTask = (id: string) => ({ ...makeTask(id, id, 'easy'), status: 'done' as const, completedAt: 1 });

describe('quests', () => {
  const q = createQuest('chore chain', ['a', 'b'], 30, 'q1');

  test('partial completion → no award', () => {
    const s = stateWith({ tasks: [doneTask('a'), makeTask('b', 'b', 'easy')] });
    const r = awardQuestIfComplete(s, q);
    expect(r.awarded).toBe(false);
    expect(r.xp).toBe(0);
  });

  test('all done → award once, records id', () => {
    const s = stateWith({ tasks: [doneTask('a'), doneTask('b')] });
    const r = awardQuestIfComplete(s, q);
    expect(r.awarded).toBe(true);
    expect(r.xp).toBe(30);
    expect(r.state.profile.totalXp).toBe(30);
    expect(r.state.completedQuestIds).toContain('q1');
  });

  test('double-completion guard → second call no-op', () => {
    const s = stateWith({ tasks: [doneTask('a'), doneTask('b')], completedQuestIds: ['q1'] });
    const r = awardQuestIfComplete(s, q);
    expect(r.awarded).toBe(false);
    expect(r.xp).toBe(0);
    expect(r.state.profile.totalXp).toBe(0);
  });

  test('empty quest (no tasks) never auto-completes', () => {
    const r = awardQuestIfComplete(stateWith({}), createQuest('void', [], 99, 'q2'));
    expect(r.awarded).toBe(false);
  });

  test('quest referencing missing task ids never completes', () => {
    const r = awardQuestIfComplete(stateWith({ tasks: [doneTask('a')] }), q);
    expect(r.awarded).toBe(false);
  });
});
