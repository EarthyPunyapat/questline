import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

const ROWS: Array<[string, string]> = [
  ['j / ↓', 'select next task'],
  ['k / ↑', 'select previous task'],
  ['enter', 'toggle task done (awards XP + streak)'],
  ['a', 'add task (modal)'],
  ['d', 'delete selected task'],
  ['v', 'toggle stats view'],
  ['t', 'cycle color theme'],
  ['space', 'play/pause music'],
  ['n / b', 'next / previous track'],
  ['q', 'quit'],
];

interface HelpOverlayProps {
  onDone: () => void;
}

/** Full keymap overlay; toggled with `?`, closed with `?` or esc. */
export function HelpOverlay({ onDone }: HelpOverlayProps): React.ReactElement {
  useInput(
    (input, key) => {
      if (input === '?' || key.escape) onDone();
    },
    { isActive: true },
  );
  useEffect(() => () => undefined, []);

  return (
    <Box
      borderStyle="double"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      width={52}
    >
      <Text bold color="cyan">
        QUESTLINE — KEYMAP
      </Text>
      {ROWS.map(([keybind, desc]) => (
        <Box key={keybind} gap={1}>
          <Box width={8}>
            <Text bold color="green">
              {keybind}
            </Text>
          </Box>
          <Text>{desc}</Text>
        </Box>
      ))}
      <Text dimColor>press ? or esc to close</Text>
    </Box>
  );
}
