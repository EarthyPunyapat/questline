// State backup/restore commands backing the --export/--import CLI flags.
// Both paths are non-TTY safe: they run before ink render in index.tsx.
//
// Export writes a pretty-printed snapshot of the live state (read through the
// normal defensive loader). Import validates a backup against the GameState
// schema (minimal structural checks reusing isValidTask), backs up the prior
// live file, then replaces it through the SAME atomic tmp+rename writer the
// app uses for ordinary saves — never bypassing durability.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadState, saveStateAtomic, statePath } from './persist.ts';
import { isValidTask } from '../types/task.ts';
import {
  migrateV1toV2,
  migrateV2toV3,
  type DailyQuestSet,
  type GameState,
  type MissedDailyRecord,
} from '../types/state.ts';

/** Backup copies of the live state get this suffix. */
export const IMPORT_BAK_SUFFIX = '.import-bak';

/** Default export destination: ./questline-backup-<local YYYY-MM-DD>.json */
export function defaultExportPath(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `questline-backup-${y}-${m}-${d}.json`;
}

export interface ExportResult {
  /** Destination file actually written. */
  path: string;
  taskCount: number;
  totalXp: number;
}

/**
 * Snapshot `sourcePath` (default: live state) into `outPath` as pretty JSON
 * (2-space indent, same formatting as atomic saves). Returns where/count.
 */
export function exportState(
  outPath: string = defaultExportPath(),
  sourcePath: string = statePath(),
): ExportResult {
  const state = loadState(sourcePath);
  writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8');
  return { path: outPath, taskCount: state.tasks.length, totalXp: state.profile.totalXp };
}

export type ParseBackupResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

/**
 * Validate parsed backup JSON against the GameState schema and rebuild a
 * canonical v2 state from it. Core structure (version, tasks, quests,
 * profile totals) must be valid or the import is REFUSED; secondary
 * collections (achievements/dailies/archive) are sanitized defensively —
 * dropping malformed rows exactly like the loader would.
 * Accepts legacy v1 backups (migrated up via migrateV1toV2).
 */
export function parseBackup(raw: unknown): ParseBackupResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'top-level value is not a JSON object' };
  }
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 && r.version !== 2 && r.version !== 3) {
    return {
      ok: false,
      reason: `unsupported version ${JSON.stringify(r.version) ?? String(r.version)} (expected 1, 2 or 3)`,
    };
  }
  if (!Array.isArray(r.tasks)) {
    return { ok: false, reason: "'tasks' is missing or not an array" };
  }
  if (!r.tasks.every((t) => isValidTask(t))) {
    return { ok: false, reason: "at least one entry of 'tasks' is not a valid Task" };
  }
  if (
    !Array.isArray(r.quests) ||
    !r.quests.every((q) => typeof q === 'object' && q !== null && typeof (q as { id?: unknown }).id === 'string')
  ) {
    return { ok: false, reason: "'quests' must be an array of quest objects with string ids" };
  }
  if (
    r.completedQuestIds !== undefined &&
    (!Array.isArray(r.completedQuestIds) ||
      !r.completedQuestIds.every((id) => typeof id === 'string'))
  ) {
    return { ok: false, reason: "'completedQuestIds' must be an array of strings" };
  }

  const pRaw = (r.profile ?? {}) as Record<string, unknown>;
  if (typeof pRaw.totalXp !== 'number' || !Number.isFinite(pRaw.totalXp) || pRaw.totalXp < 0) {
    return { ok: false, reason: "'profile.totalXp' must be a finite non-negative number" };
  }
  if (
    pRaw.streakDays !== undefined &&
    (typeof pRaw.streakDays !== 'number' || !Number.isFinite(pRaw.streakDays) || pRaw.streakDays < 0)
  ) {
    return { ok: false, reason: "'profile.streakDays' must be a finite non-negative number" };
  }
  if (
    pRaw.lastCompletedDay !== undefined &&
    pRaw.lastCompletedDay !== null &&
    typeof pRaw.lastCompletedDay !== 'string'
  ) {
    return { ok: false, reason: "'profile.lastCompletedDay' must be a string or null" };
  }

  const tasks = structuredClone(r.tasks as GameState['tasks']);
  const quests = structuredClone(r.quests as GameState['quests']);
  const completedQuestIds = Array.isArray(r.completedQuestIds)
    ? structuredClone(r.completedQuestIds as string[])
    : [];
  const profile = {
    totalXp: Math.floor(pRaw.totalXp),
    streakDays: typeof pRaw.streakDays === 'number' ? Math.floor(pRaw.streakDays) : 0,
    lastCompletedDay:
      typeof pRaw.lastCompletedDay === 'string' ? pRaw.lastCompletedDay : null,
  };

  let out: GameState;
  if (r.version === 1) {
    out = migrateV2toV3(
      migrateV1toV2({ version: 1, tasks, quests, profile, completedQuestIds }),
    );
    out = { ...out, profile: { ...out.profile, ...parseAchievements(pRaw.achievements) } };
  } else {
    out = migrateV2toV3({
      version: 2,
      tasks,
      quests,
      profile: { ...profile, ...parseAchievements(pRaw.achievements) },
      completedQuestIds,
      dailies: parseDailies(r.dailies),
      dailiesArchive: parseDailiesArchive(r.dailiesArchive),
    });
  }
  return { ok: true, state: out };
}

function parseAchievements(
  raw: unknown,
): { achievements: GameState['profile']['achievements'] } {
  if (!Array.isArray(raw)) return { achievements: [] };
  return {
    achievements: raw.filter(
      (a): a is { id: string; unlockedAt: number } =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as Record<string, unknown>).id === 'string' &&
        typeof (a as Record<string, unknown>).unlockedAt === 'number',
    ),
  };
}

function parseDailies(raw: unknown): GameState['dailies'] {
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
  const set: DailyQuestSet = {
    dateISO: d.dateISO,
    questIds: d.questIds,
    completedAll: d.completedAll,
  };
  return set;
}

function parseDailiesArchive(raw: unknown): MissedDailyRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is MissedDailyRecord =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Record<string, unknown>).dateISO === 'string' &&
      typeof (a as Record<string, unknown>).missedCount === 'number',
  );
}

export interface ImportResult {
  imported: GameState;
  /** Pre-import safety copy of the live file; null when none existed. */
  backupPath: string | null;
}

/**
 * Restore a backup over the live state. Refusals throw with a clear reason
 * BEFORE any disk mutation: unreadable file, invalid JSON, schema mismatch.
 * On success: prior live state (when present) is copied to
 * `<state>.import-bak`, then the validated state is written atomically.
 */
export function importState(backupFile: string, livePath: string = statePath()): ImportResult {
  let text: string;
  try {
    text = readFileSync(backupFile, 'utf8');
  } catch (err) {
    throw new Error(`cannot read backup '${backupFile}': ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`invalid JSON in '${backupFile}': ${(err as Error).message}`);
  }
  const res = parseBackup(parsed);
  if (!res.ok) {
    throw new Error(`backup schema mismatch in '${backupFile}': ${res.reason}`);
  }

  let backupPath: string | null = null;
  if (existsSync(livePath)) {
    backupPath = `${livePath}${IMPORT_BAK_SUFFIX}`;
    copyFileSync(livePath, backupPath);
  }
  saveStateAtomic(res.state, livePath);
  return { imported: res.state, backupPath };
}
