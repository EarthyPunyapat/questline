// M12/T12.C: pure coverage for the quest library — templates + instantiation.
import { describe, expect, test } from 'bun:test';
import { DEFAULT_STATE, type GameState } from '../types/state.ts';
import type { Quest } from '../types/quest.ts';
import type { Task } from '../types/task.ts';
import {
  instantiateTemplate,
  QUEST_TEMPLATES,
} from './library.ts';

describe('QUEST_TEMPLATES', () => {
  test('ships at least 5 templates with unique ids and titles', () => {
    expect(QUEST_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const ids = QUEST_TEMPLATES.map((t) => t.id);
    const titles = QUEST_TEMPLATES.map((t) => t.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  test('every template has 3-4 tasks, valid difficulties, rewardXp 60-120', () => {
    for (const tpl of QUEST_TEMPLATES) {
      expect(tpl.tasks.length).toBeGreaterThanOrEqual(3);
      expect(tpl.tasks.length).toBeLessThanOrEqual(4);
      expect(tpl.rewardXp).toBeGreaterThanOrEqual(60);
      expect(tpl.rewardXp).toBeLessThanOrEqual(120);
      for (const spec of tpl.tasks) {
        expect(['easy', 'medium', 'hard']).toContain(spec.difficulty);
        expect(spec.title.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('covers the five starter themes', () => {
    expect(QUEST_TEMPLATES.map((t) => t.id)).toEqual([
      'fitness',
      'learning',
      'home',
      'career',
      'declutter',
    ]);
  });
});

describe('instantiateTemplate', () => {
  test('expands each template into a quest linked to fresh tasks', () => {
    for (const tpl of QUEST_TEMPLATES) {
      const res = instantiateTemplate(DEFAULT_STATE, tpl.id);
      if (!('quest' in res)) throw new Error(`expected success for ${tpl.id}`);
      expect(res.quest.title).toBe(tpl.title);
      expect(res.quest.rewardXp).toBe(tpl.rewardXp);
      expect(res.quest.taskIds.length).toBe(tpl.tasks.length);
      expect(res.tasks.length).toBe(tpl.tasks.length);
      // Both-way linkage: every task points at the quest, quest lists them all.
      for (let i = 0; i < res.tasks.length; i++) {
        const task: Task = res.tasks[i]!;
        expect(task.questId).toBe(res.quest.id);
        expect(task.status).toBe('todo');
        expect(task.title).toBe(tpl.tasks[i]!.title);
        expect(task.difficulty).toBe(tpl.tasks[i]!.difficulty);
        expect(res.quest.taskIds[i]).toBe(task.id);
      }
    }
  });

  test('each call mints fresh ids (no shared state between calls)', () => {
    const a = instantiateTemplate(DEFAULT_STATE, 'fitness');
    const b = instantiateTemplate(DEFAULT_STATE, 'fitness');
    if (!('quest' in a) || !('quest' in b)) throw new Error('expected successes');
    expect(a.quest.id).not.toBe(b.quest.id);
  });

  test('rejects unknown template ids', () => {
    expect(instantiateTemplate(DEFAULT_STATE, 'nope')).toEqual({
      error: 'unknown-template',
    });
  });

  test('refuses while an identically-titled quest is active', () => {
    const first = instantiateTemplate(DEFAULT_STATE, 'learning');
    if (!('quest' in first)) throw new Error('expected success');
    const busy: GameState = { ...DEFAULT_STATE, quests: [first.quest as Quest] };
    expect(instantiateTemplate(busy, 'learning')).toEqual({ error: 'duplicate' });
  });

  test('a COMPLETED chain frees the title for replay', () => {
    const first = instantiateTemplate(DEFAULT_STATE, 'declutter');
    if (!('quest' in first)) throw new Error('expected success');
    const done: GameState = {
      ...DEFAULT_STATE,
      quests: [first.quest],
      completedQuestIds: [first.quest.id],
    };
    const tpl = QUEST_TEMPLATES.find((t) => t.id === 'declutter');
    if (tpl === undefined) throw new Error('declutter template missing');
    const replay = instantiateTemplate(done, 'declutter');
    expect('quest' in replay && replay.tasks.length === tpl.tasks.length).toBe(true);
  });

  test('other templates do not collide (different titles never block)', () => {
    const fitness = instantiateTemplate(DEFAULT_STATE, 'fitness');
    if (!('quest' in fitness)) throw new Error('expected success');
    const mixed: GameState = { ...DEFAULT_STATE, quests: [fitness.quest] };
    expect('quest' in instantiateTemplate(mixed, 'career')).toBe(true);
  });
});
