// Pure MPRIS2 parsing/mapping helpers shared by BOTH backends
// (native dbus-native client + busctl subprocess fallback).
// No I/O here — everything is data-in/data-out and unit-testable.
import type { PlayerSnapshot } from './controller.ts';

export const MPRIS_PREFIX = 'org.mpris.MediaPlayer2';

/** Flatten ListNames replies (array or nested arrays), keep MPRIS names, dedupe. */
export function parseMprisPlayers(reply: unknown): string[] {
  const flat: string[] = Array.isArray(reply)
    ? reply.flat(Infinity).filter((n): n is string => typeof n === 'string')
    : [];
  return [...new Set(flat.filter((n) => n.startsWith(MPRIS_PREFIX)))];
}

/** 'org.mpris.MediaPlayer2.vlc.instance_3' -> 'vlc' */
export function identityFromBusName(busName: string): string {
  return (
    busName
      .replace(/^org\.mpris\.MediaPlayer2\./, '')
      .replace(/\.instance.*$/, '')
      .split('.')[0] ?? ''
  );
}

type Dict = Record<string, unknown>;

/** Native Metadata variant (dict, optionally wrapped in a{sv} envelope) -> display fields.
 * Accepts: {'xesam:title': 'X'} · {'xesam:title': {type:'s',value:'X'}}
 *          {type:'a{sv}', value:{...}} · garbage of any shape (never throws). */
export function mapMetadata(meta: unknown): { title?: string; artist?: string } {
  const d = unwrapVariant<Dict>(meta);
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return {};
  const rec = d as Record<string, unknown>;
  const out: { title?: string; artist?: string } = {};
  const title = unwrapVariant(rec["xesam:title"]);
  if (typeof title === 'string') out.title = title;
  const rawArtist = unwrapVariant(rec["xesam:artist"]);
  if (Array.isArray(rawArtist)) {
    const joined = rawArtist.filter((x): x is string => typeof x === 'string').join(', ');
    if (joined.length > 0) out.artist = joined;
  } else if (typeof rawArtist === 'string' && rawArtist.length > 0) {
    out.artist = rawArtist;
  }
  return out;
}

/** Peel dbus-native variant envelopes ({value}, {type, value:{...}}) down to a payload. */
function unwrapVariant<T = unknown>(v: unknown, depth = 0): T | unknown {
  if (depth > 5 || typeof v !== 'object' || v === null || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  if ('value' in o && Object.keys(o).every((k) => k === 'value' || k === 'type')) {
    return unwrapVariant(o.value, depth + 1);
  }
  return v;
}

/** Normalize a PlaybackStatus from any backend/nesting into the UI union. */
export function parseStatus(value: unknown): PlayerSnapshot['status'] {
  const v = unwrapVariant(value);
  if (v === 'Playing' || v === 'Paused') return v;
  if (typeof v === 'string') {
    const m = /"?(Playing|Paused)"?/.exec(v);
    if (m?.[1] === 'Playing' || m?.[1] === 'Paused') return m[1];
  }
  return 'Stopped';
}

/** Assemble a UI snapshot from parsed parts (shared by both backends). */
export function buildSnapshot(
  busName: string,
  status: unknown,
  meta: unknown,
  playerLabel?: string,
): PlayerSnapshot {
  const track = mapMetadata(meta);
  return {
    playerName: playerLabel?.trim() || identityFromBusName(busName),
    title: track.title ?? '',
    artist: track.artist ?? '',
    status: parseStatus(status),
  };
}
