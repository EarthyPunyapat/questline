import { describe, test, expect } from 'bun:test';
import {
  parseMprisPlayers,
  parseStatus,
  mapMetadata,
  identityFromBusName,
  buildSnapshot,
  parseBoolProp,
} from './mpris.ts';
import { parseBusctlVariant } from './subprocess-controller.ts';
import { createMockController } from './mock-controller.ts';
import {
  ActiveMediaSession,
  createMediaSession,
  multiPlayerHint,
} from './session.ts';
import {
  playersLine,
  rankPlayers,
  smartPick,
  STATUS_GLYPH,
  withTrackFallback,
} from './pick.ts';

const FIREFOX = 'org.mpris.MediaPlayer2.firefox.instance_1_168';
const VLC = 'org.mpris.MediaPlayer2.vlc';

describe('mpris parsers (pure — no live bus)', () => {
  test('parseMprisPlayers keeps only MPRIS buses', () => {
    const reply = [
      [
        'org.freedesktop.DBus',
        'org.mpris.MediaPlayer2.firefox.instance_1_168',
        'org.mpris.MediaPlayer2.vlc',
        'ca.desrt.dconf',
      ],
      ['o1', 'o2', 'o3', 'o4'],
    ];
    expect(parseMprisPlayers(reply)).toEqual([
      'org.mpris.MediaPlayer2.firefox.instance_1_168',
      'org.mpris.MediaPlayer2.vlc',
    ]);
    expect(parseMprisPlayers([])).toEqual([]);
    expect(parseMprisPlayers(undefined)).toEqual([]);
  });

  test('parseStatus: plain + busctl-quoted forms; garbage → Stopped', () => {
    expect(parseStatus('Playing')).toBe('Playing');
    expect(parseStatus('Paused')).toBe('Paused');
    expect(parseStatus('s "Playing"')).toBe('Playing'); // busctl prints s "Playing"
    expect(parseStatus('Garbage')).toBe('Stopped');
    expect(parseStatus(undefined)).toBe('Stopped');
  });

  test('mapMetadata extracts title/artist from a flat metadata dict', () => {
    const md = {
      'xesam:title': 'Bohemian Rhapsody',
      'xesam:artist': ['Queen'],
    };
    const t = mapMetadata(md);
    expect(t.title).toBe('Bohemian Rhapsody');
    expect(t.artist).toBe('Queen');

    // single-string artist also accepted
    expect(mapMetadata({ 'xesam:title': 'X', 'xesam:artist': 'Solo' }).artist).toBe('Solo');
  });

  test('mapMetadata: EMPTY dict (firefox quirk) → undefined fields, never throws', () => {
    for (const input of [{}, { value: {} }, undefined, null, 'nonsense']) {
      const t = mapMetadata(input);
      expect(t.title).toBeUndefined();
      expect(t.artist).toBeUndefined();
    }
  });

  test('identityFromBusName strips prefix + instance churn suffix', () => {
    expect(identityFromBusName('org.mpris.MediaPlayer2.firefox.instance_1_168')).toBe('firefox');
    expect(identityFromBusName('org.mpris.MediaPlayer2.vlc')).toBe('vlc');
  });

  test('buildSnapshot assembles PlayerSnapshot (+label override)', () => {
    const snap = buildSnapshot('org.mpris.MediaPlayer2.vlc', '"Playing"', {
      'xesam:title': 'T',
      'xesam:artist': 'A',
    });
    expect(snap.playerName).toBe('vlc');
    expect(snap.status).toBe('Playing');
    expect(snap.title).toBe('T');
    expect(snap.artist).toBe('A');

    const labelled = buildSnapshot('org.mpris.MediaPlayer2.vlc', 'Paused', {}, 'VLC media player');
    expect(labelled.playerName).toBe('VLC media player');
    expect(labelled.title).toBe('');
  });
});

describe('parseBusctlVariant (subprocess Metadata parsing)', () => {
  test('extracts xesam/mpris keys from busctl Get output', () => {
    const raw = `a{sv} 4 "xesam:title" s "Nightcall" "xesam:artist" as 1 "Kavinsky" "mpris:length" x 256000000 "mpris:artUrl" s "https://c/jpg"`;
    const d = parseBusctlVariant(raw);
    expect(d['xesam:title']).toBe('Nightcall');
    expect(d['xesam:artist']).toEqual(['Kavinsky']);
    expect(d['mpris:artUrl']).toBe('https://c/jpg');
    expect(d['mpris:length']).toBe(256000000);
  });

  test('empty metadata output → empty dict', () => {
    expect(parseBusctlVariant('a{sv} 0 "{}"')).toEqual({});
  });
});

