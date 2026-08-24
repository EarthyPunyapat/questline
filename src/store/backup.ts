// M13/T13.C: daily state backup rotation. On every boot (BEFORE any write)
// the current state.json is snapshotted to backups/state-YYYY-MM-DD.json and
// only the newest `keep` snapshots survive. Same-day reruns overwrite in
// place, so one calendar day never consumes two slots.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

/** Backups live under <stateDir>/backups. */
export const BACKUP_DIR = 'backups';

/** Default retention window (days). */
export const DEFAULT_KEEP = 7;

const NAME_RE = /^state-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Snapshot `<dir>/state.json` to `<dir>/backups/state-<today>.json`, then
 * prune the oldest snapshots beyond `keep`. Snapshot names are ISO dates, so
 * lexicographic sort IS chronological order. Missing state.json is a clean
 * no-op (nothing to back up yet). Returns the retained snapshot filenames
 * (oldest first) so tests can assert the sliding window directly.
 */
export function rotateBackups(
  dir: string,
  today: string,
  keep: number = DEFAULT_KEEP,
): string[] {
  const stateFile = join(dir, 'state.json');
  if (!existsSync(stateFile)) return [];

  const backupDir = join(dir, BACKUP_DIR);
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(stateFile, join(backupDir, `state-${today}.json`));

  const names = readdirSync(backupDir).filter((n) => NAME_RE.test(n)).sort();
  const excess = Math.max(0, names.length - Math.max(0, keep));
  for (const stale of names.slice(0, excess)) {
    unlinkSync(join(backupDir, stale));
  }
  return names.slice(excess);
}
