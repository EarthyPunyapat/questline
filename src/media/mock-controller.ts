// In-memory MediaController for tests + offline UI development. Zero live bus calls.
import type { MediaController, PlayerSnapshot, TransportCmd } from './controller.ts';

export class MockMediaController implements MediaController {
  players: string[];
  private snapshots: Map<string, PlayerSnapshot> = new Map();
  private sent: Array<{ busName: string; cmd: TransportCmd }> = [];

  constructor(players: string[] = ['org.mpris.MediaPlayer2.firefox.instance_1_168']) {
    this.players = [...players];
    for (const name of this.players) {
      const identity = name.replace(/^org\.mpris\.MediaPlayer2\./, '').replace(/\.instance.*$/, '');
      this.snapshots.set(name, {
        playerName: identity,
        title: '',
        artist: '',
        status: 'Stopped',
      });
    }
  }

  listPlayers(): Promise<string[]> {
    return Promise.resolve([...this.players]);
  }

  snapshot(busName: string): Promise<PlayerSnapshot | null> {
    return Promise.resolve(this.snapshots.get(busName) ?? null);
  }

  async send(busName: string, cmd: TransportCmd): Promise<void> {
    this.sent.push({ busName, cmd });
    if (cmd !== 'playPause') return;
    const cur = this.snapshots.get(busName);
    if (cur) cur.status = cur.status === 'Playing' ? 'Paused' : 'Playing';
  }

  /** Test helper: assert on delivered transport commands. */
  get commands(): ReadonlyArray<{ busName: string; cmd: TransportCmd }> {
    return this.sent;
  }

  /** Test/dev helper: mutate state like a real player would. */
  setSnapshot(
    busName: string,
    patch: Partial<Pick<PlayerSnapshot, 'title' | 'artist' | 'status'>>,
  ): void {
    const prev =
      this.snapshots.get(busName) ??
      ({ playerName: 'mock', title: '', artist: '', status: 'Stopped' } as PlayerSnapshot);
    this.snapshots.set(busName, { ...prev, ...patch });
  }
}

export function createMockController(players?: string[]): MockMediaController {
  return new MockMediaController(players);
}
