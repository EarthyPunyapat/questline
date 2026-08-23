// M11/A: pure ranking + smart-pick rules. No mocks needed — data-in/data-out.
import { describe, expect, test } from 'bun:test';
import {
  playersLine,
  rankPlayers,
  smartPick,
  STATUS_GLYPH,
  withTrackFallback,
  type RankedPlayer,
} from './pick.ts';

const FIREFOX = 'org.mpris.MediaPlayer2.firefox.instance_1_168';
const VLC = 'org.mpris.MediaPlayer2.vlc';
/** The exact failure mode from the field report: leftover fake MPRIS player
 * (python3 script) exposing EMPTY metadata — the old pick-first latched it. */
const GHOST = 'org.mpris.MediaPlayer2.zena';

const rp = (
  name: string,
  status: RankedPlayer['status'],
  hasTitle: boolean,
): RankedPlayer => ({
  name,
  label: name.replace(/^org\.mpris\.MediaPlayer2\./, '').replace(/\.instance.*$/, ''),
  status,
  hasTitle,
});

describe('rankPlayers ordering', () => {
  test('Playing before Paused before Stopped, regardless of input order', () => {
    const ranked = rankPlayers([
      rp(VLC, 'Stopped', true),
      rp(FIREFOX, 'Paused', true),
      rp(GHOST, 'Playing', false),
    ]);
    expect(ranked.map((r) => r.name)).toEqual([GHOST, FIREFOX, VLC]);
  });

  test('same status: titled beats untitled (ghost loses the tiebreak)', () => {
    const ranked = rankPlayers([
      rp(GHOST, 'Playing', false),
      rp(FIREFOX, 'Playing', true),
    ]);
    expect(ranked.map((r) => r.name)).toEqual([FIREFOX, GHOST]);
  });

  test('full tie broken by bus name (deterministic)', () => {
    const a = rp('org.mpris.MediaPlayer2.aaa', 'Paused', true);
    const z = rp('org.mpris.MediaPlayer2.zzz', 'Paused', true);
    expect(rankPlayers([z, a]).map((r) => r.name)).toEqual([a.name, z.name]);
    expect(rankPlayers([])).toEqual([]);
  });

  test('input array is never mutated', () => {
    const input = [rp(VLC, 'Stopped', true), rp(FIREFOX, 'Playing', true)];
    const snapshot = [...input];
    rankPlayers(input);
    expect(input).toEqual(snapshot);
  });
});

describe('smartPick (never latch a ghost unless it is the only one)', () => {
  test('empty bus → null', () => {
    expect(smartPick([])).toBeNull();
  });

  test('THE FIELD BUG: Playing ghost + titled real player → real one wins', () => {
    const ranked = rankPlayers([
      rp(GHOST, 'Playing', false), // leftover fake, empty Metadata
      rp(FIREFOX, 'Paused', true), // user's actual music app
    ]);
    expect(smartPick(ranked)).toBe(FIREFOX);
  });

  test('lone ghost IS latched (only-one exception)', () => {
    expect(smartPick([rp(GHOST, 'Stopped', false)])).toBe(GHOST);
  });

  test('multiple ghosts → null instead of an arbitrary dead latch', () => {
    expect(
      smartPick([rp(GHOST, 'Playing', false), rp('org.mpris.MediaPlayer2.zenb', 'Playing', false)]),
    ).toBeNull();
  });

  test('best-ranked titled candidate wins among several reals', () => {
    const ranked = rankPlayers([
      rp(VLC, 'Paused', true),
      rp(FIREFOX, 'Playing', true),
    ]);
    expect(smartPick(ranked)).toBe(FIREFOX);
  });
});

describe('discovery surface helpers', () => {
  test('STATUS_GLYPH covers every status', () => {
    expect(STATUS_GLYPH.Playing).toBe('▶');
    expect(STATUS_GLYPH.Paused).toBe('⏸');
    expect(STATUS_GLYPH.Stopped).toBe('■');
  });

  test('playersLine renders "⇄-style" roster only when >1 (mirrors multiPlayerHint rule)', () => {
    const two = [rp(GHOST, 'Playing', false), rp(FIREFOX, 'Paused', true)];
    expect(playersLine(two)).toBe('▶ zena · ⏸ firefox');
    expect(playersLine(two.slice(0, 1))).toBeNull();
    expect(playersLine([])).toBeNull();
  });
});

describe('withTrackFallback (empty-metadata tolerance)', () => {
  test('PLAYING without title → "unknown track"; artist preserved', () => {
    const out = withTrackFallback({
      playerName: 'zena',
      title: '',
      artist: '',
      status: 'Playing',
    });
    expect(out.title).toBe('unknown track');
    expect(out.status).toBe('Playing');
  });

  test('whitespace-only title also falls back', () => {
    const out = withTrackFallback({
      playerName: 'x',
      title: '   ',
      artist: 'A',
      status: 'Playing',
    });
    expect(out.title).toBe('unknown track');
  });

  test('paused/stopped blank titles stay blank; titled playing untouched', () => {
    const paused = { playerName: 'v', title: '', artist: '', status: 'Paused' as const };
    expect(withTrackFallback(paused).title).toBe('');
    const live = { playerName: 'f', title: 'Song', artist: '', status: 'Playing' as const };
    expect(withTrackFallback(live)).toBe(live); // same reference — zero-copy fast path
  });
});
