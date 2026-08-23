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
import {
  DEFAULT_STATE,
  MAX_DAILY_ARCHIVE,
  MAX_NOTE_BODY_LEN,
  MAX_NOTE_TITLE_LEN,
  migrateV1toV2,
  migrateV2toV3,
  migrateV3toV4,
  type DailyQuestSet,
  type GameState,
  type MissedDailyRecord,
  type Note,
} from '../types/state.ts';
import type { Recurrence, Task } from '../types/task.ts';

/** Defensive recurrence sanitizer (v3): keep well-formed schedules, drop
 * malformed ones rather than rejecting the whole save. */
function sanitizeRecurrence(t: Task): Task {
  const rec: unknown = t.recurrence;
  if (rec === undefined) return t;
  if (typeof rec !== 'object' || rec === null) return { ...t, recurrence: undefined };
  const r = rec as Record<string, unknown>;
  if (r.freq === 'daily') return { ...t, recurrence: { freq: 'daily' } };
  if (r.freq === 'weekly' && Array.isArray(r.weekdays)) {
    const weekdays = [
      ...new Set(
        r.weekdays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6),
      ),
    ].sort((a, b) => a - b);
    if (weekdays.length > 0) {
      return { ...t, recurrence: { freq: 'weekly', weekdays } as Recurrence };
    }
  }
  return { ...t, recurrence: undefined };
}

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
    // Older saves predate achievements → default to []; malformed rows dropped.
    achievements: Array.isArray(pRaw.achievements)
      ? pRaw.achievements.filter(
          (a): a is { id: string; unlockedAt: number } =>
            typeof a === 'object' &&
            a !== null &&
            typeof (a as Record<string, unknown>).id === 'string' &&
            typeof (a as Record<string, unknown>).unlockedAt === 'number',
        )
      : [],
  };
  // Older saves predate completedQuestIds → default to [].
  const cqiRaw = r.completedQuestIds;
  const completedQuestIds = Array.isArray(cqiRaw)
    ? cqiRaw.filter((id): id is string => typeof id === 'string')
    : [];
  // v1→v2→v3→v4 migration chain: legacy saves gain dailies fields, re-version
  // for recurrence (v3), then gain an empty notes list (v4).
  let out: GameState = migrateV3toV4(
    migrateV2toV3(
      migrateV1toV2({
        version: 1,
        tasks: clone(r.tasks as GameState['tasks']),
        quests: clone(r.quests as GameState['quests']),
        profile,
        completedQuestIds,
      }),
    ),
  );
  out = { ...out, tasks: out.tasks.map(sanitizeRecurrence) };
  const dailies = parseDailies(r.dailies);
  if (dailies) out = { ...out, dailies };
  if (Array.isArray(r.dailiesArchive)) {
    const archive: MissedDailyRecord[] = r.dailiesArchive
      .filter(
        (a): a is MissedDailyRecord =>
          typeof a === 'object' &&
          a !== null &&
          typeof (a as Record<string, unknown>).dateISO === 'string' &&
          typeof (a as Record<string, unknown>).missedCount === 'number',
      )
      .slice(-MAX_DAILY_ARCHIVE);
    out = { ...out, dailiesArchive: archive };
  }
  // v4 notes: absent container keeps the migrated []; malformed rows are
  // dropped; over-long strings clamped to caps (never lose a whole note to
  // one hand-edited field).
  const notes = parseNotes(r.notes);
  if (notes) out = { ...out, notes };
  // Achievements: migrateV1toV2 preserves any parsed unlocks (defensive ?? []
  // since f352ac8) — parseAchievements re-attaches the sanitized v2 list.
  const achievements = parseAchievements(pRaw.achievements);
  if (achievements) out = { ...out, profile: { ...out.profile, achievements } };
  return out;
}

/** Defensive achievements reader; undefined when absent/invalid container. */
function parseAchievements(
  raw: unknown,
): { id: string; unlockedAt: number }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(
    (a): a is { id: string; unlockedAt: number } =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Record<string, unknown>).id === 'string' &&
      typeof (a as Record<string, unknown>).unlockedAt === 'number',
  );
}

/** Defensive v4 notes reader; undefined keeps migrated default []. Malformed
 * rows dropped; over-long strings clamped to caps (never lose a whole note
 * because one hand-edited field is too long). */
function parseNotes(raw: unknown): Note[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Note[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue;
    const n = row as Record<string, unknown>;
    if (
      typeof n.id !== 'string' ||
      n.id.length === 0 ||
      typeof n.title !== 'string' ||
      typeof n.body !== 'string' ||
      typeof n.createdAt !== 'number' ||
      !Number.isFinite(n.createdAt) ||
      typeof n.updatedAt !== 'number' ||
      !Number.isFinite(n.updatedAt)
    ) {
      continue;
    }
    out.push({
      id: n.id,
      title: n.title.slice(0, MAX_NOTE_TITLE_LEN),
      body: n.body.slice(0, MAX_NOTE_BODY_LEN),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      pinned: n.pinned === true,
    });
  }
  return out;
}

/** Defensive v2 daily-set reader; returns null for missing/invalid shapes. */
function parseDailies(raw: unknown): DailyQuestSet | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (
    typeof d.dateISO !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.dateISO) ||
    !Array.isArray(d.questIds) ||
    !d.questIds.every((id) => typeof id === 'string') ||
    typeof d.completedAll !== 'boolean'
  ) {
    return null;
  }
  return {
    dateISO: d.dateISO,
    questIds: d.questIds,
    completedAll: d.completedAll,
  };
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
