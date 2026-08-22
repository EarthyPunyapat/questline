// Headless CLI subcommand tests (S8.1.5): isolated XDG temp dirs per test,
// direct dispatchCli invocation — no child processes, no TTY.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatchCli, runCompletionPipeline } from './handler.ts';
import { difficultyTag, formatTaskRow, xpBar, weeklyChart } from './format.ts';
import { loadState } from '../store/persist.ts';
import { makeTask } from '../types/task.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'questline-cli-'));
  process.env.XDG_CONFIG_HOME = dir;
});

afterEach(() => {
  delete process.env.XDG_CONFIG_HOME;
  rmSync(dir, { recursive: true, force: true });
});

function run(argv: string[]): { code: number; stdout?: string; stderr?: string } {
  const res = dispatchCli(argv);
  if (res === undefined) throw new Error(`expected dispatch for: ${argv.join(' ')}`);
  return res;
}

describe('dispatch gate', () => {
  test('non-subcommand argv falls through to the flag/TUI path', () => {
    expect(dispatchCli([])).toBeUndefined();
    expect(dispatchCli(['--export'])).toBeUndefined();
    expect(dispatchCli(['--smoke'])).toBeUndefined();
  });

  test('unknown bare word exits 1 with hint', () => {
    const res = dispatchCli(['frobnicate']);
    expect(res?.code).toBe(1);
    expect(res?.stderr).toContain('unknown command');
  });
});

describe('add', () => {
  test('creates task via factory + atomic save, prints added line rc0', () => {
    const res = run(['add', 'write chapter three']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/^added t-\w{8} write chapter three \(medium\)$/);
    // boot also spawns today's daily set — count only regular tasks
    expect(loadState().tasks.filter((t) => !t.isDaily)).toHaveLength(1);
  });

  test('difficulty flags select the tier', () => {
    run(['add', 'heavy lifting', '--hard']);
    run(['add', 'quick note', '--easy']);
    const diffs = loadState().tasks.filter((t) => !t.isDaily).map((t) => t.difficulty).sort();
    expect(diffs.join(',')).toBe('easy,hard');
  });

  test('multi-word titles join; empty title exits 1', () => {
    expect(run(['add', 'buy', 'oat', 'milk']).stdout).toContain('buy oat milk');
    expect(run(['add']).code).toBe(1);
    expect(run(['add', '--hard']).code).toBe(1);
    expect(run(['add']).stderr).toContain('requires a <title>');
  });
});

