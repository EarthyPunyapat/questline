import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  DIFFICULTIES,
  type Difficulty,
  type Recurrence,
} from '../../types/task.ts';
import { difficultyColor, theme } from '../theme.ts';

interface AddTaskModalProps {
  onSubmit: (title: string, difficulty: Difficulty, recurrence?: Recurrence) => void;
  onCancel: () => void;
}

type RecMode = 'none' | 'daily' | 'weekly';

/** Display order Mon..Sun; stored as JS dow numbers (1..6, 0 for Sun). */
const DAY_LABELS: ReadonlyArray<{ label: string; dow: number }> = [
  { label: 'Mo', dow: 1 },
  { label: 'Tu', dow: 2 },
  { label: 'We', dow: 3 },
  { label: 'Th', dow: 4 },
  { label: 'Fr', dow: 5 },
  { label: 'Sa', dow: 6 },
  { label: 'Su', dow: 0 },
];

const REC_CYCLE: readonly RecMode[] = ['none', 'daily', 'weekly'];
const BADGE: Record<RecMode, string> = { none: '', daily: '⟳ daily', weekly: '⟳ weekly' };

/**
 * Modal input: type title, TAB/←/→ cycles difficulty, `r` cycles recurrence
 * (none → daily → weekly), digits 1-7 toggle weekdays in weekly mode,
 * ENTER submits, ESC cancels.
 */
export function AddTaskModal({ onSubmit, onCancel }: AddTaskModalProps): React.ReactElement {
  const [title, setTitle] = useState('');
  const [diffIdx, setDiffIdx] = useState(1);
  const [recIdx, setRecIdx] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const difficulty = DIFFICULTIES[diffIdx] as Difficulty;
  const recMode = REC_CYCLE[recIdx] as RecMode;

  const buildRecurrence = (): Recurrence | undefined => {
    if (recMode === 'daily') return { freq: 'daily' };
    if (recMode === 'weekly') {
      if (weekdays.length === 0) return undefined; // no days picked → one-shot
      return { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
    }
    return undefined;
  };

  useInput(
    (input, key) => {
      if (key.escape) return onCancel();
      if (key.tab) {
        setDiffIdx((i) => (i + 1) % DIFFICULTIES.length);
        return;
      }
      if (input === 'r') {
        setRecIdx((i) => (i + 1) % REC_CYCLE.length);
        return;
      }
      // Weekly picker: digits 1-7 map to Mon..Sun (7 → Sunday/dow 0).
      if (recMode === 'weekly' && input >= '1' && input <= '7') {
        const dow = input === '7' ? 0 : Number.parseInt(input, 10);
        setWeekdays((days) =>
          days.includes(dow) ? days.filter((d) => d !== dow) : [...days, dow],
        );
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
        if (trimmed.length > 0) onSubmit(trimmed, difficulty, buildRecurrence());
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
        <Text color={recMode === 'none' ? theme.muted : theme.accent} bold={recMode !== 'none'}>
          {BADGE[recMode]}
        </Text>
      </Box>
      {recMode === 'weekly' && (
        <Box gap={1} marginTop={1}>
          {DAY_LABELS.map((d, i) => {
            const on = weekdays.includes(d.dow);
            return (
              <Text key={d.label} color={on ? theme.accent : theme.muted} bold={on}>
                {i + 1}
                {on ? '◉' : '○'}
                {d.label}
              </Text>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          tab: difficulty · r: repeat · enter: save · esc: cancel
          {recMode === 'weekly' ? ' · 1-7: pick days' : ''}
        </Text>
      </Box>
    </Box>
  );
}
