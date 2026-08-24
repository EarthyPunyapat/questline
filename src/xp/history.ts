// M12/T12.B: weekly review aggregation — pure helpers over GameState.
// Complements views/stats.ts (the bar chart) with headline numbers over the
// trailing 7 LOCAL calendar days: completion rate, best day, averages and
// streak facts. No I/O — data-in/data-out so every rule is unit-testable.

import type { GameState } from '../types/state.ts';
import { xpValue } from '../types/task.ts';

export interface WeekReview {
  /** Done-in-window ÷ created-in-window, % rounded; 0 when none created. */
  completionRatePct: number;
  /** Highest-XP local day of the window; null on a fully quiet week. */
  bestDay: { dateISO: string; xp: number } | null;
  /** Window XP spread evenly over 7 days, rounded. */
  avgXpPerDay: number;
  /** Current day-streak straight from the profile (source of truth). */
  currentStreak: number;
  /** Longest run of consecutive completion days ever recorded. */
  bestStreakEver: number;
  /** Quests rewarded all-time (exactly-once ledger length). */
  questsCompletedTotal: number;
}

const WINDOW_DAYS = 7;

/** Epoch-ms → 'YYYY-MM-DD' in LOCAL time (same convention as stats.ts). */
function toLocalDay(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Shift an ISO day by N calendar days (Date normalizes month/year overflow,
 * so 2026-01-31 +1 → 2026-02-01 without any ms/DST arithmetic). */
function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return toLocalDay(new Date(y, m - 1, d + delta).getTime());
}

/**
 * Headline review of the trailing 7 local days ending `todayISO`.
 * Window membership is decided by LOCAL DAY STRINGS (not raw ms), matching
 * weeklyXp()'s bucket semantics exactly.
 */
export function weekReview(
  state: GameState,
  todayISO: string = toLocalDay(Date.now()),
): WeekReview {
  const windowDays: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) windowDays.push(shiftDay(todayISO, -i));
  const inWindow = new Set(windowDays);

  let createdInWindow = 0;
  let completedInWindow = 0;
  let windowXp = 0;
  const xpByDay = new Map<string, number>(windowDays.map((d) => [d, 0]));
  /** Every day that EVER had a completion (for the streak scan). */
  const activeDays = new Set<string>();

  for (const t of state.tasks) {
    if (inWindow.has(toLocalDay(t.createdAt))) createdInWindow++;
    if (t.status !== 'done' || typeof t.completedAt !== 'number') continue;
    const day = toLocalDay(t.completedAt);
    activeDays.add(day);
    const xp = xpValue(t);
    const prev = xpByDay.get(day);
    if (prev !== undefined) {
      xpByDay.set(day, prev + xp);
      windowXp += xp;
      completedInWindow++;
    }
  }

  // Oldest→newest walk with '>=' keeps the MOST RECENT day on ties.
  let bestDay: WeekReview['bestDay'] = null;
  for (const d of windowDays) {
    const xp = xpByDay.get(d) ?? 0;
    if (bestDay === null || xp >= bestDay.xp) bestDay = { dateISO: d, xp };
  }
  if (windowXp === 0) bestDay = null;

  return {
    completionRatePct:
      createdInWindow === 0
        ? 0
        : Math.round((completedInWindow / createdInWindow) * 100),
    bestDay,
    avgXpPerDay: Math.round(windowXp / WINDOW_DAYS),
    currentStreak: state.profile.streakDays,
    bestStreakEver: longestRun(activeDays),
    questsCompletedTotal: state.completedQuestIds.length,
  };
}

/** Longest run of consecutive ISO days in the set (sorted strings compare
 * chronologically; shiftDay handles month boundaries). */
function longestRun(days: ReadonlySet<string>): number {
  let best = 0;
  let run = 0;
  let prev: string | undefined;
  for (const d of [...days].sort()) {
    run = prev !== undefined && shiftDay(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}
