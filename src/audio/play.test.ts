// M13/T13.A: playback coverage — cache write, spawn argv, short-circuit,
// never-throws contract. All externalities (fs via temp XDG dir, spawn via
// injected runner) are isolated from the real environment.
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playEvent } from './play.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'questline-audio-'));
  process.env.XDG_CONFIG_HOME = dir;
});

afterEach(() => {
  delete process.env.XDG_CONFIG_HOME;
  rmSync(dir, { recursive: true, force: true });
});

describe('playEvent', () => {
  test('caches the synthesized wav and spawns aplay -q with its path', () => {
    const calls: string[][] = [];
    playEvent('levelUp', { runner: (argv) => void calls.push([...argv]) });

    const file = join(dir, 'questline', 'sounds', 'levelUp.wav');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(calls).toEqual([['aplay', '-q', file]]);
  });

  test('each kind gets its own cache file', () => {
    playEvent('achievement', { runner: () => {} });
    playEvent('questDone', { runner: () => {} });
    const soundsDir = join(dir, 'questline', 'sounds');
    expect(existsSync(join(soundsDir, 'achievement.wav'))).toBe(true);
    expect(existsSync(join(soundsDir, 'questDone.wav'))).toBe(true);
  });

  test('enabled=false short-circuits before any IO or spawn', () => {
    playEvent('levelUp', {
      enabled: false,
      runner: () => {
        throw new Error('runner must not be called when disabled');
      },
    });
    expect(existsSync(join(dir, 'questline'))).toBe(false);
  });

  test('a throwing runner (missing/busy aplay) is swallowed', () => {
    expect(() =>
      playEvent('questDone', {
        runner: () => {
          throw new Error('spawn aplay ENOENT');
        },
      }),
    ).not.toThrow();
  });
});
