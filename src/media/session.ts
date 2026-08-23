// Active-player session (T8.2): wraps ANY MediaController and adds multi-player
// discovery + explicit switching on top of the auto-pick-first default.
// The UI never talks to this directly today — app.tsx keeps using the raw
// controller until T8.3 wires the 'tab' keybind; integration snippet lives in
// the work-log report so the sequential window can adopt it verbatim.
import type {
  MediaController,
  PlayerSnapshot,
  TransportCaps,
  TransportCmd,
} from './controller.ts';
import { DEFAULT_CAPS } from './controller.ts';
import { identityFromBusName } from './mpris.ts';
import {
  rankPlayers,
  smartPick,
  withTrackFallback,
  type RankedPlayer,
} from './pick.ts';

/** One switchable player: full bus name + friendly label ("firefox"). */
export interface PlayerChoice {
  name: string;
  label: string;
}

export class ActiveMediaSession {
  private inner: MediaController;
  private discovered: PlayerChoice[] = [];
  private active: string | null = null;
  private activeCaps: TransportCaps = { ...DEFAULT_CAPS };
  // M11/A robustness state:
  private rankedList: RankedPlayer[] = [];
  private rescanning = false;
  /** True only when the USER picked the target (switchTo); auto-latches may
   * be demoted later by smartPick when a titled player shows up. */
  private activeExplicit = false;
  /** Timestamp of the last full ranked scan — throttles ghost surveillance. */
  private lastScan = 0;

  constructor(inner: MediaController) {
    this.inner = inner;
  }

  /** Last discovered players (refresh via discover()/autoPick()). */
  get players(): readonly PlayerChoice[] {
    return this.discovered;
  }

  /** Full bus name of the retargeted player, or null when none picked yet. */
  get activeName(): string | null {
    return this.active;
  }

  /** Friendly label of the active player ('firefox'), or null. */
  get activeLabel(): string | null {
    return this.discovered.find((p) => p.name === this.active)?.label ?? null;
  }

  /** Can* flags of the ACTIVE player as of the last switch/autoPick. */
  get capabilities(): TransportCaps {
    return { ...this.activeCaps };
  }

  /** M11/A: discovery surface for the UI — players ranked Playing-first,
   * then titled, then by name (refresh via discover()/autoPick()). */
  get ranking(): readonly RankedPlayer[] {
    return this.rankedList;
  }

  /** M11/A: true while hunting for a replacement player (active vanished or
   * none usable yet). UI may show a brief "rescanning…" state instead of
   * permanent emptiness; clears as soon as a player is re-picked. */
  get isRescanning(): boolean {
    return this.rescanning;
  }

  /** Refresh discovery from the bus. Always replaces the cached list AND the
   * M11/A ranked view (status/title probes run in parallel per player). */
  async discover(): Promise<PlayerChoice[]> {
    const names = await this.inner.listPlayers();
    this.discovered = names.map((name) => ({ name, label: identityFromBusName(name) }));
    this.rankedList = await this.probeRanked();
    this.lastScan = Date.now();
    return [...this.discovered];
  }

  /** Snapshot every discovered player once to learn status + title presence.
   * A player that vanished between ListNames and its Get is dropped from
   * candidates entirely — the next poll's vanish-rescan reconciles it. */
  private async probeRanked(): Promise<RankedPlayer[]> {
    const probes = await Promise.all(
      this.discovered.map(async (p): Promise<RankedPlayer | null> => {
        try {
          const s = await this.inner.snapshot(p.name);
          if (!s) return null;
          return { name: p.name, label: p.label, status: s.status, hasTitle: s.title.length > 0 };
        } catch {
          return null;
        }
      }),
    );
    return rankPlayers(probes.filter((r): r is RankedPlayer => r !== null));
  }

  /** Default behavior when the user made NO explicit choice: smart-pick by
   * ranking (Playing → titled → name), never latching a metadata-less ghost
   * unless it is the only player. Sticky rules:
   *  - an EXPLICIT switchTo() target survives rediscovery while it lives;
   *  - an AUTO-latched ghost is demoted as soon as a titled peer appears. */
  async autoPick(): Promise<string | null> {
    await this.discover();
    const current = this.active;
    if (current && this.rankedList.some((p) => p.name === current)) {
      const cur = this.rankedList.find((p) => p.name === current)!;
      const better = smartPick(this.rankedList);
      if (!this.activeExplicit && !cur.hasTitle && better && better !== current) {
        await this.retarget(better);
        return this.activeName;
      }
      return current;
    }
    this.active = null;
    this.activeCaps = { ...DEFAULT_CAPS };
    const best = smartPick(this.rankedList);
    if (!best) return null;
    await this.retarget(best);
    return this.activeName;
  }

