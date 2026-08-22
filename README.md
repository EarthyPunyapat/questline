# ⚔ QUESTLINE

A gamified terminal life-tracker: turn your todo list into an RPG.
Tasks award XP by difficulty, day-streaks multiply gains, quest chains pay
completion bonuses — and a live MPRIS music widget keeps the soundtrack going.

<!-- CI badge: replace OWNER/REPO with your GitHub slug once the repo is pushed -->
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

![demo](docs/demo.gif)

## Features

- **Task RPG loop** — easy/medium/hard tasks → 10/25/50 XP, streak multiplier up to ×1.35, level curve with animated XP bar and level-up toasts
- **Quest chains** — group tasks into a quest; finish them all for a one-time bonus
- **Music widget** — any MPRIS-capable player (Firefox, Spotify, mpv…) shows title/artist/status; transport keys work on the active player
- **Stats** — 7-day XP chart, quests completed, streak & lifetime totals
- **Themes** — cycle 3 palettes at runtime
- **Durable state** — atomic JSON persistence at `$XDG_CONFIG_HOME/questline/state.json`, corrupt files auto-quarantined

## Requirements

- Linux with a systemd user session (for D-Bus/MPRIS)
- [bun](https://bun.sh) ≥ 1.4 (runtime + test), or Node ≥ 22 via the compiled binary

## Install

Build first, then install a symlink into `~/.local/bin` so `questline` runs from anywhere:

```bash
bun install
bun run build        # required once: produces dist/questline
bun run install      # symlink → ~/.local/bin/questline (idempotent)
```

Then launch from any directory:

```bash
questline            # or ./dist/questline without installing
```

If `~/.local/bin` is not on your `PATH`, the installer prints an
`export PATH="$HOME/.local/bin:$PATH"` hint to add to your shell profile.

Current release: **v0.1.0** (git tag).

## Run

```bash
bun install
bun run dev          # launch the TUI
```

## Test / Typecheck / Build

```bash
bun test             # 51 unit tests (store, xp math, media parsers)
bunx tsc --noEmit    # strict typecheck
bun run build        # single-file binary → dist/questline
./dist/questline --version
```

## CI

Every push and pull request runs [.github/workflows/ci.yml](.github/workflows/ci.yml)
on GitHub Actions (ubuntu-latest, bun 1.4.0): frozen-lockfile install → `bun test` →
`bunx tsc --noEmit` → compiled build + `--version` smoke — the exact same gates as
the local commands above, so a green badge means the tree passes locally-equivalent
checks.

## Keymap

| Key | Action |
|---|---|
| `j/k` or arrows | move selection |
| `enter` | toggle done (XP + streak) |
| `a` | add task |
| `d` | delete task |
| `v` | toggle stats view |
| `t` | cycle theme |
| `space` | play/pause |
| `n` / `b` | next / previous track |
| `?` | help overlay |
| `q` | quit |

## Architecture

```
src/
├── types/       domain models (task, quest, state)
├── store/       CRUD + atomic JSON persistence
├── xp/          pure engines: levels, streaks, quests, awards
├── media/       MPRIS layer: controller iface · native dbus-native impl · busctl fallback · mock
├── ui/          Ink widgets (Header/XpBar/TaskList/Modal/Toast/Help)
├── views/       StatsView (+ pure weekly aggregation)
└── app.tsx      layout, keybinds, mutation pipelines
```

Media backends are chosen at runtime: native `@homebridge/dbus-native` first,
automatic fallback to `busctl` subprocesses — zero native-build risk anywhere.

## Recording a demo GIF

```bash
asciinema rec demo.cast        # run questline, do cool things, ctrl-d
agg demo.cast docs/demo.gif    # https://github.com/asciinema/agg
```
