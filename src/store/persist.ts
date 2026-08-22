// Atomic JSON persistence for questline state.
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_STATE, type GameState } from '../types/state.ts';

export { DEFAULT_STATE };

/** Fresh empty state (defensive clone — callers may mutate what they receive). */
export function defaultState(): GameState {
  return structuredClone(DEFAULT_STATE);
}

export function stateDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdg, 'questline');
}

export function statePath(): string {
  return join(stateDir(), 'state.json');
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function normalize(raw: unknown): GameState | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.tasks) || !Array.isArray(r.quests)) return undefined;
  const pRaw = (r.profile ?? {}) as Record<string, unknown>;
  if (typeof pRaw.totalXp !== 'number' || !Number.isFinite(pRaw.totalXp)) return undefined;
  const profile = {
    totalXp: Math.max(0, Math.floor(pRaw.totalXp)),
    streakDays:
      typeof pRaw.streakDays === 'number' && Number.isFinite(pRaw.streakDays)
        ? Math.max(0, Math.floor(pRaw.streakDays))
        : 0,
    lastCompletedDay:
      typeof pRaw.lastCompletedDay === 'string' ? pRaw.lastCompletedDay : null,
  };
  // Older saves predate completedQuestIds → default to [].
  const cqiRaw = r.completedQuestIds;
  const completedQuestIds = Array.isArray(cqiRaw)
    ? cqiRaw.filter((id): id is string => typeof id === 'string')
    : [];
  const out: GameState = {
    version: 1,
    tasks: clone(r.tasks as GameState['tasks']),
    quests: clone(r.quests as GameState['quests']),
    profile,
    completedQuestIds,
  };
  return out;
}

/** Load state from disk; corrupted files are backed up and replaced by defaults. */
export function loadState(path: string = statePath()): GameState {
  if (!existsSync(path)) return clone(DEFAULT_STATE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    backupCorrupt(path);
    return clone(DEFAULT_STATE);
  }
  const normalized = normalize(parsed);
  if (normalized) return normalized;
  backupCorrupt(path);
  return clone(DEFAULT_STATE);
}

function backupCorrupt(path: string): void {
  try {
    copyFileSync(path, `${path}.corrupt-${Date.now()}.bak`);
  } catch {
    /* best-effort backup */
  }
}

/** Default writer: write → fsync (bytes on disk) before caller renames. */
function writeFileFsync(path: string, data: string): void {
  const fd = openSync(path, 'w');
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomic save: write tmp sibling → rename(2) over target.
 * `writeFile` is injectable for failure-simulation tests; failures clean up tmp.
 */
export function saveStateAtomic(
  state: GameState,
  path: string = statePath(),
  writeFile: (path: string, data: string) => void = writeFileFsync,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFile(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* nothing to clean */
    }
    throw err;
  }
}

// writeFileSync retained in import graph for type-compat of injectables
void writeFileSync;
