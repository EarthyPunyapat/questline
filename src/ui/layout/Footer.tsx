import React from 'react';
import { Box, Text } from 'ink';

export function Footer(): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text dimColor>
        j/k move · <Text color="green">enter</Text> toggle done · <Text color="green">a</Text> add ·{' '}
        <Text color="red">d</Text> delete · <Text color="yellow">x</Text> dismiss daily ·{' '}
        <Text color="yellow">space</Text> play/pause ·{' '}
        <Text color="yellow">n/b</Text> next/prev track · <Text color="cyan">?</Text> help ·{' '}
        <Text color="magenta">q</Text> quit
      </Text>
    </Box>
  );
}
