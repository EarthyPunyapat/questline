import React from 'react';
import { Box, Text } from 'ink';
import { ACHIEVEMENTS } from '../../xp/achievements.ts';
import type { AchievementUnlock } from '../../types/state.ts';
import { theme } from '../theme.ts';

interface TrophyRowProps {
  achievements: AchievementUnlock[];
}

/**
 * Header-area trophy row: 🏆 per unlocked achievement (accent color; titles
 * shown inline as the tooltip approximation), locked remainder as a dim count.
 */
export function TrophyRow({ achievements }: TrophyRowProps): React.ReactElement {
  const unlockedIds = new Set(achievements.map((a) => a.id));
  const unlocked = ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id));
  const locked = ACHIEVEMENTS.length - unlocked.length;
  return (
    <Box>
      <Text dimColor>🏆 </Text>
      {unlocked.map((a) => (
        <Text key={a.id} color={theme.accent}>
          🏆{a.title}{' '}
        </Text>
      ))}
      <Text dimColor>{locked > 0 ? `${locked} locked` : 'all unlocked!'}</Text>
    </Box>
  );
}
