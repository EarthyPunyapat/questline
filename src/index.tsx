#!/usr/bin/env bun
// Entrypoint. Flag handling MUST precede ink render: ink needs raw-mode stdin,
// and its media/dbus handles keep the event loop alive — any fall-through on a
// non-TTY would crash AND hang scripted invocations (see SYNC-1).
import React from 'react';
import { render } from 'ink';
import { App } from './app.tsx';
import { loadState } from './store/persist.ts';
import pkg from '../package.json';

const NAME = pkg.name;
const VERSION = pkg.version;

const USAGE = `${NAME} ${VERSION} — gamified terminal life-tracker

Usage: ${NAME} [flag]

Flags:
  --version        print version and exit
  --help           show this help and exit
  --smoke          non-interactive self-test (boot state layer, print summary)

Interactive keys:
  j/k or arrows  move selection     enter   toggle done (XP + streak)
  a              add task          d       delete selected task
  v              toggle stats      t       cycle theme
  space          play/pause        n / b   next / previous track
  ?              help overlay      q       quit`;

const KNOWN_FLAGS = new Set(['--help', '-h', '--version', '-v', '-V', '--smoke']);

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
