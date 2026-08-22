import { describe, test, expect } from 'bun:test';
import { advanceStreak, streakMultiplier, localDateStr } from './streaks.ts';
import { DEFAULT_STATE, type Profile } from '../types/state.ts';

const p = (lastDay: string | null, streakDays = 1): Profile => ({
  totalXp: 0,
  streakDays,
  lastCompletedDay: lastDay,
});

describe('streaks', () => {
  test('localDateStr is zero-padded YYYY-MM-DD', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('first ever completion → reset to 1', () => {
    const r = advanceStreak(p(null, 0), '2026-03-10');
    expect(r.outcome).toBe('reset');
    expect(r.profile.streakDays).toBe(1);
    expect(r.profile.lastCompletedDay).toBe('2026-03-10');
  });

  test('same day → unchanged', () => {
    const r = advanceStreak(p('2026-03-10', 4), '2026-03-10');
    expect(r.outcome).toBe('same-day');
    expect(r.profile.streakDays).toBe(4);
  });

  test('consecutive day → +1', () => {
    const r = advanceStreak(p('2026-03-10', 4), '2026-03-11');
    expect(r.outcome).toBe('continued');
    expect(r.profile.streakDays).toBe(5);
  });

  test('month boundary counts as consecutive (local-day math)', () => {
    const r = advanceStreak(p('2026-02-28', 2), '2026-03-01'); // non-leap year
    expect(r.outcome).toBe('continued');
    expect(r.profile.streakDays).toBe(3);
  });

  test('year boundary consecutive', () => {
    const r = advanceStreak(p('2025-12-31', 9), '2026-01-01');
    expect(r.profile.streakDays).toBe(10);
  });

  test('gap ≥ 2 days resets to 1', () => {
    const r = advanceStreak(p('2026-03-08', 6), '2026-03-11');
    expect(r.outcome).toBe('reset');
    expect(r.profile.streakDays).toBe(1);
  });

  test('clock-skew guard: last day in future resets', () => {
    const r = advanceStreak(p('2026-03-12', 3), '2026-03-11');
    expect(r.outcome).toBe('reset');
    expect(r.profile.streakDays).toBe(1);
  });

  test('multiplier caps at ×1.35 after 7+ days', () => {
    expect(streakMultiplier(0)).toBe(1.0);
    expect(streakMultiplier(1)).toBe(1.05);
    expect(streakMultiplier(7)).toBe(1.35);
    expect(streakMultiplier(30)).toBe(1.35);
  });

  test('DEFAULT_STATE profile is neutral', () => {
    expect(DEFAULT_STATE.profile).toEqual({ totalXp: 0, streakDays: 0, lastCompletedDay: null });
  });
});
