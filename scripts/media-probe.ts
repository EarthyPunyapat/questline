// READ-ONLY live probe: enumerate players + read snapshot. NEVER sends transport cmds.
import { createSubprocessController } from '../src/media/subprocess-controller.ts';
import { createNativeController } from '../src/media/mpris-client.ts';

async function main(): Promise<void> {
  let players: string[] = [];
  try {
    const nat = await createNativeController();
    players = await nat.listPlayers();
    console.log('NATIVE listPlayers:', JSON.stringify(players));
    if (players[0]) {
      const snap = await nat.snapshot(players[0]);
      console.log('NATIVE snapshot:', JSON.stringify(snap));
    }
  } catch (e) {
    console.log('NATIVE unavailable:', (e as Error).message);
  }
  const sub = createSubprocessController();
  const subPlayers = await sub.listPlayers();
  console.log('SUBPROCESS listPlayers:', JSON.stringify(subPlayers));
  if (subPlayers[0]) {
    const snap = await sub.snapshot(subPlayers[0]);
    console.log('SUBPROCESS snapshot:', JSON.stringify(snap));
  }
}
void main();
