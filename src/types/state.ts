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

/** One day's generated daily-quest set (v2). */
export interface DailyQuestSet {
  /** Local calendar date the set was generated for, 'YYYY-MM-DD'. */
  dateISO: string;
  /** Ids of the daily tasks (stored in state.tasks with isDaily: true). */
  questIds: string[];
  /** True once every quest of the set was completed and +50 bonus awarded. */
  completedAll: boolean;
}

/** Archive row for a past daily set that wasn't fully completed. */
export interface MissedDailyRecord {
  dateISO: string;
  /** How many quests of that day's set were left undone. */
  missedCount: number;
}

export interface GameState {
  version: 2;
  tasks: Task[];
  quests: Quest[];
  profile: Profile;
  /** Quest ids already rewarded (exactly-once guarantee). */
  completedQuestIds: string[];
  /** Today's daily set; null until first ensureDailySet() boot. */
  dailies: DailyQuestSet | null;
  /** Past sets not fully completed; most recent last, capped at MAX_DAILY_ARCHIVE. */
  dailiesArchive: MissedDailyRecord[];
}

export const MAX_DAILY_ARCHIVE = 30;

export const DEFAULT_STATE: GameState = {
  version: 2,
  tasks: [],
  quests: [],
  profile: { totalXp: 0, streakDays: 0, lastCompletedDay: null },
  completedQuestIds: [],
  dailies: null,
  dailiesArchive: [],
};

/** Legacy v1 shape (pre-dailies) as found in old state.json files. */
export interface GameStateV1 extends Omit<GameState, 'version' | 'dailies' | 'dailiesArchive'> {
  version: 1;
}

/** Upgrade a v1 save to v2: fresh empty dailies fields, everything else kept. */
export function migrateV1toV2(v1: GameStateV1): GameState {
  return { ...v1, version: 2, dailies: null, dailiesArchive: [] };
}