describe('list', () => {
  test('empty state prints friendly message rc0', () => {
    const res = run(['list']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('no tasks yet');
  });

  test('rows show index/tag/title/id; --all adds done rows with check', () => {
    run(['add', 'alpha']);
    run(['add', 'beta', '--hard']);
    run(['done', '1']);
    expect(run(['list']).stdout?.split('\n')).toHaveLength(1); // beta only
    const all = run(['list', '--all']).stdout ?? '';
    const rows = all.split('\n');
    expect(rows).toHaveLength(2);
    expect(rows.some((l) => l.includes('[M] alpha') && l.endsWith('✓'))).toBe(true);
    expect(rows.some((l) => l.includes('[H] beta'))).toBe(true);
  });
});

describe('done', () => {
  test('index target runs pipeline once with day-1 streak multiplier', () => {
    run(['add', 'first win', '--easy']);
    const res = run(['done', '1']);
    expect(res.code).toBe(0);
    // easy base 10 x 1.05 streak day-1 -> round -> exactly 11
    expect(res.stdout).toBe('done: first win +11xp total=11 lvl=1');
    const s = loadState();
    expect(s.profile.totalXp).toBe(11);
    expect(s.profile.streakDays).toBe(1);
    const t = s.tasks.find((x) => x.title === 'first win');
    expect(t?.status).toBe('done');
    expect(t?.completedAt).toBeDefined();
  });

  test('id target works; second completion is friendly idempotent rc0', () => {
    run(['add', 'solo quest']);
    const id = loadState().tasks.find((t) => t.title === 'solo quest')?.id as string;
    expect(run(['done', id]).code).toBe(0);
    const again = run(['done', id]);
    expect(again.code).toBe(0);
    expect(again.stdout).toBe('already completed: solo quest');
    // medium 25 x 1.05 -> 26, awarded exactly once
    expect(loadState().profile.totalXp).toBe(26);
  });

  test('unknown id and bad/missing index exit 1', () => {
    expect(run(['done', 't-nonexisto']).code).toBe(1);
    expect(run(['done', 't-nonexisto']).stderr).toContain("no such task 't-nonexisto'");
    expect(run(['done', '7']).code).toBe(1);
    expect(run(['done']).code).toBe(1);
  });
});

describe('stats', () => {
  test('prints level, bar, streak and weekly chart; rc0 when empty', () => {
    const res = run(['stats']);
    expect(res.code).toBe(0);
    const out = res.stdout ?? '';
    expect(out).toContain('level 1');
    expect(out).toContain('streak: 0 day(s)');
    expect(out.split('\n').filter((l) => /\d{4}-\d{2}-\d{2}|^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/.test(l)).length)
      .toBeGreaterThanOrEqual(7);

    run(['add', 'grind', '--medium']);
    run(['done', '1']);
    const after = run(['stats']).stdout ?? '';
    expect(after).toContain('26/25 into level'.replace('26/25', '26/100'));
    expect(after).toContain('streak: 1 day(s)');
  });
});

describe('full chain', () => {
  test('add -> list -> done -> stats behaves end to end', () => {
    run(['add', 'chain a']);
    run(['add', 'chain b', '--hard']);
    expect(run(['list']).stdout?.split('\n')).toHaveLength(2);
    const doneRes = run(['done', '2']); // hard 50 x 1.05 -> round(52.5) = 53
    expect(doneRes.stdout).toBe('done: chain b +53xp total=53 lvl=1');
    const stats = run(['stats']).stdout ?? '';
    expect(stats).toContain('53 xp total');
    expect(loadState().profile.totalXp).toBe(53);
  });
});

describe('runCompletionPipeline (exported pure composition)', () => {
  test('awards quest bonus exactly once alongside task XP', () => {
    const s = loadState();
    const t = makeTask('t-q1', 'quested step', 'easy');
    const withQuest = {
      ...s,
      tasks: [t],
      quests: [
        {
          id: 'q-1',
          title: 'mini chain',
          taskIds: [t.id],
          rewardXp: 30,
        },
      ],
    };
    saveTmp(withQuest);
    const toggled = { ...withQuest, tasks: [{ ...t, status: 'done' as const, completedAt: Date.now() }] };
    const next = runCompletionPipeline(toggled, t.id);
    // easy 10 x 1.05 = 11 + quest bonus 30 = 41
    expect(next.profile.totalXp - withQuest.profile.totalXp).toBe(41);
    expect(next.completedQuestIds).toContain('q-1');
    // Re-complete after a revert: quest bonus must NOT re-fire (exactly-once
    // via completedQuestIds); only the task's own XP is re-earned.
    const redone = {
      ...next,
      tasks: [{ ...t, status: 'todo' as const, completedAt: undefined }],
    };
    const retoggled = {
      ...redone,
      tasks: [{ ...t, status: 'done' as const, completedAt: Date.now() }],
    };
    const again = runCompletionPipeline(retoggled, t.id);
    expect(again.profile.totalXp - next.profile.totalXp).toBe(11); // task xp only
  });
});

function saveTmp(state: unknown): void {
  // persist through the same store path so loadState() sees it
  const { saveStateAtomic, statePath } = require('../store/persist.ts');
  saveStateAtomic(state as never, statePath());
}

describe('format helpers', () => {
  test('difficultyTag maps tiers to single letters', () => {
    expect(difficultyTag('easy')).toBe('E');
    expect(difficultyTag('medium')).toBe('M');
    expect(difficultyTag('hard')).toBe('H');
  });

  test('formatTaskRow renders index, tag, title, id and done check', () => {
    const todo = makeTask('t-aa11bb22', 'alpha', 'medium');
    expect(formatTaskRow(3, todo)).toBe('3. [M] alpha (t-aa11bb22)');
    const doneT = { ...todo, status: 'done' as const };
    expect(formatTaskRow(1, doneT)).toBe('1. [M] alpha (t-aa11bb22) ✓');
  });

  test('xpBar clamps fraction and handles zero-divide', () => {
    expect(xpBar(0)).toBe('░'.repeat(20));
    expect(xpBar(1)).toBe('█'.repeat(20));
    expect(xpBar(0.5)).toBe('█'.repeat(10) + '░'.repeat(10));
    expect(xpBar(2)).toBe('█'.repeat(20));
    expect(xpBar(-1)).toBe('░'.repeat(20));
    expect(xpBar(Number.NaN)).toBe('░'.repeat(20));
  });

  test('weeklyChart scales bars to week max and zero-fills quiet days', () => {
    const out = weeklyChart([
      { day: '2026-08-17', xp: 0, tasks: 0 },
      { day: '2026-08-18', xp: 10, tasks: 1 },
      { day: '2026-08-19', xp: 20, tasks: 2 },
      { day: '2026-08-20', xp: 0, tasks: 0 },
      { day: '2026-08-21', xp: 0, tasks: 0 },
      { day: '2026-08-22', xp: 0, tasks: 0 },
      { day: '2026-08-23', xp: 40, tasks: 4 },
    ]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toContain('·'); // zero bucket marker
    expect(lines[1]).toContain('▇'.repeat(2) + ' 10xp'); // round(10/40*8) = 2 of 8 slots
    expect(lines[6]).toContain('▇'.repeat(8) + ' 40xp'); // max bucket full
  });
});
