// Headless CLI subcommands: add | list | done | stats.
// Runs BEFORE any ink import/render (SYNC-1 rule) — zero TTY/dbus dependencies.
// Reuses the exact same domain modules as the TUI so XP/streak math cannot drift.
import { loadState, saveStateAtomic, statePath } from '../store/persist.ts';
import { addTask, getTask, sortedForDisplay, toggleDone } from '../store/tasks.ts';
import type { Difficulty, Task } from '../types/task.ts';
import { DIFFICULTIES, resolveDueSpec, xpValue } from '../types/task.ts';
import type { GameState } from '../types/state.ts';
import { advanceStreak, localDateStr, streakMultiplier } from '../xp/streaks.ts';
import { awardXp } from '../xp/engine.ts';
import { awardQuestIfComplete } from '../xp/quests.ts';
import { awardDailyBonusIfComplete, ensureDailySet } from '../xp/daily.ts';
import { applyRecurrenceRollover } from '../xp/recurrence.ts';
import { evaluateAchievements } from '../xp/achievements.ts';
import { levelCurve } from '../xp/levels.ts';
import { weeklyXp } from '../views/stats.ts';
import { difficultyTag, formatTaskRow, weeklyChart, xpBar } from './format.ts';

export interface CliOutcome {
  code: number;
  stdout?: string;
  stderr?: string;
}

const SUBCOMMANDS = new Set(['add', 'list', 'done', 'stats']);

/**
 * Entry gate called by src/index.tsx before flag handling falls through to ink.
 * Returns undefined when argv is not a subcommand invocation (TUI path).
 */
export function dispatchCli(argv: readonly string[]): CliOutcome | undefined {
  const cmd = argv[0];
  if (cmd === undefined || cmd.startsWith('-')) return undefined;
  if (!SUBCOMMANDS.has(cmd)) {
    return { code: 1, stderr: `questline: unknown command '${cmd}' (try add|list|done|stats)\n` };
  }
  switch (cmd) {
    case 'add':
      return cmdAdd(argv.slice(1));
    case 'list':
      return cmdList(argv.slice(1));
    case 'done':
      return cmdDone(argv.slice(1));
    default:
      return cmdStats();
  }
}

/** Mirrors App boot (app.tsx): roll today's daily set, persisting a rollover at once. */
function bootState(): GameState {
  const loaded = loadState();
  const today = localDateStr();
  // Same composition as the TUI boot (app.tsx): dailies + recurrence rollover.
  let next = applyRecurrenceRollover(ensureDailySet(loaded, today), today);
  if (next !== loaded) saveStateAtomic(next, statePath());
  return next;
}

/**
 * Completion pipeline — identical composition to the TUI's completePipeline
 * (app.tsx): streak → multiplier → XP → quest bonuses → daily bonus →
 * achievements. Toast/LEVEL-UP messages are TUI-only; the CLI prints its own
 * one-line summary instead.
 * TODO(T8.3 window): extract into src/xp/pipeline.ts and have both call it.
 */
export function runCompletionPipeline(
  prev: GameState,
  taskId: string,
  today: string = localDateStr(),
): GameState {
  const task = getTask(prev, taskId);
  if (!task) return prev;
  // 1. streak evolution
  const { profile: streaked } = advanceStreak(prev.profile, today);
  let next: GameState = { ...prev, profile: streaked };
  // 2. XP with streak multiplier
  const mult = streakMultiplier(streaked.streakDays);
  next = {
    ...next,
    profile: { ...next.profile, totalXp: awardXp(next.profile.totalXp, task, mult) },
  };
  // 3. quest bonuses (exactly-once each)
  for (const q of next.quests) {
    if (!q.taskIds.includes(taskId)) continue;
    next = awardQuestIfComplete(next, q).state;
  }
  // 4. daily all-done bonus (+50, exactly-once via completedAll)
  next = awardDailyBonusIfComplete(next, today).state;
  // 4.5 achievements post-event (exactly-once unlocks)
  next = evaluateAchievements(next).state;
  return next;
}

function usageCli(msg: string): CliOutcome {
  return { code: 1, stderr: `questline: ${msg}\n` };
}

