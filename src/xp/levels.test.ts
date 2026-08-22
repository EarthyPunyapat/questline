import { describe, test, expect } from 'bun:test';
import { xpForLevel, levelCurve } from './levels.ts';

describe('levels', () => {
  test('xpForLevel known values', () => {
    expect(xpForLevel(1)).toBe(100); // 100*1^1.5
    expect(xpForLevel(2)).toBe(Math.round(100 * Math.pow(2, 1.5))); // ≈283
    expect(xpForLevel(4)).toBe(800);
  });

  test('level 1 at zero xp', () => {
    const c = levelCurve(0);
    expect(c.level).toBe(1);
    expect(c.intoLevel).toBe(0);
    expect(c.xpForNext).toBe(xpForLevel(1));
  });

  test('exact level-up boundary: totalXp == xpForLevel(1) → level 2 into 0', () => {
    const c = levelCurve(xpForLevel(1));
    expect(c.level).toBe(2);
    expect(c.intoLevel).toBe(0);
  });

  test('one xp below boundary stays level 1', () => {
    expect(levelCurve(xpForLevel(1) - 1).level).toBe(1);
  });

  test('monotonic: more xp never lowers level', () => {
    let prev = 1;
    for (let x = 0; x <= 5000; x += 137) {
      const lvl = levelCurve(x).level;
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
});
