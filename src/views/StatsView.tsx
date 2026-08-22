import React from 'react';
import { Box, Text } from 'ink';
import type { GameState } from '../types/state.ts';
import { weeklyXp } from './stats.ts';
import { theme } from '../ui/theme.ts';

/** Stats view: 7-day XP bar chart + quest completion summary. */
export function StatsView({ state }: { state: GameState }): React.ReactElement {
  const completions = state.tasks
    .filter((t) => t.status === 'done' && typeof t.completedAt === 'number')
    .map((t) => ({ completedAt: t.completedAt as number, xp: t.difficulty === 'easy' ? 10 : t.difficulty === 'medium' ? 25 : 50 }));
  const buckets = weeklyXp(completions);
  const max = Math.max(10, ...buckets.map((b) => b.xp));
  const questsDone = state.completedQuestIds.length;

  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <Text bold color={theme.headerFg}>
        📊 LAST 7 DAYS
      </Text>
      {buckets.map((b) => {
        const width = Math.round((b.xp / max) * 24);
        return (
          <Box key={b.day} gap={1}>
            <Text dimColor>{b.day.slice(5)}</Text>
            <Text color={theme.accent}>{'▇'.repeat(width) || '·'}</Text>
            <Text> {b.xp} XP</Text>
            <Text dimColor>({b.tasks})</Text>
          </Box>
        );
      })}
      <Box gap={2} marginTop={1}>
        <Text>
          🏆 Quests completed: <Text bold>{questsDone}</Text>
        </Text>
        <Text dimColor>|</Text>
        <Text>
          🔥 Streak: <Text bold color={theme.warn}>{state.profile.streakDays}d</Text>
        </Text>
        <Text dimColor>|</Text>
        <Text>
          ⭐ Lifetime XP: <Text bold>{state.profile.totalXp}</Text>
        </Text>
      </Box>
    </Box>
  );
}
