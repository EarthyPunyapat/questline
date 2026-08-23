// M10/T10.A: pure calendar logic for the month panel.
// No Ink imports — fully unit-testable. Local-timezone throughout.

import type { GameState } from '../types/state.ts';
import { XP_TABLE } from '../types/task.ts';

export interface DayActivity {
  completions: number;
  xpGained: number;
  /** Tasks whose dueDate lands on this day, done or not (M11/B). */
  dueCount: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Epoch-ms → local 'YYYY-MM-DD' (mirrors views/stats.ts day bucketing). */
export function toDayISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "August 2026"-style label. */
export function monthLabel(year: number, monthIdx: number): string {
  return `${MONTHS[monthIdx] ?? ''} ${year}`.trim();
}

/**
 * Month grid as exactly 6 rows x 7 cols, Monday-first. In-month days are
 * local dateISO strings; padding cells (before the 1st / after the last)
 * are null. Trailing rows may be entirely null for short months.
 */
export function buildMonthGrid(
  year: number,
  monthIdx: number,
): ReadonlyArray<ReadonlyArray<string | null>> {
  const lead = (new Date(year, monthIdx, 1).getDay() + 6) % 7; // Mon-start offset
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const grid: Array<Array<string | null>> = [];
  let cursor = 1 - lead;
  for (let r = 0; r < 6; r++) {
    const row: Array<string | null> = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(year, monthIdx, cursor);
      const inMonth = cursor >= 1 && cursor <= daysInMonth;
      row.push(inMonth ? toDayISO(d) : null);
      cursor += 1;
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Completions + XP earned on a LOCAL calendar day.
 *
 * Approximation (documented by design):
 * - XP uses base XP_TABLE values; streak multipliers apply only at completion
 *   time and are not reconstructable from persisted data.
 * - Past DAILY completions roll off: xp/daily.ts filters isDaily tasks out of
 *   state.tasks on rollover and dailiesArchive stores only missedCount rows
 *   (no timestamps), so historical daily completions cannot be scanned without
 *   fabricating data — they are excluded rather than invented. Today's dailies
 *   still live in state.tasks and count normally until rollover removes them.
 */
export function dayActivity(state: GameState, dateISO: string): DayActivity {
  let completions = 0;
  let xpGained = 0;
  for (const t of state.tasks) {
    if (t.completedAt === undefined) continue;
    if (toDayISO(new Date(t.completedAt)) !== dateISO) continue;
    completions += 1;
    xpGained += XP_TABLE[t.difficulty];
  }
  return { completions, xpGained, dueCount: dueOn(state, dateISO) };
}

/** Tasks due on a LOCAL calendar day, regardless of done/todo status. */
export function dueOn(state: GameState, dateISO: string): number {
  let n = 0;
  for (const t of state.tasks) {
    if (t.dueDate === dateISO) n += 1;
  }
  return n;
}
