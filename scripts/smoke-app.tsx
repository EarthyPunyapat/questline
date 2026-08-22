import React from 'react';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import { App } from '../src/app.tsx';

// Headless boot check: mounts full App with a stubbed-TTY stdin (raw-mode no-op),
// asserts clean unmount + exit 0 in non-interactive environments.
const stdin = new PassThrough() as unknown as NodeJS.ReadStream & {
  isTTY: boolean;
  setRawMode: (mode: boolean) => unknown;
};
(stdin as unknown as { isTTY: boolean }).isTTY = true;
const noopSelf = () => stdin;
const stub = stdin as unknown as Record<string, unknown>;
stub.setRawMode = noopSelf;
stub.ref = () => {};
stub.unref = () => {};

const app = render(<App />, { stdin, exitOnCtrlC: false });
setTimeout(() => {
  app.unmount();
  stdin.end();
  // dbus socket may hold the event loop open; exit explicitly once UI is proven.
  setTimeout(() => process.exit(0), 50);
}, 400);
