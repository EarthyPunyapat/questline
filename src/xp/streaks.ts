// Day-streak tracking — timezone-safe via LOCAL calendar dates.
import type { Profile } from '../types/state.ts';

/** Local calendar date 'YYYY-MM-DD' (NOT UTC — avoids midnight-shift bugs). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffInLocalDays(a: string, b: string): number {
  // Construct local-midnight Dates from the date strings; round() absorbs DST shifts.
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1);
  const db = new Date(by ?? 1970, (bm ?? 1) - 1, bd ?? 1);
  const MS_DAY = 86_400_000;
  return Math.round((db.getTime() - da.getTime()) / MS_DAY);
}

export type StreakOutcome = 'same-day' | 'continued' | 'reset';

/** Evolve streak when a task is completed "today".
 * same-day: unchanged · continued: yesterday active → +1 · reset/first: 1 */
export function advanceStreak(
  profile: Profile,
  today: string = localDateStr(),
): { profile: Profile; outcome: StreakOutcome } {
  const last = profile.lastCompletedDay;
  if (!last || last > today || diffInLocalDays(last, today) >= 2) {
    return { profile: { ...profile, streakDays: 1, lastCompletedDay: today }, outcome: 'reset' };
  }
  if (last === today) return { profile, outcome: 'same-day' };
  return {
    profile: { ...profile, streakDays: profile.streakDays + 1, lastCompletedDay: today },
    outcome: 'continued',
  };
}

/** Multiplier: 1 + min(streak,7)*0.05 → caps at ×1.35 on day 7+. */
export function streakMultiplier(streakDays: number): number {
  const s = Math.max(0, Math.min(Math.floor(streakDays), 7));
  return 1 + s * 0.05;
}