describe('MockMediaController (test double — zero live calls)', () => {
  test('no players → snapshot null', async () => {
    const m = createMockController([]);
    expect(await m.listPlayers()).toEqual([]);
    expect(await m.snapshot('anything')).toBeNull();
  });

  test('playPause toggles status and records the command', async () => {
    const m = createMockController();
    const bus = (await m.listPlayers())[0]!;
    m.setSnapshot(bus, { status: 'Playing', title: 'Song A' });
    expect((await m.snapshot(bus))?.status).toBe('Playing');

    await m.send(bus, 'playPause');
    expect((await m.snapshot(bus))?.status).toBe('Paused');
    await m.send(bus, 'next');
    expect(m.commands).toEqual([
      { busName: bus, cmd: 'playPause' },
      { busName: bus, cmd: 'next' },
    ]);
  });

  test('setSnapshot drives title/artist for UI states', async () => {
    const m = createMockController();
    const bus = (await m.listPlayers())[0]!;
    m.setSnapshot(bus, { title: 'T', artist: 'A B' });
    const snap = await m.snapshot(bus);
    expect(snap?.title).toBe('T');
    expect(snap?.artist).toBe('A B');
    expect(snap?.playerName).toBe('firefox');
  });
});

describe('parseBoolProp (T8.2 Can* parsing)', () => {
  test('plain + variant-envelope + busctl textual forms', () => {
    expect(parseBoolProp(true)).toBe(true);
    expect(parseBoolProp(false)).toBe(false);
    expect(parseBoolProp({ type: 'b', value: true })).toBe(true);
    expect(parseBoolProp({ value: false })).toBe(false);
    expect(parseBoolProp('b true')).toBe(true);
    expect(parseBoolProp('b false')).toBe(false);
    expect(parseBoolProp(['b', 'true'])).toBe(true);
    expect(parseBoolProp(1)).toBe(true);
    expect(parseBoolProp(0)).toBe(false);
  });

  test('garbage → null (caller applies DEFAULT_CAPS, never guesses)', () => {
    for (const bad of [undefined, null, {}, 'nonsense', 2, 'b maybe']) {
      expect(parseBoolProp(bad)).toBeNull();
    }
  });
});

