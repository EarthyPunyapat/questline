// M13/T13.A: pure synthesis coverage — header bytes, sample math, motifs.
import { describe, expect, test } from 'bun:test';
import {
  SAMPLE_RATE,
  buildAchievement,
  buildEventSound,
  buildLevelUp,
  buildQuestDone,
  concat,
  detune,
  note,
  overlay,
  silence,
  toWavBuffer,
} from './tone.ts';

const secs = (clip: readonly number[]): number => clip.length / SAMPLE_RATE;

const tag = (wav: Uint8Array, offset: number, len: number): string =>
  String.fromCharCode(...wav.subarray(offset, offset + len));

describe('tone primitives', () => {
  test('note/silence produce exact sample counts', () => {
    expect(note(440, 100)).toHaveLength(SAMPLE_RATE / 10);
    expect(silence(50)).toHaveLength(2205);
    expect(concat(note(440, 50), silence(50))).toHaveLength(4410);
  });

  test('samples are deterministic and stay inside int16', () => {
    const a = note(880, 30);
    const b = note(880, 30);
    expect(a).toEqual(b);
    for (const s of a) expect(Math.abs(s)).toBeLessThanOrEqual(32767);
  });

  test('overlay sums with clamp; detune keeps single-note length', () => {
    const loud = [32000, 32000];
    expect(overlay(loud, loud)[0]).toBe(32767);
    expect(overlay(loud, [-40000, 1])).toEqual([-8000, 32001]);
    expect(detune(440, 10, 20)).toHaveLength(note(440, 20).length);
  });
});

describe('toWavBuffer', () => {
  test('writes canonical RIFF/WAVE headers sized to the clip', () => {
    const clip = note(440, 10); // 441 samples
    const wav = toWavBuffer(clip);
    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(tag(wav, 0, 4)).toBe('RIFF');
    expect(tag(wav, 8, 4)).toBe('WAVE');
    expect(dv.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(dv.getUint16(20, true)).toBe(1); // PCM
    expect(dv.getUint16(22, true)).toBe(1); // mono
    expect(dv.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(dv.getUint32(28, true)).toBe(SAMPLE_RATE * 2); // byte rate
    expect(dv.getUint16(32, true)).toBe(2); // block align
    expect(dv.getUint16(34, true)).toBe(16); // bits per sample
    expect(tag(wav, 36, 4)).toBe('data');
    expect(dv.getUint32(40, true)).toBe(441 * 2); // data == samples*2
    expect(dv.getUint32(4, true)).toBe(36 + 441 * 2); // riff size
    expect(wav.byteLength).toBe(44 + 441 * 2);
    expect(dv.getInt16(44, true)).toBe(clip[0]!); // first frame roundtrips
  });

  test('encoding is byte-for-byte deterministic', () => {
    const w1 = toWavBuffer(buildLevelUp());
    const w2 = toWavBuffer(buildLevelUp());
    expect(Buffer.from(w1).equals(Buffer.from(w2))).toBe(true);
  });
});

describe('event motifs', () => {
  test('all three motifs are distinct and under 0.8s', () => {
    const motifs = [buildLevelUp(), buildAchievement(), buildQuestDone()];
    for (const m of motifs) expect(secs(m)).toBeLessThan(0.8);
    expect(new Set(motifs.map((m) => m.join(','))).size).toBe(3);
  });

  test('buildEventSound maps every kind to a RIFF wav', () => {
    for (const kind of ['levelUp', 'achievement', 'questDone'] as const) {
      const wav = buildEventSound(kind);
      expect(tag(wav, 0, 4)).toBe('RIFF');
      expect(tag(wav, 8, 4)).toBe('WAVE');
      expect(wav.byteLength).toBeGreaterThan(1000);
    }
  });
});
