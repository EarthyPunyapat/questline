import { describe, test, expect } from 'bun:test';
import { defaultState } from '../store/persist.ts';
import { makeTask } from '../types/task.ts';
import type { GameState } from '../types/state.ts';
import { DAILY_TEMPLATES } from './templates.ts';
import {
  DAILY_BONUS_XP,
  DAILY_SET_SIZE,
  awardDailyBonusIfComplete,
  ensureDailySet,
  isDailySetComplete,
  pickDailySet,
  todayDailies,
} from './daily.ts';

const D1 = '2026-08-22';
const D2 = '2026-08-23';

describe('pickDailySet', () => {
  test('deterministic per date (same day → same set)', () => {
    const a = pickDailySet(D1);
    const b = pickDailySet(D1);
    expect(a).toEqual(b);
  });

  test(`picks exactly ${DAILY_SET_SIZE} distinct templates from the pool`, () => {
    const picked = pickDailySet(D2);
    expect(picked.length).toBe(DAILY_SET_SIZE);
    const titles = new Set(picked.map((t) => t.title));
    expect(titles.size).toBe(DAILY_SET_SIZE);
    for (const t of picked) expect(DAILY_TEMPLATES).toContainEqual(t);
  });

  test('day-to-day variation across sample dates', () => {
    const sets = new Set(
      Array.from({ length: 14 }, (_, i) =>
        pickDailySet(`2026-07-${String(i + 1).padStart(2, '0')}`)
          .map((t) => t.title)
          .join('|'),
      ),
    );
    expect(sets.size).toBeGreaterThan(1);
  });

  test('pool has ≥8 easy/medium templates', () => {
    expect(DAILY_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const t of DAILY_TEMPLATES) {
      expect(['easy', 'medium']).toContain(t.difficulty);
    }
  });
});

function withSet(state = defaultState(), dateISO = D1): GameState {
  return ensureDailySet(state, dateISO);
}

describe('ensureDailySet', () => {
  test('creates a fresh 3-quest set on first boot', () => {
    const s = withSet();
    expect(s.dailies?.dateISO).toBe(D1);
    expect(s.dailies?.questIds.length).toBe(3);
    expect(s.dailies?.completedAll).toBe(false);
    expect(s.tasks.filter((t) => t.isDaily).length).toBe(3);
  });

  test('same-day idempotency: repeated calls change nothing', () => {
    const once = withSet();
    const twice = ensureDailySet(once, D1);
    expect(twice).toBe(once); // reference-equal → zero churn
    expect(twice.tasks.filter((t) => t.isDaily).length).toBe(3);
  });

  test('midnight rollover: new day → fresh set, old dailies leave the board', () => {
    const day1 = withSet();
    const oldIds = day1.dailies!.questIds;
    // complete one of yesterday's quests so missedCount reflects reality
    const toggled: GameState = {
      ...day1,
      tasks: day1.tasks.map((t) =>
        t.id === oldIds[0] ? { ...t, status: 'done', completedAt: 1234 } : t,
      ),
    };
    const day2 = ensureDailySet(toggled, D2);
    expect(day2.dailies?.dateISO).toBe(D2);
    expect(day2.dailies!.questIds).not.toEqual(oldIds);
    expect(day2.tasks.some((t) => oldIds.includes(t.id))).toBe(false);
    // 2 undone → archived with missedCount=2
    expect(day2.dailiesArchive).toEqual([{ dateISO: D1, missedCount: 2 }]);
  });

  test('fully-completed previous day is NOT archived as missed', () => {
    let s = withSet();
    const ids = s.dailies!.questIds;
    s = {
      ...s,
      tasks: s.tasks.map((t) =>
        ids.includes(t.id) ? { ...t, status: 'done', completedAt: 1 } : t,
      ),
      dailies: { ...s.dailies!, completedAll: true },
    };
    const next = ensureDailySet(s, D2);
    expect(next.dailiesArchive).toEqual([]);
  });

  test('archive capped at 30 entries', () => {
    let s = defaultState();
    for (let i = 0; i < 35; i++) {
      s = ensureDailySet(s, `2026-05-${String((i % 28) + 1).padStart(2, '0')}`);
    }
    expect(s.dailiesArchive.length).toBeLessThanOrEqual(30);
    expect(s.dailiesArchive.length).toBeGreaterThan(0);
  });
});

describe('awardDailyBonusIfComplete', () => {
  test('awards +50 exactly once when last daily completes', () => {
    let s = withSet();
    const ids = s.dailies!.questIds;
    for (const id of ids.slice(0, -1)) {
      s = {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: 'done', completedAt: 1 } : t,
        ),
      };
      expect(awardDailyBonusIfComplete(s, D1).awarded).toBe(false);
    }
    // final daily done
    s = {
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === ids.at(-1) ? { ...t, status: 'done', completedAt: 2 } : t,
      ),
    };
    const res = awardDailyBonusIfComplete(s, D1);
    expect(res.awarded).toBe(true);
    expect(res.xp).toBe(DAILY_BONUS_XP);
    expect(res.state.profile.totalXp).toBe(DAILY_BONUS_XP);
    expect(res.state.dailies?.completedAll).toBe(true);

    // second call → no re-award (completedAll guard)
    const again = awardDailyBonusIfComplete(res.state, D1);
    expect(again.awarded).toBe(false);
    expect(again.state.profile.totalXp).toBe(DAILY_BONUS_XP);
  });

  test('no award on other days / missing set / stale guard', () => {
    expect(awardDailyBonusIfComplete(defaultState(), D1).awarded).toBe(false); // no set
    let s = withSet(); // nothing done yet
    expect(awardDailyBonusIfComplete(s, D1).awarded).toBe(false); // incomplete
    expect(awardDailyBonusIfComplete(s, D2).awarded).toBe(false); // wrong day
  });

  test('isDailySetComplete requires ALL ids present and done', () => {
    let s = withSet();
    const ids = s.dailies!.questIds;
    expect(isDailySetComplete(s.dailies!, s)).toBe(false);
    s = {
      ...s,
      tasks: [
        ...s.tasks.filter((t) => !ids.includes(t.id)),
        ...ids.map((id) => ({ ...makeTask(id, 'x', 'easy'), isDaily: true, status: 'done' as const, completedAt: 9 })),
      ],
    };
    expect(isDailySetComplete(s.dailies!, s)).toBe(true);
    expect(todayDailies(s).length).toBe(3);
  });

  test('migrateV1toV2 keeps payload and adds empty dailies', async () => {
    const { migrateV1toV2 } = await import('../types/state.ts');
    const v1 = {
      version: 1 as const,
      tasks: [makeTask('t-1', 'old', 'hard')],
      quests: [],
      profile: { totalXp: 5, streakDays: 1, lastCompletedDay: null, achievements: [] },
      completedQuestIds: [],
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.dailies).toBeNull();
    expect(v2.dailiesArchive).toEqual([]);
    expect(v2.profile.totalXp).toBe(5);
    expect(v2.tasks[0]?.title).toBe('old');
  });
});
