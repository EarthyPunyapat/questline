// Quest completion rewards — exactly-once guarantee.
import type { GameState } from '../types/state.ts';
import { isComplete, type Quest } from '../types/quest.ts';

export interface QuestAwardResult {
  state: GameState;
  awarded: boolean; // true only on the completion transition
  xp: number;
}

/** If ALL quest tasks are done and the quest wasn't already rewarded,
 * grant rewardXp once and record the quest id. */
export function awardQuestIfComplete(state: GameState, quest: Quest): QuestAwardResult {
  if (!isComplete(quest, state.tasks) || state.completedQuestIds.includes(quest.id)) {
    return { state, awarded: false, xp: 0 };
  }
  return {
    state: {
      ...state,
      profile: { ...state.profile, totalXp: state.profile.totalXp + quest.rewardXp },
      completedQuestIds: [...state.completedQuestIds, quest.id],
    },
    awarded: true,
    xp: quest.rewardXp,
  };
}
