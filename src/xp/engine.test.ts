import { describe, expect, test } from 'bun:test';
import { awardXp } from './engine.ts';

describe('awardXp', () => {
  test('base awards by difficulty table', () => {
    expect(awardXp(0, { difficulty: 'easy' })).toBe(10);
    expect(awardXp(0, { difficulty: 'medium' })).toBe(25);
    expect(awardXp(0, { difficulty: 'hard' })).toBe(50);
  });

  test('accumulates on current xp', () => {
    expect(awardXp(90, { difficulty: 'easy' })).toBe(100);
  });

  test('multiplier scales then rounds', () => {
    expect(awardXp(0, { difficulty: 'easy' }, 1.25)).toBe(13); // 12.5 rounds half-up
    expect(awardXp(0, { difficulty: 'hard' }, 2)).toBe(100);
    expect(awardXp(0, { difficulty: 'medium' }, 1.05)).toBe(26); // 26.25 → 26
  });

  test('never decreases xp (negative/NaN multiplier guarded)', () => {
    expect(awardXp(50, { difficulty: 'hard' }, -3)).toBe(50);
    expect(awardXp(50, { difficulty: 'hard' }, Number.NaN)).toBe(50);
    expect(awardXp(50, { difficulty: 'hard' }, 0)).toBe(50);
  });
});
