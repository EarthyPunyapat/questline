// Pure text formatters for headless CLI output. No I/O — data-in/string-out.
import type { Difficulty, Task } from '../types/task.ts';
import type { DayBucket } from '../views/stats.ts';

/** Single-letter difficulty tag used in list rows. */
export function difficultyTag(d: Difficulty): 'E' | 'M' | 'H' {
  return d === 'easy' ? 'E' : d === 'medium' ? 'M' : 'H';
}

/**
 * `<index>. [<E|M|H>] title (id)` — done rows get a trailing ✓.
 * Index is 1-based and matches the order produced by sortedForDisplay.
 */
export function formatTaskRow(index: number, t: Task): string {
  const check = t.status === 'done' ? ' ✓' : '';
  return `${index}. [${difficultyTag(t.difficulty)}] ${t.title} (${t.id})${check}`;
}

/** Unicode progress bar: filled █ for the fraction, ░ padding, width chars. */
export function xpBar(fraction: number, width = 20): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const filled = Math.round(f * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Mini weekly chart, one line per bucket (oldest→newest):
 * `Mon ▇▇▇ 50xp`. Bars scale to the week max (8 slots); today gets a `*`.
 */
export function weeklyChart(buckets: readonly DayBucket[]): string {
  const max = Math.max(1, ...buckets.map((b) => b.xp));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return buckets
    .map((b) => {
      const wd = WEEKDAYS[new Date(`${b.day}T00:00:00`).getDay()];
      const marks = Math.round((b.xp / max) * 8);
      const bar = b.xp > 0 ? '▇'.repeat(Math.max(1, marks)) : '·';
      const star = b.day === todayStr ? '*' : ' ';
      return `${wd}${star} ${bar} ${b.xp}xp`;
    })
    .join('\n');
}
