// Achievement definitions + exactly-once evaluation. All pure.
// The unlock event surfaces as an ACHIEVEMENT_UNLOCKED entry in the pipeline's
// notification messages (UI toast) and as a timestamped record in profile.
import type { GameState } from '../types/state.ts';
import { levelCurve } from './levels.ts';

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  /** Pure predicate over the whole game state. */
  check: (state: GameState) => boolean;
}

function doneCount(state: GameState): number {
  return state.tasks.filter((t) => t.status === 'done').length;
}

function completedHour(state: GameState, pred: (h: number) => boolean): boolean {
  return state.tasks.some(
    (t) => t.status === 'done' && t.completedAt !== undefined && pred(new Date(t.completedAt).getHours()),
  );
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-task',
    title: 'First Blood',
    desc: 'Complete your first task',
    check: (s) => doneCount(s) >= 1,
  },
  {
    id: 'ten-tasks',
    title: 'Getting Things Done',
    desc: 'Complete 10 tasks',
    check: (s) => doneCount(s) >= 10,
  },
  {
    id: 'fifty-tasks',
    title: 'Task Centurion',
    desc: 'Complete 50 tasks',
    check: (s) => doneCount(s) >= 50,
  },
  {
    id: 'streak-3',
    title: 'Warming Up',
    desc: 'Reach a 3-day streak',
    check: (s) => s.profile.streakDays >= 3,
  },
  {
    id: 'streak-7',
    title: 'Unbreakable',
    desc: 'Reach a 7-day streak',
    check: (s) => s.profile.streakDays >= 7,
  },
  {
    id: 'level-5',
    title: 'Seasoned Adventurer',
    desc: 'Reach level 5',
    check: (s) => levelCurve(s.profile.totalXp).level >= 5,
  },
  {
    id: 'level-10',
    title: 'Legend of the Terminal',
    desc: 'Reach level 10',
    check: (s) => levelCurve(s.profile.totalXp).level >= 10,
  },
  {
    id: 'quest-complete-first',
    title: 'Chain Breaker',
    desc: 'Complete your first quest chain',
    check: (s) => s.completedQuestIds.length >= 1,
  },
  {
    id: 'all-dailies-day',
    title: 'Perfect Day',
    desc: 'Finish every daily quest in one day',
    check: (s) => s.dailies?.completedAll === true,
  },
  {
    id: 'night-owl',
    title: 'Night Owl',
    desc: 'Complete a task between 23:00 and 04:59',
    check: (s) => completedHour(s, (h) => h >= 23 || h < 5),
  },
  {
    id: 'early-bird',
    title: 'Early Bird',
    desc: 'Complete a task between 05:00 and 07:59',
    check: (s) => completedHour(s, (h) => h >= 5 && h < 8),
  },
];

export interface AchievementEvaluation {
  state: GameState;
  /** Newly unlocked this evaluation (empty when nothing new / re-run). */
  unlocked: AchievementDef[];
}

/**
 * Evaluate every definition; append unlocks with timestamps to
 * profile.achievements. Idempotent — already-unlocked ids never re-unlock.
 */
export function evaluateAchievements(
  state: GameState,
  now: number = Date.now(),
): AchievementEvaluation {
  const have = new Set((state.profile.achievements ?? []).map((a) => a.id));
  const newly = ACHIEVEMENTS.filter((d) => !have.has(d.id) && d.check(state));
  if (newly.length === 0) return { state, unlocked: [] };
  return {
    state: {
      ...state,
      profile: {
        ...state.profile,
        achievements: [
          ...(state.profile.achievements ?? []),
          ...newly.map((d) => ({ id: d.id, unlockedAt: now })),
        ],
      },
    },
    unlocked: newly,
  };
}
