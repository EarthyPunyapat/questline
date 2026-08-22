import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

export interface PlayerSnapshot {
  playerName: string;
  title: string;
  artist: string;
  status: 'Playing' | 'Paused' | 'Stopped';
}

interface NowPlayingProps {
  player?: PlayerSnapshot | null;
  marqueeWidth?: number;
}

const statusIcon: Record<PlayerSnapshot['status'], string> = {
  Playing: '▶',
  Paused: '⏸',
  Stopped: '■',
};

/** Marquee-scrolls long titles; graceful empty state when no MPRIS player. */
export function NowPlaying({ player, marqueeWidth = 30 }: NowPlayingProps): React.ReactElement {
  const [offset, setOffset] = useState(0);

  const rawTitle = player?.title ?? '';
  useEffect(() => {
    setOffset(0);
    if (!player || rawTitle.length <= marqueeWidth) return;
    const id = setInterval(() => {
      setOffset((o) => (o + 1) % (rawTitle.length + 2));
    }, 400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTitle, marqueeWidth]);

  const scrolled =
    player && rawTitle.length > marqueeWidth
      ? (rawTitle + ' ·· ').slice(offset, offset + marqueeWidth).padEnd(marqueeWidth)
      : rawTitle.padEnd(marqueeWidth);

  if (!player) {
    return (
      <Box
        borderStyle="round"
        borderColor="gray"
        flexDirection="column"
        paddingX={1}
        width={marqueeWidth + 8}
      >
        <Text bold dimColor>
          ♫ NOW PLAYING
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>No media player detected.</Text>
          <Text dimColor>Start playback in any MPRIS-capable app.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1} width={marqueeWidth + 8}>
      <Box justifyContent="space-between">
        <Text bold color="yellow">
          ♫ NOW PLAYING
        </Text>
        <Text color={player.status === 'Playing' ? 'green' : 'gray'}>
          {statusIcon[player.status]}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>{scrolled}</Text>
        <Text dimColor>{player.artist.slice(0, marqueeWidth)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{player.playerName}</Text>
      </Box>
    </Box>
  );
}
