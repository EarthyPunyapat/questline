// Weekly XP aggregation — pure, tested. Buckets completions into local calendar days.
export interface DayBucket {
  day: string; // YYYY-MM-DD
  xp: number;
  tasks: number;
}

function toLocalDay(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Aggregate completed tasks over the last `days` local days ending today.
 * Returns exactly `days` buckets oldest→newest (zero-filled).
 */
export function weeklyXp(completions: ReadonlyArray<{ completedAt: number; xp: number }>, days = 7, now = Date.now()): DayBucket[] {
  const out: DayBucket[] = [];
  const byDay = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const day = toLocalDay(now - i * 86_400_000);
    const b: DayBucket = { day, xp: 0, tasks: 0 };
    byDay.set(day, b);
    out.push(b);
  }
  for (const c of completions) {
    const b = byDay.get(toLocalDay(c.completedAt));
    if (!b) continue;
    b.xp += c.xp;
    b.tasks += 1;
  }
  return out;
}
