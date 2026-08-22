// Subprocess fallback controller — busctl (present on GNOME). No native deps.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { MediaController, PlayerSnapshot, TransportCmd } from './controller.ts';
import { identityFromBusName, mapMetadata, parseMprisPlayers, parseStatus } from './mpris.ts';

const run = promisify(execFile);

const PATH = '/org/mpris/MediaPlayer2';
const IFACE = 'org.mpris.MediaPlayer2.Player';
const CMD: Record<TransportCmd, string> = {
  playPause: 'PlayPause',
  next: 'Next',
  prev: 'Previous',
};

async function busctl(args: readonly string[]): Promise<string> {
  const { stdout } = await run('busctl', ['--user', ...args], { timeout: 4000 });
  return stdout;
}

/** `busctl call … Properties.Get` output for Metadata → dict-ish record.
 * Real shape (captured live): `"key" TYPE VALUE…` segments; arrays print as
 * `as <count> "v1" "v2"`, ints print bare (`x 1163000000`). */
export function parseBusctlVariant(raw: string): Record<string, unknown> {
  const dict: Record<string, unknown> = {};
  // Segment per key: consume everything up to the next mpris/xesam key or EOL.
  const seg =
    /"(xesam:[\w-]+|mpris:[\w-]+)"\s+(\w+)\s*([\s\S]*?)(?="\s*(?:xesam|mpris):[\w-]+"|$)/g;
  for (const m of raw.matchAll(seg)) {
    const key = m[1] as string;
    const rest = m[3] ?? '';
    const vals = [...rest.matchAll(/"([^"]*)"/g)].map((x) => x[1] ?? '');
    if (key === 'mpris:length') {
      // Bare int form: `"mpris:length" x 1163000000` (no quotes)
      const n = Number(vals[0] ?? rest.match(/(-?\d+(?:\.\d+)?)/)?.[1]);
      if (Number.isFinite(n)) dict[key] = n;
      continue;
    }
    if (!vals.length) continue;
    if (key === 'xesam:title' || key === 'mpris:artUrl') dict[key] = vals[0];
    else if (key === 'xesam:artist') dict[key] = vals;
    else if (key === 'mpris:length') {
      const n = Number(vals[0] ?? rest.match(/(-?\d+(?:\.\d+)?)/)?.[1]);
      if (Number.isFinite(n)) dict[key] = n;
    }
  }
  return dict;
}

export class SubprocessController implements MediaController {
  async listPlayers(): Promise<string[]> {
    try {
      const out = await busctl(['list', '--no-legend', '--no-pager']);
      const names = out
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0] ?? '')
        .filter(Boolean);
      return parseMprisPlayers([names]);
    } catch {
      return [];
    }
  }

  async snapshot(busName: string): Promise<PlayerSnapshot | null> {
    try {
      const statusOut = await busctl(['get-property', busName, PATH, IFACE, 'PlaybackStatus']);
      // busctl prints: s "Playing"
      const statusStr = /"([^"]+)"/.exec(statusOut)?.[1] ?? 'Stopped';
      const metaOut = await busctl([
        'call', busName, PATH,
        'org.freedesktop.DBus.Properties', 'Get',
        'ss', IFACE, 'Metadata',
      ]);
      const track = mapMetadata(parseBusctlVariant(metaOut));
      return {
        playerName: identityFromBusName(busName),
        title: track.title ?? '',
        artist: track.artist ?? '',
        status: parseStatus(statusStr),
      };
    } catch {
      return null; // player gone or property missing
    }
  }

  async send(busName: string, cmd: TransportCmd): Promise<void> {
    try {
      await busctl(['call', busName, PATH, IFACE, CMD[cmd]]);
    } catch {
      /* Can*-guarded no-ops */
    }
  }
}

export function createSubprocessController(): SubprocessController {
  return new SubprocessController();
}
