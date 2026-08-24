// M13/T13.A: fire-and-forget event jingle playback. Synthesizes each motif,
// caches the encoded WAV under <configDir>/sounds/<kind>.wav and hands it to
// aplay(1). Best-effort by contract: a missing binary, busy device or
// disabled config degrades to a silent no-op — playback must never crash
// the app (the UI layer calls this straight from its event flow).

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from '../store/persist.ts';
import { buildEventSound, type SoundKind } from './tone.ts';

/** Kill a hung aplay after this long; the app never waits on audio. */
export const APLAY_TIMEOUT_MS = 3000;

export interface PlayOptions {
  /** Master switch — pass config.sound here (default true). */
  enabled?: boolean;
  /**
   * Injection seam for tests: performs the actual spawn. Defaults to a real
   * `aplay -q <file>` child process with a 3s kill timeout. Throwing runners
   * are swallowed per the never-throws contract.
   */
  runner?: (argv: readonly string[]) => void;
}

/** Real runner: detached best-effort spawn; errors arrive as 'error' events. */
function defaultRunner(argv: readonly string[]): void {
  try {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: 'ignore' });
    child.on('error', () => {}); // ENOENT / EACCES — silent no-op by contract
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already exited */
      }
    }, APLAY_TIMEOUT_MS);
    child.on('close', () => clearTimeout(timer));
  } catch {
    /* spawn itself refused — stay silent */
  }
}

/**
 * Play the jingle for `kind`. Short-circuits to a no-op when disabled; any
 * filesystem or spawn failure is swallowed so callers can fire-and-forget.
 */
export function playEvent(kind: SoundKind, opts: PlayOptions = {}): void {
  if (opts.enabled === false) return;

  const wav = buildEventSound(kind);
  const file = join(stateDir(), 'sounds', `${kind}.wav`);
  try {
    mkdirSync(join(stateDir(), 'sounds'), { recursive: true });
    writeFileSync(file, wav);
  } catch {
    return; // unwritable config dir — silence beats crashing the UI
  }

  const run = opts.runner ?? defaultRunner;
  try {
    run(['aplay', '-q', file]);
  } catch {
    /* missing/busy aplay — by contract this is a no-op */
  }
}
