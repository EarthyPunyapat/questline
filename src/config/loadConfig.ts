// M12/T12.A: validated ~/.config/questline/config.json support.
// Reads <dir>/config.json and falls back to safe defaults PER FIELD — a bad
// value never breaks boot, and an absent file is never created on read.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from '../store/persist.ts';
import { THEMES } from '../ui/theme.ts';

/** File name resolved inside the state dir (same XDG root as state.json). */
export const CONFIG_FILE = 'config.json';

/** Inclusive pomodoro duration bounds; outside either → default. */
export const POMODORO_MIN_MINUTES = 5;
export const POMODORO_MAX_MINUTES = 120;

/** First theme in THEMES — the pre-config default palette id. */
export const DEFAULT_CONFIG = {
  pomodoroMinutes: 25,
  defaultTheme: THEMES[0]!.name,
  showSeconds: false,
  sound: true,
} as const;

export interface QuestlineConfig {
  /** Focus length in whole minutes, clamped domain [5, 120]. */
  pomodoroMinutes: number;
  /** One of the theme ids exported by ui/theme.ts. */
  defaultTheme: string;
  /** Render tenths in the header countdown (future use, S12.A2). */
  showSeconds: boolean;
  /** Event jingle playback (M13/T13.A); false silences playEvent. */
  sound: boolean;
}

function fallbackConfig(): QuestlineConfig {
  return { ...DEFAULT_CONFIG };
}

function configPath(dir: string): string {
  return join(dir, CONFIG_FILE);
}

function parseMinutes(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return DEFAULT_CONFIG.pomodoroMinutes;
  if (v < POMODORO_MIN_MINUTES || v > POMODORO_MAX_MINUTES) {
    return DEFAULT_CONFIG.pomodoroMinutes;
  }
  return v;
}

function parseTheme(v: unknown): string {
  if (typeof v !== 'string') return DEFAULT_CONFIG.defaultTheme;
  return THEMES.some((t) => t.name === v) ? v : DEFAULT_CONFIG.defaultTheme;
}

function parseShowSeconds(v: unknown): boolean {
  return typeof v === 'boolean' ? v : DEFAULT_CONFIG.showSeconds;
}

function parseSound(v: unknown): boolean {
  return typeof v === 'boolean' ? v : DEFAULT_CONFIG.sound;
}

/**
 * Load config.json from `dir` (default: the same XDG dir state.json uses).
 * Missing file, unreadable file, or malformed JSON all yield defaults.
 * Never creates the file — call writeDefaultConfig() for that.
 */
export function loadConfig(dir: string = stateDir()): QuestlineConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath(dir), 'utf8'));
  } catch {
    return fallbackConfig();
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fallbackConfig();
  }
  const r = raw as Record<string, unknown>;
  return {
    pomodoroMinutes: parseMinutes(r['pomodoroMinutes']),
    defaultTheme: parseTheme(r['defaultTheme']),
    showSeconds: parseShowSeconds(r['showSeconds']),
    sound: parseSound(r['sound']),
  };
}

/**
 * Materialize a defaults config at `<dir>/config.json`, creating `dir` when
 * needed. Reserved for first-run UX (nothing calls it yet); safe to re-run.
 */
export function writeDefaultConfig(dir: string = stateDir()): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(dir), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
}