function cmdAdd(rest: readonly string[]): CliOutcome {
  let difficulty: Difficulty | undefined;
  let dueDate: string | undefined;
  const words: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (DIFFICULTIES.some((d) => `--${d}` === a)) {
      difficulty = a.slice(2) as Difficulty;
    } else if (a === '--due') {
      const spec = rest[i + 1];
      if (spec === undefined || spec.startsWith('--')) {
        return usageCli('--due requires a value (today|tomorrow|next-week|YYYY-MM-DD)');
      }
      const resolved = resolveDueSpec(spec, localDateStr());
      if (resolved === undefined) {
        return usageCli(`invalid --due value '${spec}' (want today|tomorrow|next-week|YYYY-MM-DD)`);
      }
      dueDate = resolved;
      i += 1;
    } else if (!a.startsWith('--')) {
      words.push(a);
    } else {
      return usageCli(`unknown flag '${a}'`);
    }
  }
  const title = words.join(' ').trim();
  if (title.length === 0) return usageCli('add requires a <title>');
  let state = bootState();
  state = addTask(state, title, difficulty ?? 'medium', undefined, undefined, dueDate);
  saveStateAtomic(state, statePath());
  const t = state.tasks.at(-1)!;
  const dueNote = t.dueDate !== undefined ? ` due ${t.dueDate}` : '';
  return { code: 0, stdout: `added ${t.id} ${t.title} (${t.difficulty})${dueNote}` };
}

/** Regular (non-daily) tasks in display order — the same rows the TUI lists. */
function regularTasks(state: GameState): Task[] {
  return sortedForDisplay(state.tasks.filter((t) => !t.isDaily));
}

function cmdList(rest: readonly string[]): CliOutcome {
  const all = rest.includes('--all');
  const shown = regularTasks(loadState()).filter((t) => all || t.status === 'todo');
  if (shown.length === 0) return { code: 0, stdout: 'no tasks yet' };
  return { code: 0, stdout: shown.map((t, i) => formatTaskRow(i + 1, t)).join('\n') };
}

function cmdDone(rest: readonly string[]): CliOutcome {
  const target = rest.find((a) => !a.startsWith('--'));
  if (target === undefined || target.length === 0) {
    return usageCli('done requires an <id|index> argument');
  }
  const prev = bootState();
  // Numeric targets resolve against the plain `list` view (todos only);
  // anything else is treated as an exact task id.
  const todos = regularTasks(prev).filter((t) => t.status === 'todo');
  const byIndex = /^\d+$/.test(target) ? todos[Number.parseInt(target, 10) - 1] : undefined;
  const task = byIndex ?? getTask(prev, target);
  if (!task) return usageCli(`no such task '${target}'`);
  if (task.status === 'done') return { code: 0, stdout: `already completed: ${task.title}` };

  const toggled = toggleDone(prev, task.id);
  const next = runCompletionPipeline(toggled, task.id);
  saveStateAtomic(next, statePath());
  const gained = next.profile.totalXp - prev.profile.totalXp;
  const lvl = levelCurve(next.profile.totalXp).level;
  return {
    code: 0,
    stdout: `done: ${task.title} +${gained}xp total=${next.profile.totalXp} lvl=${lvl}`,
  };
}

function cmdStats(): CliOutcome {
  const s = loadState();
  const li = levelCurve(s.profile.totalXp);
  const completions = s.tasks
    .filter((t): t is Task & { completedAt: number } => t.status === 'done' && t.completedAt !== undefined)
    .map((t) => ({ completedAt: t.completedAt, xp: xpValue(t) }));
  const lines = [
    `level ${li.level} · ${s.profile.totalXp} xp total`,
    `${xpBar(li.xpForNext > 0 ? li.intoLevel / li.xpForNext : 0)} ${li.intoLevel}/${li.xpForNext} into level`,
    `streak: ${s.profile.streakDays} day(s) · difficulty tags [${DIFFICULTIES.map(difficultyTag).join('/')}]`,
    weeklyChart(weeklyXp(completions, 7)),
  ];
  return { code: 0, stdout: lines.join('\n') };
}
