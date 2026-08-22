// XP awarding engine — pure number-in/number-out math.
// Level-up detection lives with levelCurve(); state wiring happens in the UI layer.
import type { Difficulty } from '../types/task.ts';
import { xpValue } from '../types/task.ts';

/**
 * Award XP for completing a task.
 * multiplier >= 0 (streak bonus applied by caller in M2 streaks).
 * Negative/NaN multipliers are guarded → award nothing (XP never decreases).
 */
export function awardXp(
  currentXp: number,
  task: { difficulty: Difficulty },
  multiplier: number = 1,
): number {
  const safeMult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0;
  const gained = Math.round(xpValue(task) * safeMult);
  return currentXp + Math.max(0, gained);
}
