// Canonical game state — single source of truth.
import type { Task } from './task.ts';
import type { Quest } from './quest.ts';

/** RPG profile: XP total + day-streak (local calendar dates 'YYYY-MM-DD'). */
export interface Profile {
  totalXp: number;
  streakDays: number;
  /** Local day of last completion; null until first completion. */
  lastCompletedDay: string | null;
}

export interface GameState {
  version: 1;
  tasks: Task[];
  quests: Quest[];
  profile: Profile;
  /** Quest ids already rewarded (exactly-once guarantee). */
  completedQuestIds: string[];
}

export const DEFAULT_STATE: GameState = {
  version: 1,
  tasks: [],
  quests: [],
  profile: { totalXp: 0, streakDays: 0, lastCompletedDay: null },
  completedQuestIds: [],
};
