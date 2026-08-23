import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  DIFFICULTIES,
  type Difficulty,
  type Recurrence,
  resolveDueSpec,
} from '../../types/task.ts';
import { localDateStr } from '../../xp/streaks.ts';
import { difficultyColor, theme } from '../theme.ts';
import {
  BADGE,
  DAY_LABELS,
  DUE_BADGE,
  DUE_CYCLE,
  INITIAL_STATE,
  REC_CYCLE,
  reduceModal,
  type DueMode,
  type ModalState,
  type RecMode,
} from './addTaskWizard.ts';

interface AddTaskModalProps {
  onSubmit: (
    title: string,
    difficulty: Difficulty,
    recurrence?: Recurrence,
    /** LOCAL 'YYYY-MM-DD' — resolved here from the chosen cycle mode. */
    dueDate?: string,
  ) => void;
  onCancel: () => void;
}

/**
 * Two-phase wizard (M9/T9.2 fix): keys used to mean commands even while the
 * user typed the title ('r' cycled recurrence, digits toggled weekdays), so
 * titles like "read 30 pages" were impossible.
 *
 * PHASE 1 'title'   : everything printable is TEXT; enter advances, esc cancels.
 * PHASE 2 'options' : title frozen on top; tab/←/→ difficulty, r recurrence,
 *                     1-7 weekday picker while weekly, enter submits
 *                     (blocked with a warning if weekly has no days),
 *                     esc goes back to phase 1 with the title preserved.
 */
export function AddTaskModal({ onSubmit, onCancel }: AddTaskModalProps): React.ReactElement {
  const [modal, setModal] = useState<ModalState>(INITIAL_STATE);
  const [warning, setWarning] = useState<string | null>(null);

  useInput(
    (input, key) => {
      const next = reduceModal(modal, input, key);
      setWarning(next.effect.kind === 'warn' ? next.effect.message : null);
      setModal(next.state);
      const fx = next.effect;
      if (fx.kind === 'cancel') onCancel();
      else if (fx.kind === 'submit') {
        const dueDate =
          fx.due !== undefined ? resolveDueSpec(fx.due, localDateStr()) : undefined;
        onSubmit(fx.title, fx.difficulty, fx.recurrence, dueDate);
      }
    },
    { isActive: true },
  );

  const recMode: RecMode =
    modal.phase === 'options' ? REC_CYCLE[modal.recIdx] as RecMode : 'none';
  const diffIdx = modal.phase === 'options' ? modal.diffIdx : -1;
  const dueMode: DueMode =
    modal.phase === 'options' ? DUE_CYCLE[modal.dueIdx] as DueMode : 'none';

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
      {modal.phase === 'title' ? (
        <>
          <Text>
            {'> '}
            {modal.title}
            <Text inverse> </Text>
          </Text>
          <Box marginTop={1}>
            <Text dimColor>type the quest · enter: next · esc: cancel</Text>
          </Box>
        </>
      ) : (
        <>
          {/* Frozen title from phase 1 */}
          <Text dimColor>
            new quest:
          </Text>
          <Text bold>{modal.title}</Text>
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
            <Text color={dueMode === 'none' ? theme.muted : theme.warn} bold={dueMode !== 'none'}>
              {DUE_BADGE[dueMode]}
            </Text>
          </Box>
          {recMode === 'weekly' && (
            <Box gap={1} marginTop={1}>
              {DAY_LABELS.map((d, i) => {
                const on = modal.weekdays.includes(d.dow);
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
          {warning !== null && (
            <Text color="yellow" bold>
              ⚠ {warning}
            </Text>
          )}
          <Box marginTop={1}>
            <Text dimColor>
              tab/←→: difficulty · r: repeat ({recMode}) · u: due ({dueMode}) · enter: add · esc:
              edit title
              {recMode === 'weekly' ? ' · 1-7: pick days' : ''}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
