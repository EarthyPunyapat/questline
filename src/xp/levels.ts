// Pure level-curve math.
// xpForLevel(n) = round(100 * n^1.5) → XP needed to go from level n to n+1.
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) return 100;
  return Math.round(100 * Math.pow(level, 1.5));
}

export interface LevelInfo {
  level: number;
  intoLevel: number;
  xpForNext: number;
}

/** Derive level progress from lifetime XP. Level 1 starts at 0 total Xp. */
export function levelCurve(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let need = xpForLevel(level);
  while (remaining >= need && level < 9999) {
    remaining -= need;
    level += 1;
    need = xpForLevel(level);
  }
  return { level, intoLevel: remaining, xpForNext: need };
}
