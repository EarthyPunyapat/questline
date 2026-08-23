import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '../../types/task.ts';
import { localDateStr } from '../../xp/streaks.ts';
import { difficultyColor, difficultyLabel, theme } from '../theme.ts';

interface TaskListProps {
  tasks: Task[];
  selectedId?: string;
  maxRows?: number;
}

export function TaskList({ tasks, selectedId, maxRows = 12 }: TaskListProps): React.ReactElement {
  const todayISO = localDateStr();
  if (tasks.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No quests yet.</Text>
        <Text dimColor>
          Press <Text color={theme.accent}>a</Text> to add your first task.
        </Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      {tasks.slice(0, maxRows).map((t) => {
        const sel = t.id === selectedId;
        const marker = t.status === 'done' ? '✓' : sel ? '▶' : ' ';
        const overdue = t.status === 'todo' && t.dueDate !== undefined && t.dueDate < todayISO;
        return (
          <Box key={t.id}>
            <Box width={2}>
              <Text color={t.status === 'done' ? theme.accent : theme.muted}>{marker}</Text>
            </Box>
            <Box width={4}>
              <Text color={difficultyColor[t.difficulty]}>{difficultyLabel[t.difficulty]}</Text>
            </Box>
            <Box width={3}>
              <Text color={theme.muted}>
                {t.recurrence ? (t.recurrence.freq === 'daily' ? '⟳D' : '⟳W') : ''}
              </Text>
            </Box>
            <Text
              color={t.status === 'done' ? theme.muted : overdue ? 'red' : undefined}
              strikethrough={t.status === 'done'}
              bold={sel || overdue}
            >
              {sel || overdue ? t.title : ` ${t.title}`}
            </Text>
            {t.dueDate !== undefined && (
              <Text color={overdue ? 'red' : theme.warn} bold={overdue}>
                {' '}
                ⏰{t.dueDate.slice(5)}
              </Text>
            )}
          </Box>
        );
      })}
      {tasks.length > maxRows && (
        <Text dimColor>… +{tasks.length - maxRows} more</Text>
      )}
    </Box>
  );
}
