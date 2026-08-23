// Pure player-ranking + display helpers (M11/A music robustness).
// Data-in/data-out only — no D-Bus, no Ink — so every rule is unit-testable
// and shared by any backend via ActiveMediaSession.

import type { PlayerSnapshot } from './controller.ts';

/** One discovered player enriched with the signals smart picking needs. */
export interface RankedPlayer {
  /** Full bus name ('org.mpris.MediaPlayer2.firefox.instance_1_168'). */
  name: string;
  /** Friendly identity ('firefox'). */
  label: string;
  status: PlayerSnapshot['status'];
  /** Metadata carried a usable (non-empty) xesam:title. */
  hasTitle: boolean;
}

const STATUS_RANK: Record<PlayerSnapshot['status'], number> = {
  Playing: 0,
  Paused: 1,
  Stopped: 2,
};

/** Deterministic ranking (spec M11/A #1): Playing first, then players whose
 * metadata carries a title, then bus name. Copies the input, never mutates. */
export function rankPlayers(cands: readonly RankedPlayer[]): RankedPlayer[] {
  return [...cands].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      Number(b.hasTitle) - Number(a.hasTitle) ||
      a.name.localeCompare(b.name),
  );
}

/** Smart auto-pick (M11/A #1): the best-ranked TITLED candidate; a metadata-
 * less "ghost" is latched ONLY when it is the sole player on the bus. Ghosts
 * with empty Metadata used to win the old pick-first rule and dead-lock the
 * widget onto dead targets — spec forbids re-latching them while ANY titled
 * alternative exists, no matter its status. */
export function smartPick(ranked: readonly RankedPlayer[]): string | null {
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0]!.name;
  const titled = ranked.find((r) => r.hasTitle);
  return titled ? titled.name : null;
}

/** Status glyphs for discovery surfaces ('⇄ ▶firefox · ⏸vlc'). */
export const STATUS_GLYPH: Record<PlayerSnapshot['status'], string> = {
  Playing: '▶',
  Paused: '⏸',
  Stopped: '■',
};

/** One-line ranked roster for the UI layer. Null when fewer than two players
 * — mirrors multiPlayerHint's "only meaningful when >1" rule, so callers can
 * keep rendering the pre-M11 line unchanged for the common single-player case. */
export function playersLine(ranked: readonly RankedPlayer[]): string | null {
  if (ranked.length < 2) return null;
  return ranked.map((r) => `${STATUS_GLYPH[r.status]} ${r.label}`).join(' · ');
}

/** Empty-metadata tolerance (M11/A #4): a PLAYING player with no usable title
 * renders as "unknown track" instead of a blank marquee line. */
export function withTrackFallback(snap: PlayerSnapshot): PlayerSnapshot {
  if (snap.status === 'Playing' && snap.title.trim() === '') {
    return { ...snap, title: 'unknown track' };
  }
  return snap;
}
