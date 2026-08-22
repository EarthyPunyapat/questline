// Canonical game state — single source of truth.
import type { Task } from './task.ts';
import type { Quest } from './quest.ts';

/** One unlocked achievement with its unlock timestamp. */
export interface AchievementUnlock {
  id: string;
  unlockedAt: number; // epoch ms
}

/** RPG profile: XP total + day-streak (local calendar dates 'YYYY-MM-DD'). */
export interface Profile {
  totalXp: number;
  streakDays: number;
  /** Local day of last completion; null until first completion. */
  lastCompletedDay: string | null;
  /** Unlocked achievements (id + when); exactly-once by id. Optional for
   * backward-compat with v2 saves written before this field existed. */
  achievements?: AchievementUnlock[];
}

/** One day's generated daily-quest set (v2). */
export interface DailyQuestSet {
  /** Local calendar date the set was generated for, 'YYYY-MM-DD'. */
  dateISO: string;
  /** Ids of the daily tasks (stored in state.tasks with isDaily: true). */
  questIds: string[];
  /** True once every quest of the set was completed and +50 bonus awarded. */
  completedAll: boolean;
  /** Ids dismissed by the user for THIS day only ('x' key). Optional so older
   * v3 saves load unchanged (no migration); a fresh set next day drops it,
   * which is exactly the "restored tomorrow" lifecycle. */
  skippedIds?: string[];
}

/** Archive row for a past daily set that wasn't fully completed. */
export interface MissedDailyRecord {
  dateISO: string;
  /** How many quests of that day's set were left undone. */
  missedCount: number;
}

export interface GameState {
  version: 3;
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
  version: 3,
  tasks: [],
  quests: [],
  profile: { totalXp: 0, streakDays: 0, lastCompletedDay: null, achievements: [] },
  completedQuestIds: [],
  dailies: null,
  dailiesArchive: [],
};

/** Legacy v1 shape (pre-dailies) as found in old state.json files. */
export interface GameStateV1
  extends Omit<GameState, 'version' | 'dailies' | 'dailiesArchive' | 'achievements'> {
  version: 1;
}

/** v2 shape (dailies, pre-recurrence). */
export type GameStateV2 = Omit<GameState, 'version'> & { version: 2 };

/** Upgrade a v1 save to v2: fresh empty dailies fields, everything else kept.
 * Achievements are preserved when present (defensive default for odd inputs). */
export function migrateV1toV2(v1: GameStateV1): GameStateV2 {
  return {
    ...v1,
    version: 2,
    dailies: null,
    dailiesArchive: [],
    profile: { ...v1.profile, achievements: v1.profile.achievements ?? [] },
  };
}

/** Upgrade a v2 save to v3 (recurrence): pure re-version — `recurrence` is
 * optional on Task, so absent fields need no transform. Every v2 field,
 * including profile.achievements and the dailies archive, is preserved. */
export function migrateV2toV3(v2: GameStateV2): GameState {
  return { ...v2, version: 3 };
}
