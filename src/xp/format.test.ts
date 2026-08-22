// formatXpGain must always agree with the persisted totalXp delta.
import { describe, expect, test } from 'bun:test';
import { awardXp } from './engine.ts';
import { streakMultiplier } from './streaks.ts';
import type { Difficulty } from '../types/task.ts';
import { formatXpGain } from './format.ts';

function fakeTask(difficulty: Difficulty): { difficulty: Difficulty } {
  return { difficulty };
}

describe('formatXpGain', () => {
  test('plain award, mult=1: no streak suffix', () => {
    expect(formatXpGain(10, 1)).toBe('+10 XP');
    expect(formatXpGain(0, 1)).toBe('+0 XP');
  });

  test('day-1 streak (×1.05): displayed value equals engine delta', () => {
    const delta = awardXp(0, fakeTask('easy'), streakMultiplier(1)) - 0;
    // easy base 10 × 1.05 = 10.5 → Math.round → 11
    expect(delta).toBe(11);
    const msg = formatXpGain(delta, streakMultiplier(1));
    expect(msg).toBe('+11 XP (×1.05 streak)');
    // The rendered number must parse back to the exact delta.
    expect(Number.parseInt(msg.slice(1), 10)).toBe(delta);
  });

  test('day-7 cap (×1.35): medium base 25 → round(33.75) = 34', () => {
    const delta = awardXp(0, fakeTask('medium'), streakMultiplier(7));
    expect(delta).toBe(34);
    expect(formatXpGain(delta, 1.35)).toBe('+34 XP (×1.35 streak)');
    // Rendered number must parse back to the exact persisted delta.
    expect(Number.parseInt(formatXpGain(delta, 1.35).slice(1), 10)).toBe(delta);
  });

  test('fractional/defensive inputs clamp to non-negative integers', () => {
    expect(formatXpGain(10.4, 1)).toBe('+10 XP');
    expect(formatXpGain(-3, 1)).toBe('+0 XP');
    expect(formatXpGain(NaN, 1)).toBe('+0 XP');
  });
});
