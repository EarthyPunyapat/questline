import { describe, test, expect } from 'bun:test';
import {
  parseMprisPlayers,
  parseStatus,
  mapMetadata,
  identityFromBusName,
  buildSnapshot,
} from './mpris.ts';
import { parseBusctlVariant } from './subprocess-controller.ts';
import { createMockController } from './mock-controller.ts';

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
