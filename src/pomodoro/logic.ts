// M10/T10.D: pure pomodoro timer math. No Ink, no I/O — fully testable.

/** Session length in seconds (25 minutes). */
export const POMODORO_SECS = 25 * 60;

/** Default focus length in minutes (M12/T12.A); matches config fallback. */
export const DEFAULT_POMODORO_MINUTES = 25;

/** Session length for a configured duration. Default keeps legacy 25:00 so
 * existing callers/tests are untouched; integration passes config.pomodoroMinutes.
 * Integration one-liner: replace `POMODORO_SECS` at app.tsx start sites with
 * `sessionSecs(cfg.pomodoroMinutes)`. */
export function sessionSecs(minutes: number = DEFAULT_POMODORO_MINUTES): number {
  return minutes * 60;
}

/** Flat XP awarded once per completed session (no multipliers). */
export const POMODORO_XP = 15;

/** One second off the clock; never goes below zero. */
export function tickRemaining(remainingSec: number): number {
  return Math.max(0, remainingSec - 1);
}

/** "mm:ss" wall-clock label (25:00 → 00:00). */
export function fmtClock(remainingSec: number): string {
  const m = Math.floor(Math.max(0, remainingSec) / 60);
  const s = Math.max(0, remainingSec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** True when the session has run down to exactly zero. */
export function isPomodoroComplete(remainingSec: number): boolean {
  return remainingSec === 0;
}