describe('ActiveMediaSession (T8.2 multi-player)', () => {
  test('discovery lists BOTH players with friendly labels', async () => {
    const s = createMediaSession(createMockController([FIREFOX, VLC]));
    const found = await s.discover();
    expect(found).toEqual([
      { name: FIREFOX, label: 'firefox' },
      { name: VLC, label: 'vlc' },
    ]);
    expect(s.players.length).toBe(2);
  });

  test('smart default pick: ranked winner owns transport (M11/A)', async () => {
    const m = createMockController([VLC, FIREFOX]);
    // Old pick-first grabbed whichever bus listed first — now Playing ranks first.
    m.setSnapshot(VLC, { status: 'Paused', title: 'b-side' });
    m.setSnapshot(FIREFOX, { status: 'Playing', title: 'hit song' });
    const s = new ActiveMediaSession(m);
    expect(await s.autoPick()).toBe(FIREFOX);
    await s.send('next');
    expect(m.commands).toEqual([{ busName: FIREFOX, cmd: 'next' }]);
  });

  test('switchTo(label) retargets transport to the correct interface/bus', async () => {
    const m = createMockController([FIREFOX, VLC]);
    const s = new ActiveMediaSession(m);
    await s.autoPick();
    expect(await s.switchTo('vlc')).toBe(true); // by LABEL
    expect(s.activeName).toBe(VLC);
    expect(s.activeLabel).toBe('vlc');
    await s.send('playPause');
    await s.send('next');
    // Both delivered calls must carry the VLC bus name — i.e. they hit the
    // org.mpris.MediaPlayer2.Player interface OF VLC, not firefox.
    expect(m.commands.every((c) => c.busName === VLC)).toBe(true);
  });

  test('Can*-guard: CanGoNext=false post-switch blocks delivery', async () => {
    const m = createMockController([FIREFOX, VLC]);
    m.setCapabilities(VLC, { canGoNext: false });
    const s = new ActiveMediaSession(m);
    await s.switchTo(VLC);
    expect(s.capabilities.canGoNext).toBe(false);

    await s.send('next'); // must be swallowed BEFORE any bus call
    expect(m.commands.filter((c) => c.busName === VLC && c.cmd === 'next')).toEqual([]);

    m.setCapabilities(VLC, { canGoNext: true });
    // Caps are cached at switch time (spec: "re-read AFTER retarget") — a
    // fresh switchTo() is the documented way to refresh them.
    await s.switchTo('vlc');
    expect(s.capabilities.canGoNext).toBe(true);
    expect(await s.send('next')).toBe(true);
    expect(m.commands.at(-1)).toEqual({ busName: VLC, cmd: 'next' });
  });

  test('switchTo unknown target → false, active player unchanged', async () => {
    const s = new ActiveMediaSession(createMockController([FIREFOX]));
    await s.autoPick();
    expect(await s.switchTo('nope')).toBe(false);
    expect(await s.switchTo('org.mpris.MediaPlayer2.nope')).toBe(false);
    expect(s.activeName).toBe(FIREFOX);
  });

  test('explicit choice is sticky across rediscovery; falls back if it vanishes', async () => {
    const m = createMockController([FIREFOX, VLC]);
    const s = new ActiveMediaSession(m);
    await s.switchTo('vlc');
    m.players = [FIREFOX, VLC];
    await s.autoPick(); // rediscover — vlc still there → stays
    expect(s.activeName).toBe(VLC);
    m.players = [FIREFOX]; // vlc gone
    await s.autoPick();
    expect(s.activeName).toBe(FIREFOX);
    expect(await s.snapshotActive()).not.toBeNull();
  });

  test('multiPlayerHint: only when >1 visible; single-player unchanged', () => {
    const two = [
      { name: FIREFOX, label: 'firefox' },
      { name: VLC, label: 'vlc' },
    ];
    expect(multiPlayerHint(two, 'vlc')).toBe('⇄ vlc (tab switches)');
    expect(multiPlayerHint(two, null)).toBe('⇄ ? (tab switches)');
    // ≤1 players → null → NowPlaying renders EXACTLY the pre-T8.2 line.
    expect(multiPlayerHint(two.slice(0, 1), 'firefox')).toBeNull();
    expect(multiPlayerHint([], null)).toBeNull();
  });

  test('send with no active player resolves false without bus calls', async () => {
    const m = createMockController([]);
    const s = new ActiveMediaSession(m);
    expect(await s.send('playPause')).toBe(false);
    expect(m.commands).toEqual([]);
    expect(await s.snapshotActive()).toBeNull();
  });
});

