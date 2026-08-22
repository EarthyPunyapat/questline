// Live E2E against the machine's real MPRIS player (firefox).
// Polite: toggles play/pause twice, restoring initial state. No track skipping.
import { SubprocessController } from '../src/media/subprocess-controller.ts';

const ctrl = new SubprocessController();
const players = await ctrl.listPlayers();
console.log('players:', players);
if (players.length === 0) {
  console.error('LIVE_FAIL: no MPRIS players');
  process.exit(1);
}
const bus = players[0]!;
const before = await ctrl.snapshot(bus);
console.log('before:', JSON.stringify(before));
if (!before) {
  console.error('LIVE_FAIL: null snapshot');
  process.exit(1);
}

await ctrl.send(bus, 'playPause');
await Bun.sleep(600);
const mid = await ctrl.snapshot(bus);
console.log('toggled:', JSON.stringify(mid));

await ctrl.send(bus, 'playPause');
await Bun.sleep(600);
const after = await ctrl.snapshot(bus);
console.log('restored:', JSON.stringify(after));

const flipped = mid && before && mid.status !== before.status;
const restoredSame = after && before && after.status === before.status;
const hasTitle = Boolean(before?.title);
console.log(`LIVE_${flipped && restoredSame && hasTitle ? 'PASS' : 'FAIL'} flip=${flipped} restore=${restoredSame} title=${hasTitle}`);
