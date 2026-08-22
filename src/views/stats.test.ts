import { describe, expect, test } from 'bun:test';
import { weeklyXp } from './stats.ts';

const DAY = 86_400_000;

describe('weeklyXp', () => {
  test('returns exactly 7 zero-filled buckets oldest→newest', () => {
    const now = new Date(2026, 7, 22, 12).getTime(); // local noon
    const buckets = weeklyXp([], 7, now);
    expect(buckets.length).toBe(7);
    expect(buckets[6]!.day).toBe('2026-08-22');
    expect(buckets[0]!.day).toBe('2026-08-16');
    expect(buckets.every((b) => b.xp === 0 && b.tasks === 0)).toBe(true);
  });

  test('buckets completions by local day and sums xp/tasks', () => {
    const now = new Date(2026, 7, 22, 23).getTime();
    const today = now - 1000;
    const yesterday = now - DAY;
    const threeDaysAgo = now - 3 * DAY + 60_000;
    const outOfRange = now - 9 * DAY;
    const buckets = weeklyXp(
      [
        { completedAt: today, xp: 10 },
        { completedAt: today + 500, xp: 25 },
        { completedAt: yesterday, xp: 50 },
        { completedAt: threeDaysAgo, xp: 5 },
        { completedAt: outOfRange, xp: 999 }, // ignored
      ],
      7,
      now,
    );
    expect(buckets[6]!).toMatchObject({ xp: 35, tasks: 2 });
    expect(buckets[5]!).toMatchObject({ xp: 50, tasks: 1 });
    expect(buckets[3]!).toMatchObject({ xp: 5, tasks: 1 });
  });

  test('month/year boundaries stay aligned (local-day math)', () => {
    const now = new Date(2026, 0, 2, 8).getTime(); // Jan 2
    const b = weeklyXp([{ completedAt: now - DAY, xp: 30 }], 3, now);
    expect(b[0]!.day).toBe('2025-12-31');
    expect(b[1]!).toMatchObject({ day: '2026-01-01', xp: 30 });
    expect(b[2]!.day).toBe('2026-01-02');
  });
});
