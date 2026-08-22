import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface LevelUpToastProps {
  message: string;
  durationMs?: number;
  onDone: () => void;
}

/** Transient centered toast; auto-dismisses after durationMs. */
export function LevelUpToast({ message, durationMs = 2000, onDone }: LevelUpToastProps): React.ReactElement {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone();
    }, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!visible) return <></>;
  return (
    <Box justifyContent="center" marginTop={1}>
      <Box borderStyle="double" borderColor="magenta" paddingX={2}>
        <Text bold color="magenta">
          ✨ {message}
        </Text>
      </Box>
    </Box>
  );
}