describe('ActiveMediaSession M11/A robustness (smart pick · vanish rescan · ghosts)', () => {
  const ZENA = 'org.mpris.MediaPlayer2.zena'; // the leftover fake from the field report
  const ZENB = 'org.mpris.MediaPlayer2.zenb';

  test('THE FIELD BUG: Playing ghost loses to titled player at boot', async () => {
    const m = createMockController([ZENA, FIREFOX]);
    m.setSnapshot(ZENA, { status: 'Playing' }); // empty Metadata — widget used to latch THIS
    m.setSnapshot(FIREFOX, { status: 'Paused', title: 'Bohemian Rhapsody', artist: 'Queen' });
    const s = new ActiveMediaSession(m);
    expect(await s.autoPick()).toBe(FIREFOX);
    const snap = await s.snapshotActive();
    expect(snap?.title).toBe('Bohemian Rhapsody');
  });

  test('two ghosts → no latch at all; lone ghost IS latched (only-one rule)', async () => {
    const both = createMockController([ZENA, ZENB]);
    both.setSnapshot(ZENA, { status: 'Playing' });
    both.setSnapshot(ZENB, { status: 'Playing' });
    const sBoth = new ActiveMediaSession(both);
    expect(await sBoth.autoPick()).toBeNull();
    expect(sBoth.activeName).toBeNull();
    expect(await sBoth.snapshotActive()).toBeNull();

    const lone = createMockController([ZENA]);
    lone.setSnapshot(ZENA, { status: 'Playing' });
    const sLone = new ActiveMediaSession(lone);
    expect(await sLone.autoPick()).toBe(ZENA); // only-one exception
  });

  test('ranked discovery surface exposes status glyphs (UI-ready)', async () => {
    const m = createMockController([FIREFOX, VLC]);
    m.setSnapshot(FIREFOX, { status: 'Playing', title: 't1' });
    m.setSnapshot(VLC, { status: 'Paused', title: 't2' });
    const s = new ActiveMediaSession(m);
    await s.autoPick();
    expect(playersLine(s.ranking)).toBe('▶ firefox · ⏸ vlc');
  });

  test('ghost demotion: boot-latched ghost yields to a later titled peer (~2s)', async () => {
    const m = createMockController([ZENA]);
    m.setSnapshot(ZENA, { status: 'Playing' }); // latched as only player
    const s = new ActiveMediaSession(m);
    await s.autoPick();
    expect(s.activeName).toBe(ZENA);

    // Real player shows up afterwards. Surveillance is throttled to ~2s:
    // an immediate poll must NOT flip yet...
    m.players = [ZENA, FIREFOX];
    m.setSnapshot(FIREFOX, { status: 'Paused', title: 'real track' });
    expect(await s.snapshotActive()).not.toBeNull();
    expect(s.activeName).toBe(ZENA);
    // ...after the throttle window it re-ranks and takes over.
    await new Promise((r) => setTimeout(r, 2100));
    const snap = await s.snapshotActive();
    expect(s.activeName).toBe(FIREFOX);
    expect(snap?.title).toBe('real track');
  }, 8000);

  test('explicit switchTo stays sticky even when a titled peer appears', async () => {
    const m = createMockController([ZENA]);
    m.setSnapshot(ZENA, { status: 'Playing' });
    const s = new ActiveMediaSession(m);
    await s.switchTo(ZENA); // user's explicit choice
    m.players = [ZENA, FIREFOX];
    m.setSnapshot(FIREFOX, { status: 'Playing', title: 'other' });
    await s.autoPick(); // explicit wins while its player lives
    expect(s.activeName).toBe(ZENA);
  });

  test('vanish → immediate rescan re-picks a surviving player in one tick', async () => {
    const m = createMockController([FIREFOX, VLC]);
    m.setSnapshot(FIREFOX, { status: 'Playing', title: 't1' });
    m.setSnapshot(VLC, { status: 'Paused', title: 't2' });
    const s = new ActiveMediaSession(m);
    await s.autoPick(); // firefox
    m.removePlayer(FIREFOX); // dies like firefox.instance_* when tabs close
    const snap = await s.snapshotActive();
    expect(s.activeName).toBe(VLC);
    expect(snap?.title).toBe('t2');
    expect(s.isRescanning).toBe(false);
  });

  test('total vanish → rescanning state persists; recovery clears it', async () => {
    const m = createMockController([FIREFOX]);
    m.setSnapshot(FIREFOX, { status: 'Playing', title: 't1' });
    const s = new ActiveMediaSession(m);
    await s.autoPick();

    m.removePlayer(FIREFOX); // bus goes quiet
    expect(await s.snapshotActive()).toBeNull();
    expect(s.isRescanning).toBe(true); // UI may show "rescanning…", not dead air

    // Player rejoins (firefox exposes MPRIS only while media tabs are active).
    m.players = [FIREFOX];
    m.setSnapshot(FIREFOX, { status: 'Playing', title: 'back again' });
    const snap = await s.snapshotActive(); // idle path rescans EVERY tick
    expect(snap?.title).toBe('back again');
    expect(s.isRescanning).toBe(false);
  });

  test('unknown-track tolerance flows through session snapshots', async () => {
    const m = createMockController([ZENA]);
    m.setSnapshot(ZENA, { status: 'Playing' }); // playing but metadata-less
    const s = new ActiveMediaSession(m);
    await s.autoPick();
    const snap = await s.snapshotActive();
    expect(snap?.title).toBe('unknown track'); // blank marquee fixed
  });

  test('anti-ghost default: all-untitled pair never auto-latches transport', async () => {
    const m = createMockController([FIREFOX, ZENA]);
    const s = new ActiveMediaSession(m); // both snapshots blank by mock default
    expect(await s.autoPick()).toBeNull();
    expect(await s.send('playPause')).toBe(false);
    expect(m.commands).toEqual([]);
  });
});
