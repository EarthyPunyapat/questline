// M12/T12.C: dumb overlay listing built-in quest templates.
// KEY HANDLING LIVES IN THE PARENT (app.tsx integration, T12.D):
//   j / k  — move selection down / up
//   enter  — onSelect(templates[selectedIndex].id)
//   esc    — onClose()
// This component renders only; it never owns key state.
import React from 'react';
import { Box, Text } from 'ink';
import { QUEST_TEMPLATES, type QuestTemplate } from '../../quests/library.ts';
import { theme } from '../theme.ts';

export interface QuestLibraryProps {
  /** Which row is highlighted (parent-owned index into templates). */
  selectedIndex: number;
  /** Parent callback fired on enter (parent passes template id). */
  onSelect: (id: string) => void;
  /** Parent callback fired on esc. */
  onClose: () => void;
  /** Injectable roster; defaults to the built-in library. */
  templates?: readonly QuestTemplate[];
}

export function QuestLibrary({
  selectedIndex,
  templates = QUEST_TEMPLATES,
}: Omit<QuestLibraryProps, 'onSelect' | 'onClose'> &
  Partial<Pick<QuestLibraryProps, 'onSelect' | 'onClose'>>): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
    >
      <Text bold color={theme.accent}>
        QUEST LIBRARY
      </Text>
      <Text dimColor>j/k select · enter start · esc close</Text>
      {templates.map((t, i) => {
        const sel = i === selectedIndex;
        return (
          <Box key={t.id} flexDirection="column">
            <Text inverse={sel}>
              {sel ? '▶ ' : '  '}
              <Text bold>{t.title}</Text>{' '}
              <Text dimColor>
                ({t.tasks.length} tasks · +{t.rewardXp} XP)
              </Text>
            </Text>
            <Text dimColor>  {t.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
