// Native MPRIS controller via @homebridge/dbus-native (lean contract).
import dbusNative from '@homebridge/dbus-native';
import type { MediaController, PlayerSnapshot, TransportCmd } from './controller.ts';
import { identityFromBusName, mapMetadata, parseMprisPlayers, parseStatus } from './mpris.ts';

type AnyBus = { invoke: (msg: Record<string, unknown>) => Promise<unknown> };
interface NativeModule {
  sessionBus: (opts?: Record<string, unknown>) => AnyBus;
}

const PATH = '/org/mpris/MediaPlayer2';
const IFACE = 'org.mpris.MediaPlayer2.Player';
const CMD: Record<TransportCmd, string> = {
  playPause: 'PlayPause',
  next: 'Next',
  prev: 'Previous',
};

export class NativeController implements MediaController {
  private bus: AnyBus;
  constructor(bus: AnyBus) {
    this.bus = bus;
  }

  static async connect(): Promise<NativeController> {
    const mod = dbusNative as unknown as NativeModule;
    if (!mod || typeof mod.sessionBus !== 'function') throw new Error('dbus-native unavailable');
    const bus = mod.sessionBus();
    // Probe so connection failures surface here.
    await bus.invoke({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'ListNames',
    });
    return new NativeController(bus);
  }

  async listPlayers(): Promise<string[]> {
    try {
      const reply = await this.bus.invoke({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'ListNames',
      });
      return parseMprisPlayers(reply);
    } catch {
      return [];
    }
  }

  async snapshot(busName: string): Promise<PlayerSnapshot | null> {
    try {
      const get = (prop: string): Promise<unknown> =>
        this.bus.invoke({
          destination: busName,
          path: PATH,
          interface: 'org.freedesktop.DBus.Properties',
          member: 'Get',
          signature: 'ss',
          body: [IFACE, prop],
        });
      const status = parseStatus(await get('PlaybackStatus'));
      const track = mapMetadata(await get('Metadata'));
      return {
        playerName: identityFromBusName(busName),
        title: track.title ?? '',
        artist: track.artist ?? '',
        status,
      };
    } catch {
      return null; // player vanished mid-call
    }
  }

  async send(busName: string, cmd: TransportCmd): Promise<void> {
    try {
      await this.bus.invoke({
        destination: busName,
        path: PATH,
        interface: IFACE,
        member: CMD[cmd],
      });
    } catch {
      /* Can*-guarded no-ops land here */
    }
  }
}

export function createNativeController(): Promise<NativeController> {
  return NativeController.connect();
}
