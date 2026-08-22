import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { DIFFICULTIES, type Difficulty } from '../../types/task.ts';
import { difficultyColor, theme } from '../theme.ts';

interface AddTaskModalProps {
  onSubmit: (title: string, difficulty: Difficulty) => void;
  onCancel: () => void;
}

/** Modal input: type title, TAB/←/→ cycles difficulty, ENTER submits, ESC cancels. */
export function AddTaskModal({ onSubmit, onCancel }: AddTaskModalProps): React.ReactElement {
  const [title, setTitle] = useState('');
  const [diffIdx, setDiffIdx] = useState(1);
  const difficulty = DIFFICULTIES[diffIdx] as Difficulty;

  useInput(
    (input, key) => {
      if (key.escape) return onCancel();
      if (key.tab) {
        setDiffIdx((i) => (i + 1) % DIFFICULTIES.length);
        return;
      }
      if (key.leftArrow) {
        setDiffIdx((i) => (i - 1 + DIFFICULTIES.length) % DIFFICULTIES.length);
        return;
      }
      if (key.rightArrow) {
        setDiffIdx((i) => (i + 1) % DIFFICULTIES.length);
        return;
      }
      if (key.return) {
        const trimmed = title.trim();
        if (trimmed.length > 0) onSubmit(trimmed, difficulty);
        return;
      }
      if (key.backspace || key.delete) {
        setTitle((t) => t.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setTitle((t) => (t.length < 80 ? t + input : t));
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.accent}
      flexDirection="column"
      paddingX={1}
      width={56}
    >
      <Text bold color={theme.accent}>
        New Task
      </Text>
      <Text>
        {'> '}
        {title}
        <Text inverse> </Text>
      </Text>
      <Box gap={2} marginTop={1}>
        {DIFFICULTIES.map((d, i) => (
          <Text
            key={d}
            color={i === diffIdx ? difficultyColor[d] : theme.muted}
            bold={i === diffIdx}
          >
            {i === diffIdx ? '◉' : '○'} {d}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>tab: cycle difficulty · enter: save · esc: cancel</Text>
      </Box>
    </Box>
  );
}
