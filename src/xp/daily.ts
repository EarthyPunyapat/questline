// Daily quests: deterministic per-date generation, midnight rollover with
// missed-set archiving, and an exactly-once all-done bonus. All functions pure.
import type { GameState, DailyQuestSet, MissedDailyRecord } from '../types/state.ts';
import { MAX_DAILY_ARCHIVE } from '../types/state.ts';
import { makeId, makeTask, type Task } from '../types/task.ts';
import { DAILY_TEMPLATES } from './templates.ts';

export const DAILY_SET_SIZE = 3;
export const DAILY_BONUS_XP = 50;

/** FNV-1a 32-bit string hash → unsigned seed. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — tiny, fast, fully deterministic for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically pick today's 3 distinct templates (same date → same set). */
export function pickDailySet(dateISO: string): typeof DAILY_TEMPLATES[number][] {
  const rand = mulberry32(hashSeed(dateISO));
  const pool = [...DAILY_TEMPLATES];
  // Fisher–Yates with the seeded PRNG; take the first DAILY_SET_SIZE.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = a;
  }
  return pool.slice(0, Math.min(DAILY_SET_SIZE, pool.length));
}

/** Today's daily tasks, in the set's canonical questIds order. */
export function todayDailies(state: GameState): Task[] {
  const set = state.dailies;
  if (!set) return [];
  return set.questIds
    .map((id) => state.tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);
}

/** True iff every quest of TODAY's set exists and is done. */
export function isDailySetComplete(set: DailyQuestSet, state: GameState): boolean {
  if (set.questIds.length === 0) return false;
  return set.questIds.every((id) => {
    const t = state.tasks.find((x) => x.id === id);
    return t !== undefined && t.status === 'done';
  });
}

/**
 * Boot-time rollover: idempotent for today. On a new day it archives yesterday's
 * incomplete set (capped archive), clears old daily tasks off the board, and
 * generates a fresh deterministic set for `todayISO`.
 */
export function ensureDailySet(state: GameState, todayISO: string): GameState {
  if (state.dailies?.dateISO === todayISO) return state;

  // 1. Archive yesterday's misses (only sets that existed and weren't finished).
  const archive: MissedDailyRecord[] = [...state.dailiesArchive];
  const prev = state.dailies;
  if (prev && !prev.completedAll) {
    const missed = prev.questIds.filter((id) => {
      const t = state.tasks.find((x) => x.id === id);
      return !t || t.status !== 'done';
    }).length;
    if (missed > 0) archive.push({ dateISO: prev.dateISO, missedCount: missed });
  }

  // 2. Fresh deterministic set for the new day.
  const templates = pickDailySet(todayISO);
  const tasks = state.tasks.filter((t) => !t.isDaily);
  const created = templates.map((tpl) => ({
    ...makeTask(makeId('dq'), tpl.title, tpl.difficulty),
    isDaily: true,
  }));
  const set: DailyQuestSet = {
    dateISO: todayISO,
    questIds: created.map((t) => t.id),
    completedAll: false,
  };

  return {
    ...state,
    tasks: [...tasks, ...created],
    dailies: set,
    dailiesArchive: archive.slice(-MAX_DAILY_ARCHIVE),
  };
}

export interface DailyBonusResult {
  state: GameState;
  awarded: boolean;
  xp: number;
}

/**
 * Award the +50 all-dailies bonus exactly once per day (completedAll guard).
 * Call after completing a daily task; no-op unless today's set just filled up.
 */
export function awardDailyBonusIfComplete(
  state: GameState,
  todayISO: string,
): DailyBonusResult {
  const set = state.dailies;
  if (!set || set.dateISO !== todayISO || set.completedAll) {
    return { state, awarded: false, xp: 0 };
  }
  if (!isDailySetComplete(set, state)) {
    return { state, awarded: false, xp: 0 };
  }
  return {
    state: {
      ...state,
      profile: { ...state.profile, totalXp: state.profile.totalXp + DAILY_BONUS_XP },
      dailies: { ...set, completedAll: true },
    },
    awarded: true,
    xp: DAILY_BONUS_XP,
  };
}
