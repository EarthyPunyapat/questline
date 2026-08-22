// Pure formatters for pipeline notification strings.
// Extracted so the exact toast wording is unit-testable against state deltas.

/**
 * XP-gain toast line derived from the ACTUAL totalXp delta (not the pre-round
 * base×multiplier product), guaranteeing the displayed number always equals
 * the persisted state change. mult > 1 appends the streak suffix.
 */
export function formatXpGain(gainedXp: number, mult: number): string {
  const safe = Number.isFinite(gainedXp) ? Math.max(0, Math.round(gainedXp)) : 0;
  return `+${safe} XP${mult > 1 ? ` (×${mult.toFixed(2)} streak)` : ''}`;
}
