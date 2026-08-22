// MediaController contract — the ONLY surface the UI knows about.
// Two impls: mpris.ts (native @homebridge/dbus-native) and subprocess-controller.ts
// (busctl fallback). resolveController() picks the first that works at runtime.
export const MPRIS_PREFIX = 'org.mpris.MediaPlayer2';
export const MPRIS_PATH = '/org/mpris/MediaPlayer2';

export interface PlayerRef {
  busName: string;
  identity: string;
}

export interface PlayerSnapshot {
  playerName: string;
  title: string;
  artist: string;
  status: 'Playing' | 'Paused' | 'Stopped';
}

export type TransportCmd = 'playPause' | 'next' | 'prev';

/** MPRIS Can* properties for one player (T8.2). Unreadable props are treated
 * as permissive (true): matches the historical blind-send behavior. */
export interface TransportCaps {
  canPlay: boolean;
  canPause: boolean;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export const DEFAULT_CAPS: TransportCaps = {
  canPlay: true,
  canPause: true,
  canGoNext: true,
  canGoPrev: true,
};

export interface MediaController {
  /** Bus names of live MPRIS players (may be empty). */
  listPlayers(): Promise<string[]>;
  /** Current track/status for a player, or null if it vanished. */
  snapshot(busName: string): Promise<PlayerSnapshot | null>;
  /** Fire a transport command; resolves when the call was delivered. */
  send(busName: string, cmd: TransportCmd): Promise<void>;
  /** Optional Can* probe per player (T8.2). null/absent = use DEFAULT_CAPS. */
  capabilities?(busName: string): Promise<TransportCaps | null>;
}

/** Runtime selection: probe BOTH backends and prefer the one that can
 * actually SEE players (native dbus-native reply shapes vary across runtimes).
 * Falls back to subprocess when native throws or finds nothing. */
export async function resolveController(): Promise<MediaController | null> {
  let native: MediaController | null = null;
  try {
    const { createNativeController } = await import('./mpris-client.ts');
    native = await createNativeController();
    const seen = await native.listPlayers();
    if (seen.length > 0) return native;
  } catch {
    native = null; // native unavailable → subprocess
  }
  try {
    const { createSubprocessController } = await import('./subprocess-controller.ts');
    const sub = createSubprocessController();
    const seen = await sub.listPlayers();
    if (seen.length > 0) return sub;
  } catch {
    /* no mechanism works */
  }
  // Nothing visible right now — still return SOMETHING so UI shows live empty state.
  return native ?? null;
}
