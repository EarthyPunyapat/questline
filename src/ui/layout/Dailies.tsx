import React from 'react';
import { Box, Text } from 'ink';
import type { DailyQuestSet } from '../../types/state.ts';
import { xpValue, type Task } from '../../types/task.ts';
import { theme } from '../theme.ts';

interface DailiesProps {
  /** Today's daily tasks, canonical questIds order. */
  tasks: Task[];
  set: DailyQuestSet | null;
  selectedId?: string;
}

/** Left-panel section above regular tasks: today's generated daily quests. */
export function Dailies({ tasks, set, selectedId }: DailiesProps): React.ReactElement {
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.warn}>
        ☀ DAILIES ({doneCount}/{tasks.length})
      </Text>
      {tasks.map((t) => {
        const sel = t.id === selectedId;
        const marker = t.status === 'done' ? '●' : sel ? '▶' : '○';
        return (
          <Box key={t.id}>
            <Box width={2}>
              <Text color={t.status === 'done' ? theme.accent : theme.muted}>{marker}</Text>
            </Box>
            <Text
              color={t.status === 'done' ? theme.muted : undefined}
              strikethrough={t.status === 'done'}
              bold={sel}
            >
              {sel ? t.title : ` ${t.title}`}
            </Text>
            <Box flexGrow={1} />
            <Text dimColor>+{xpValue(t)} XP</Text>
          </Box>
        );
      })}
      {set?.completedAll && <Text color={theme.accent}>✦ +50 bonus locked in</Text>}
    </Box>
  );
}
