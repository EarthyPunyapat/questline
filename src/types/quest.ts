import type { Task } from './task.ts';
import { makeId } from './task.ts';

export interface Quest {
  id: string;
  title: string;
  taskIds: string[];
  /** Bonus XP granted once when every referenced task is done. */
  rewardXp: number;
}

export function createQuest(
  title: string,
  taskIds: string[],
  rewardXp: number,
  id: string = makeId('q'),
): Quest {
  return { id, title, taskIds, rewardXp };
}

export interface QuestProgress {
  total: number;
  completed: number;
  isComplete: boolean;
}

/** Pure progress probe. Empty chains never complete. */
export function questProgress(quest: Quest, tasks: readonly Task[]): QuestProgress {
  let completed = 0;
  for (const id of quest.taskIds) {
    const t = tasks.find((x) => x.id === id);
    if (t && t.status === 'done') completed++;
  }
  return {
    total: quest.taskIds.length,
    completed,
    isComplete: quest.taskIds.length > 0 && completed === quest.taskIds.length,
  };
}

/** Predicate form of questProgress().isComplete. */
export function isComplete(quest: Quest, tasks: readonly Task[]): boolean {
  return questProgress(quest, tasks).isComplete;
}