  /** Atomic retarget by bus name OR friendly label: Can* props of the new
   * target are read BEFORE the active pointer moves, so transport calls can
   * never straddle two players mid-switch. Unknown target → false, no change.
   * Marks the choice EXPLICIT: sticky across rediscovery (M11/A). */
  async switchTo(target: string): Promise<boolean> {
    const ok = await this.retarget(target);
    if (ok) this.activeExplicit = true;
    return ok;
  }

  /** Same retarget WITHOUT the explicit marker — used by auto-pick paths so
   * smartPick may later demote a ghost latch. */
  private async retarget(target: string): Promise<boolean> {
    await this.discover();
    const found =
      this.discovered.find((p) => p.name === target) ??
      this.discovered.find((p) => p.label === target);
    if (!found) return false;
    // Optional chaining keeps controllers without a capabilities probe working
    // (they simply keep permissive defaults).
    const caps = (await this.inner.capabilities?.(found.name)) ?? DEFAULT_CAPS;
    this.active = found.name;
    this.activeCaps = caps;
    return true;
  }

  /** M11/A: track/status snapshot of the ACTIVE player, hardened:
   *  - vanish-resilience: if the active player disappears from the bus, a
   *    ranked re-pick runs IMMEDIATELY (inside this poll tick — well within
   *    the ~2s budget), so the widget re-latches instead of going empty;
   *  - empty-metadata tolerance: a PLAYING player without a usable title
   *    renders as "unknown track" instead of a blank line;
   *  - isRescanning flips true while no usable player exists, so the UI can
   *    show "rescanning…" rather than permanent emptiness. */
  async snapshotActive(): Promise<PlayerSnapshot | null> {
    if (this.active) {
      const live = await this.inner.snapshot(this.active);
      if (live) {
        this.rescanning = false;
        // Ghost surveillance: an auto-latched UNTITLED player is re-ranked
        // every ~2s so a titled player appearing later takes over. Explicit
        // user choices are never second-guessed; titled latches need no
        // watching (the vanish path below covers their death).
        if (!this.activeExplicit && live.title === '' && Date.now() - this.lastScan >= RESCAN_MS) {
          const was = this.active;
          await this.autoPick(); // may retarget to a titled peer
          if (this.active !== was && this.active) {
            const fresh = await this.inner.snapshot(this.active);
            return fresh ? withTrackFallback(fresh) : null;
          }
        }
        return withTrackFallback(live);
      }
      // Active vanished mid-session → drop it and rescan right now.
      this.active = null;
      this.activeCaps = { ...DEFAULT_CAPS };
      this.rescanning = true;
    }
    await this.autoPick(); // ranked re-pick; explicit locks respected
    if (!this.active) {
      this.rescanning = true; // bus has nothing usable yet — keep hunting next tick
      return null;
    }
    this.rescanning = false;
    const snap = await this.inner.snapshot(this.active);
    return snap ? withTrackFallback(snap) : null;
  }

  /** Guarded transport: delivers ONLY what the active player's Can* allows.
   * Resolves false WITHOUT any bus call when blocked — the caller decides
   * whether to surface that to the user. */
  async send(cmd: TransportCmd): Promise<boolean> {
    if (!this.active) return false;
    const allowed =
      cmd === 'playPause'
        ? this.activeCaps.canPlay || this.activeCaps.canPause
        : cmd === 'next'
          ? this.activeCaps.canGoNext
          : this.activeCaps.canGoPrev;
    if (!allowed) return false;
    await this.inner.send(this.active, cmd);
    return true;
  }
}

/** Pure hint-line decision for NowPlaying (T8.2): only meaningful when MORE
 * than one player is visible; single/zero players render exactly as before. */
export function multiPlayerHint(
  players: readonly PlayerChoice[],
  activeLabel: string | null,
): string | null {
  if (players.length <= 1) return null;
  return `⇄ ${activeLabel ?? '?'} (tab switches)`;
}

export function createMediaSession(inner: MediaController): ActiveMediaSession {
  return new ActiveMediaSession(inner);
}

/** Surveillance cadence for a live-but-suspicious (untitled) latch: re-rank
 * at most every ~2s so a titled player appearing later takes over quickly
 * without hammering the bus. */
const RESCAN_MS = 2000;
