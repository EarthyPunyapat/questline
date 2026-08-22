// Recurring-task rollover engine (state v3): at boot, a completed recurring
// task whose window has elapsed silently reopens (status todo, completedAt
// cleared; id/title/recurrence preserved for per-task history later). Pure —
// `todayISO` is injected so tests can simulate midnight crossings.
import type { GameState } from '../types/state.ts';
import type { Recurrence } from '../types/task.ts';
import { localDateStr } from './streaks.ts';

/** Local calendar day ('YYYY-MM-DD') of an epoch-ms timestamp. */
function dayOf(ms: number): string {
  return localDateStr(new Date(ms));
}

/**
 * Window rules (S8.3.2):
 * - daily: reopens on the first boot of any LATER local day than completion.
 * - weekly: reopens only on a SCHEDULED weekday (0=Sun..6=Sat) whose boot is
 *   later than the completion day — i.e. "reset on the first boot at/after a
 *   scheduled weekday if currently done".
 * A task completed TODAY is never reset (same-day idempotency), and global
 * XP/streak state is never touched here — only completions drive those.
 */
export function isRecurrenceDue(
  rec: Recurrence,
  completedAtMs: number,
  todayISO: string,
): boolean {
  if (dayOf(completedAtMs) >= todayISO) return false;
  if (rec.freq === 'daily') return true;
  // `${todayISO}T00:00:00` parses as LOCAL midnight (no Z suffix) → getDay()
  // yields the correct local weekday incl. the Sunday=0 edge.
  const weekday = new Date(`${todayISO}T00:00:00`).getDay();
  return Array.isArray(rec.weekdays) && rec.weekdays.includes(weekday);
}

/** Boot-time sweep over regular tasks. Returns SAME reference when nothing is
 * due, so callers can use identity checks to skip persistence (mirrors
 * ensureDailySet semantics). */
export function applyRecurrenceRollover(state: GameState, todayISO: string): GameState {
  let changed = false;
  const tasks = state.tasks.map((t) => {
    if (!t.recurrence || t.status !== 'done' || t.completedAt === undefined) return t;
    if (!isRecurrenceDue(t.recurrence, t.completedAt, todayISO)) return t;
    changed = true;
    return { ...t, status: 'todo' as const, completedAt: undefined };
  });
  return changed ? { ...state, tasks } : state;
}
