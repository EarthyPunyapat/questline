// M13/T13.A: pure WAV synthesis — zero dependencies, fully deterministic.
// Builds 16-bit PCM mono clips at 44.1kHz and encodes them as canonical
// RIFF/WAVE buffers. Motif builders (buildLevelUp / buildAchievement /
// buildQuestDone) produce distinct sub-second event signatures; playback
// lives in play.ts so this module stays pure data-in/data-out.

/** Fixed output rate — every duration math below derives from this. */
export const SAMPLE_RATE = 44100;

/** Integer PCM samples in [-32768, 32767]. */
export type Clip = number[];

/** Peak amplitude with headroom below the int16 ceiling so mixed voices
 * never hard-clip into distortion. */
const MAX_AMP = 26000;

export interface NoteOptions {
  /** Linear fade-in length in ms; kills the onset click. Default 4ms. */
  attackMs?: number;
  /** Amplitude fraction kept at note end (linear decay). Default 0.55. */
  sustain?: number;
}

/** Pure sine tone with a click-killing envelope. Sample count = ms·rate/1000. */
export function note(freqHz: number, ms: number, opts: NoteOptions = {}): Clip {
  const total = Math.max(1, Math.round((ms * SAMPLE_RATE) / 1000));
  const attack = Math.max(1, Math.round(((opts.attackMs ?? 4) * SAMPLE_RATE) / 1000));
  const sustain = opts.sustain ?? 0.55;
  const clip: Clip = new Array<number>(total);
  for (let i = 0; i < total; i++) {
    let env = 1;
    if (i < attack) env = i / attack;
    env *= 1 - ((1 - sustain) * i) / total;
    clip[i] = Math.round(MAX_AMP * env * Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE));
  }
  return clip;
}

/** Digital silence of exactly ms·rate/1000 samples. */
export function silence(ms: number): Clip {
  return new Array<number>(Math.max(0, Math.round((ms * SAMPLE_RATE) / 1000))).fill(0);
}

/** Join clips back-to-back into one continuous clip. */
export function concat(...clips: readonly Clip[]): Clip {
  return ([] as number[]).concat(...clips);
}

const clamp16 = (v: number): number => Math.max(-32768, Math.min(32767, v));

/** Sum clips sample-wise (length = longest input), clamped to int16. */
export function overlay(...clips: readonly Clip[]): Clip {
  const out = new Array<number>(Math.max(0, ...clips.map((c) => c.length))).fill(0);
  for (const c of clips) {
    for (let i = 0; i < c.length; i++) out[i] = clamp16(out[i]! + c[i]!);
  }
  return out;
}

/** One voice split into two slightly detuned copies — chorus shimmer. */
export function detune(freqHz: number, cents: number, ms: number, opts: NoteOptions = {}): Clip {
  const shifted = freqHz * Math.pow(2, cents / 1200);
  return overlay(note(freqHz, ms, opts), note(shifted, ms, opts));
}

/**
 * Encode a clip as a canonical RIFF/WAVE file: mono, 16-bit PCM, 44.1kHz.
 * Layout: 44-byte header ("RIFF"+size, "WAVE", 16-byte "fmt ", "data"+size)
 * followed by little-endian int16 frames.
 */
export function toWavBuffer(clip: readonly number[]): Uint8Array {
  const dataBytes = clip.length * 2;
  const buf = new Uint8Array(44 + dataBytes);
  const view = new DataView(buf.buffer);
  const tag = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  tag(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < clip.length; i++) view.setInt16(44 + i * 2, clamp16(Math.round(clip[i]!)), true);
  return buf;
}

// ---------------------------------------------------------------------------
// Event motifs — distinct identities, all comfortably under 0.8s.
// ---------------------------------------------------------------------------

const NOTE_MS = 140;
const GAP_MS = 18;

/** Rising arpeggio C5-E5-G5-C6 (~0.63s): "you leveled up". */
export function buildLevelUp(): Clip {
  return concat(
    note(523.25, NOTE_MS),
    silence(GAP_MS),
    note(659.25, NOTE_MS),
    silence(GAP_MS),
    note(783.99, NOTE_MS),
    silence(GAP_MS),
    note(1046.5, 190, { sustain: 0.75 }),
  );
}

/** Two-note bell chime, top note shimmered via detune (~0.37s): achievement. */
export function buildAchievement(): Clip {
  return concat(note(1318.51, 130), silence(20), detune(1760, 9, 220, { sustain: 0.8 }));
}

/** Struck G-major triad resolving an octave-ish up (~0.38s): quest done. */
export function buildQuestDone(): Clip {
  return concat(
    overlay(note(783.99, 200), note(987.77, 200), note(1174.66, 200)),
    silence(15),
    note(1567.98, 160),
  );
}

/** Kinds of events that carry a jingle (mirrors the app event names). */
export type SoundKind = 'levelUp' | 'achievement' | 'questDone';

/** Build the encoded WAV for an event kind — single entry point for play.ts. */
export function buildEventSound(kind: SoundKind): Uint8Array {
  switch (kind) {
    case 'levelUp':
      return toWavBuffer(buildLevelUp());
    case 'achievement':
      return toWavBuffer(buildAchievement());
    case 'questDone':
      return toWavBuffer(buildQuestDone());
  }
}
