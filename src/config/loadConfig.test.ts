// M12/T12.A: validated ~/.config/questline/config.json support.
// Contract: absent file -> defaults (never created on read); every field is
// validated independently with silent fallback-to-default on bad values.
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  loadConfig,
  writeDefaultConfig,
} from './loadConfig.ts';

const makeDir = (): string => mkdtempSync(join(tmpdir(), 'qt-config-'));
let cleanup: string | undefined;

afterEach(() => {
  if (cleanup !== undefined) {
    rmSync(cleanup, { recursive: true, force: true });
    cleanup = undefined;
  }
});

const withFile = (body: string): string => {
  const dir = makeDir();
  cleanup = dir;
  writeFileSync(join(dir, CONFIG_FILE), body);
  return dir;
};

describe('loadConfig', () => {
  test('absent file yields defaults and creates nothing on read', () => {
    const dir = makeDir();
    cleanup = dir;
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
    // The proof that matters: config.json was NOT materialized on read.
    let threw = false;
    try {
      readFileSync(join(dir, CONFIG_FILE), 'utf8');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('valid file roundtrips all four fields', () => {
    const dir = withFile(
      '{"pomodoroMinutes":50,"defaultTheme":"ocean","showSeconds":true,"sound":false}',
    );
    expect(loadConfig(dir)).toEqual({
      pomodoroMinutes: 50,
      defaultTheme: 'ocean',
      showSeconds: true,
      sound: false,
    });
  });

  test('bounds enforced: below 5 and above 120 fall back to default', () => {
    expect(loadConfig(withFile('{"pomodoroMinutes":4}')).pomodoroMinutes).toBe(25);
    expect(loadConfig(withFile('{"pomodoroMinutes":121}')).pomodoroMinutes).toBe(25);
    expect(loadConfig(withFile('{"pomodoroMinutes":5}')).pomodoroMinutes).toBe(5);
    expect(loadConfig(withFile('{"pomodoroMinutes":120}')).pomodoroMinutes).toBe(120);
  });

  test('non-finite and fractional minutes are bad fields', () => {
    expect(loadConfig(withFile('{"pomodoroMinutes":"30"}')).pomodoroMinutes).toBe(25);
    expect(
      loadConfig(withFile('{"pomodoroMinutes":Number.NaN}')).pomodoroMinutes,
    ).toBe(25);
    expect(loadConfig(withFile('{"pomodoroMinutes":25.5}')).pomodoroMinutes).toBe(25);
  });

  test('defaultTheme must match a real theme id', () => {
    expect(loadConfig(withFile('{"defaultTheme":"nope"}')).defaultTheme).toBe(
      DEFAULT_CONFIG.defaultTheme,
    );
    expect(loadConfig(withFile('{"defaultTheme":42}')).defaultTheme).toBe(
      DEFAULT_CONFIG.defaultTheme,
    );
  });

  test('showSeconds must be boolean', () => {
    expect(loadConfig(withFile('{"showSeconds":"yes"}')).showSeconds).toBe(false);
    expect(loadConfig(withFile('{"showSeconds":1}')).showSeconds).toBe(false);
    expect(loadConfig(withFile('{"showSeconds":false}')).showSeconds).toBe(false);
  });

  test('sound defaults to true; explicit false survives; bad type falls back', () => {
    expect(loadConfig(withFile('{}')).sound).toBe(true);
    expect(loadConfig(withFile('{"sound":false}')).sound).toBe(false);
    expect(loadConfig(withFile('{"sound":"yes"}')).sound).toBe(true);
    expect(loadConfig(withFile('{"sound":1}')).sound).toBe(true);
  });

  test('each bad field falls back independently; good neighbors survive', () => {
    const dir = withFile(
      '{"pomodoroMinutes":0,"defaultTheme":"inferno","showSeconds":"no","sound":"off","extra":1}',
    );
    expect(loadConfig(dir)).toEqual({
      pomodoroMinutes: 25,
      defaultTheme: 'inferno',
      showSeconds: false,
      sound: true,
    });
  });

  test('malformed JSON and non-object roots yield defaults silently', () => {
    for (const body of ['{not json', '[]', '42', '"x"', 'null']) {
      expect(loadConfig(withFile(body))).toEqual(DEFAULT_CONFIG);
    }
  });

  test('explicit dir wins over XDG default', () => {
    const dir = withFile('{"pomodoroMinutes":90}');
    expect(loadConfig(dir).pomodoroMinutes).toBe(90);
  });
});

describe('writeDefaultConfig', () => {
  test('creates dir + defaults file; loadConfig reads them back', () => {
    const dir = makeDir();
    cleanup = dir;
    writeDefaultConfig(dir);
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });

  test('overwrite is idempotent', () => {
    const dir = withFile('{"pomodoroMinutes":60}');
    writeDefaultConfig(dir); // clobbers the custom file with defaults
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
    writeDefaultConfig(dir);
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });
});
