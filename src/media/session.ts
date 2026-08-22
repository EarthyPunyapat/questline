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

  /** Refresh discovery from the bus. Always replaces the cached list. */
  async discover(): Promise<PlayerChoice[]> {
    const names = await this.inner.listPlayers();
    this.discovered = names.map((name) => ({ name, label: identityFromBusName(name) }));
    return [...this.discovered];
  }

  /** Default behavior when the user made NO explicit choice: pick first.
   * Sticky: an explicit switchTo() survives rediscovery while that player
   * still exists; falls back to the first visible player if it vanished. */
  async autoPick(): Promise<string | null> {
    await this.discover();
    if (this.active && this.discovered.some((p) => p.name === this.active)) {
      return this.active;
    }
    const first = this.discovered[0];
    if (!first) {
      this.active = null;
      this.activeCaps = { ...DEFAULT_CAPS };
      return null;
    }
    return (await this.switchTo(first.name)) ? first.name : null;
  }

  /** Atomic retarget by bus name OR friendly label: Can* props of the new
   * target are read BEFORE the active pointer moves, so transport calls can
   * never straddle two players mid-switch. Unknown target → false, no change. */
  async switchTo(target: string): Promise<boolean> {
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

  /** Track/status snapshot of the ACTIVE player (null when none/vanished). */
  async snapshotActive(): Promise<PlayerSnapshot | null> {
    return this.active ? this.inner.snapshot(this.active) : null;
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
