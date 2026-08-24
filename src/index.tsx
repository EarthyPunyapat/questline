#!/usr/bin/env bun
// Entrypoint. Flag handling MUST precede ink render: ink needs raw-mode stdin,
// and its media/dbus handles keep the event loop alive — any fall-through on a
// non-TTY would crash AND hang scripted invocations (see SYNC-1).
import React from 'react';
import { render } from 'ink';
import { App } from './app.tsx';
import { loadState } from './store/persist.ts';
import { exportState, importState } from './store/export.ts';
import { dispatchCli } from './cli/handler.ts';
import pkg from '../package.json';

const NAME = pkg.name;
const VERSION = pkg.version;

const USAGE = `${NAME} ${VERSION} — gamified terminal life-tracker

Usage: ${NAME} [flag]

Flags:
  --version        print version and exit
  --help           show this help and exit
  --smoke          non-interactive self-test (boot state layer, print summary)
  --export [path]  write a pretty JSON backup of current state and exit
                   (default: ./questline-backup-YYYY-MM-DD.json)
  --import <path>  restore state from a backup file and exit; the prior live
                   state is kept as <state>.import-bak

Commands (headless):
  add <title> [--easy|--medium|--hard]   create a task
  list [--all]                           show open tasks (--all includes done)
  done <list-index | task-id>            complete via the full XP pipeline
  stats                                  level/xp bar/streak/weekly chart
  undo                                   reverse your last completion (streak kept)
  note "<title>[; body]"                 create a note (semicolon splits body)

Interactive keys:
  j/k or arrows  move selection     enter   toggle done (XP + streak)
  a              add task          d       delete selected task
  v              toggle stats      t       cycle theme
  c              calendar (arrows page months)
  z              undo last completion
  N              notes (n new · enter/e edit · p pin · d delete)
  L              quest library (j/k select · enter start chain)
  p              start/pause pomodoro (25:00 -> +15 XP once/day)
  space          play/pause        n / b   next / previous track
  x              dismiss daily     tab     switch media player (>1 running)
  ?              help overlay      q       quit`;

const KNOWN_FLAGS = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '-V',
  '--smoke',
  '--export',
  '--import',
]);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-V') || args.includes('-v')) {
  console.log(`${NAME} ${VERSION}`);
  process.exit(0);
}

if (args.includes('--smoke')) {
  // Non-TTY validation path: exercise boot + state layer without raw-mode stdin.
  const s = loadState();
  console.log(
    `smoke ok: tasks=${s.tasks.length} quests=${s.quests.length} xp=${s.profile.totalXp} streak=${s.profile.streakDays}`,
  );
  process.exit(0);
}

// Headless subcommands (add|list|done|stats) — pure fs/domain work, no ink,
// no dbus, no raw-mode: safe for scripts and CI (SYNC-1 rule). Must precede
// the unknown-flag check, since command words are not KNOWN_FLAGS.
const cli = dispatchCli(args);
if (cli) {
  if (cli.stdout !== undefined) console.log(cli.stdout);
  if (cli.stderr !== undefined) process.stderr.write(cli.stderr);
  process.exit(cli.code);
}

// Backup flags are non-TTY safe: pure fs work, no ink render (SYNC-1 rule).
/** undefined = flag absent · null = flag present without a value · string = value */
function flagValue(name: string): string | null | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return v !== undefined && !v.startsWith('-') ? v : null;
}

const exportTarget = flagValue('--export');
if (exportTarget !== undefined) {
  try {
    const res = exportState(exportTarget ?? undefined);
    console.log(`exported ${res.taskCount} tasks (${res.totalXp} xp) -> ${res.path}`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`${NAME}: export failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

const importSource = flagValue('--import');
if (importSource !== undefined) {
  if (importSource === null) {
    process.stderr.write(`${NAME}: --import requires a <path> argument\n\n${USAGE}\n`);
    process.exit(1);
  }
  try {
    const res = importState(importSource);
    const bak = res.backupPath ? ` · prior state saved to ${res.backupPath}` : '';
    console.log(
      `imported ${res.imported.tasks.length} tasks (${res.imported.profile.totalXp} xp)${bak}`,
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`${NAME}: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

const unknown = args.find((a) => !KNOWN_FLAGS.has(a));
if (unknown !== undefined) {
  process.stderr.write(`${NAME}: unknown argument '${unknown}'\n\n${USAGE}\n`);
  process.exit(1);
}

// Interactive guard: without TTYs on both ends ink cannot enable raw mode and
// lingering handles would keep this process alive forever.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write(
    `${NAME} needs an interactive terminal. Try \`${NAME} --help\`.\n`,
  );
  process.exit(1);
}

// Wait for ink to unmount (q), then force-exit: lingering dbus/media handles
// otherwise keep the bun event loop alive as a zombie (SYNC-3).
const { waitUntilExit } = render(<App />);
await waitUntilExit();
process.exit(0);
