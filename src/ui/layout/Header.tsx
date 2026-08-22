import React from 'react';
import { Box, Text } from 'ink';
import type { Profile } from '../../types/state.ts';
import { levelCurve } from '../../xp/levels.ts';
import { XpBar } from './XpBar.tsx';

export function Header({ profile }: { profile: Profile }): React.ReactElement {
  const lv = levelCurve(profile.totalXp);
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ⚔ QUESTLINE
        </Text>
        <Text>
          <Text bold color="magenta">
            Lv {lv.level}
          </Text>
          <Text dimColor> · </Text>
          <Text color="yellow">🔥 {profile.streakDays}d streak</Text>
          <Text dimColor> · </Text>
          <Text dimColor>{profile.totalXp} total XP</Text>
        </Text>
      </Box>
      <XpBar intoLevel={lv.intoLevel} xpForNext={lv.xpForNext} />
    </Box>
  );
}
