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
  rollRecurringTask,
  skipDaily,
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

describe('v3 recurring rollover', () => {
  const ms = (dateISO: string, h = 12) => new Date(`${dateISO}T${String(h).padStart(2, '0')}:00:00`).getTime();

  function stateWith(tasks: GameState['tasks'], dateISO: string): GameState {
    return {
      ...defaultState(),
      tasks,
      dailies: { dateISO, questIds: [], completedAll: false },
    };
  }

  test('rollRecurringTask: daily resets when done; todo/non-recurring pass through', () => {
    const doneDaily = {
      ...makeTask('t-r1', 'stretch', 'easy'),
      recurrence: { freq: 'daily' as const },
      status: 'done' as const,
      completedAt: ms(D1, 23),
    };
    const rolled = rollRecurringTask(doneDaily, D2);
    expect(rolled.status).toBe('todo');
    expect(rolled.completedAt).toBeUndefined();
    expect(rolled.recurrence).toEqual({ freq: 'daily' }); // schedule kept

    const todo = makeTask('t-r2', 'already open', 'easy');
    expect(rollRecurringTask(todo, D2)).toBe(todo);
    const plainDone = { ...makeTask('t-p', 'one-shot', 'easy'), status: 'done' as const, completedAt: 1 };
    expect(rollRecurringTask(plainDone, D2)).toBe(plainDone);
  });

  test('weekly resets only on a matching weekday (midnight boundary)', () => {
    // D2 = 2026-08-23 is a Sunday (dow 0)
    const mk = () => ({
      ...makeTask('t-w', 'sunday review', 'medium'),
      recurrence: { freq: 'weekly' as const, weekdays: [0] },
      status: 'done' as const,
      completedAt: ms(D1, 23),
    });
    // Sat 23:59 completion rolls over INTO Sunday → due again
    expect(rollRecurringTask(mk(), D2).status).toBe('todo');
    // Same done task rolling into Monday (dow 1, not listed) stays done
    expect(rollRecurringTask(mk(), '2026-08-24').status).toBe('done');
    // Empty weekdays never matches
    expect(
      rollRecurringTask(
        { ...mk(), recurrence: { freq: 'weekly', weekdays: [] } },
        D2,
      ).status,
    ).toBe('done');
  });

  test('ensureDailySet applies rollover on day change; profile untouched (streak-safe)', () => {
    const recurred = {
      ...makeTask('t-r', 'daily chore', 'easy'),
      recurrence: { freq: 'daily' as const },
      status: 'done' as const,
      completedAt: ms(D1),
    };
    const before = stateWith([recurred], D1);
    before.profile = { ...before.profile, streakDays: 4, lastCompletedDay: D1 };

    const next = ensureDailySet(before, D2);
    const t = next.tasks.find((x) => x.id === 't-r');
    expect(t?.status).toBe('todo');
    expect(t?.completedAt).toBeUndefined();
    // streak safety: profile byte-identical
    expect(next.profile).toEqual(before.profile);
    // fresh daily set generated
    expect(next.dailies?.dateISO).toBe(D2);
    expect(next.tasks.filter((x) => x.isDaily)).toHaveLength(DAILY_SET_SIZE);
  });

  test('same-day boot is a no-op (no double reset)', () => {
    const recurred = {
      ...makeTask('t-r', 'daily chore', 'easy'),
      recurrence: { freq: 'daily' as const },
      status: 'done' as const,
      completedAt: ms(D2),
    };
    const s = stateWith([recurred], D2);
    expect(ensureDailySet(s, D2)).toBe(s);
  });

  test('multi-day gap (app closed over several midnights) still resets stale dones', () => {
    const recurred = {
      ...makeTask('t-r', 'daily chore', 'easy'),
      recurrence: { freq: 'daily' as const },
      status: 'done' as const,
      completedAt: ms('2026-08-20'),
    };
    const next = ensureDailySet(stateWith([recurred], '2026-08-20'), '2026-08-25');
    expect(next.tasks.find((x) => x.id === 't-r')?.status).toBe('todo');
  });
});

/** Mark a task done without pulling in store/tasks (keeps this suite pure-xp). */
function markDone(s: GameState, id: string): GameState {
  return {
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, status: 'done' as const, completedAt: 1 } : t,
    ),
  };
}

describe('skipDaily (M9 dismiss-for-today lifecycle)', () => {
  test('skip hides the daily from todayDailies but keeps the task row', () => {
    const s0 = withSet();
    const id = todayDailies(s0)[0]!.id;
    const s1 = skipDaily(s0, id);
    expect(todayDailies(s1).map((t) => t.id)).not.toContain(id);
    expect(todayDailies(s1)).toHaveLength(DAILY_SET_SIZE - 1);
    expect(s1.tasks.some((t) => t.id === id)).toBe(true);
    expect(s1.dailies?.skippedIds).toEqual([id]);
  });

  test('skipped daily is excluded from bonus math: skip one, done two → +50', () => {
    const s0 = withSet();
    const [a, b, c] = todayDailies(s0).map((t) => t.id);
    let s = skipDaily(s0, a!);
    s = markDone(s, b!);
    s = markDone(s, c!);
    const res = awardDailyBonusIfComplete(s, D1);
    expect(res.awarded).toBe(true);
    expect(res.xp).toBe(DAILY_BONUS_XP);
  });

  test('skipping ALL dailies never awards the bonus (nothing active)', () => {
    let s = withSet();
    for (const t of todayDailies(s)) s = skipDaily(s, t.id);
    expect(awardDailyBonusIfComplete(s, D1).awarded).toBe(false);
  });

  test('next day: fresh set drops skips — dismissed dailies are restored', () => {
    const s0 = withSet();
    const id = todayDailies(s0)[0]!.id;
    const s1 = skipDaily(s0, id);
    expect(s1.dailies?.skippedIds).toEqual([id]);
    const s2 = ensureDailySet(s1, D2); // midnight rollover
    expect(s2.dailies?.dateISO).toBe(D2);
    expect(s2.dailies?.skippedIds ?? []).toHaveLength(0);
    expect(todayDailies(s2)).toHaveLength(DAILY_SET_SIZE);
  });

  test('skip is idempotent; foreign ids are no-ops (same state ref)', () => {
    const s0 = withSet();
    const id = todayDailies(s0)[0]!.id;
    expect(skipDaily(skipDaily(s0, id), id).dailies?.skippedIds).toEqual([id]);
    expect(skipDaily(s0, 't-nope')).toBe(s0);
  });

  test('dismissed ≠ missed: rollover archive count excludes skipped ids', () => {
    const s0 = withSet(); // D1
    const id = todayDailies(s0)[0]!.id;
    const s1 = skipDaily(s0, id); // 1 dismissed on purpose, 2 left undone
    const s2 = ensureDailySet(s1, D2);
    expect(s2.dailiesArchive.at(-1)?.missedCount).toBe(DAILY_SET_SIZE - 1);
  });
});
