import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  MAX_NOTE_BODY_LEN,
  type Note,
} from '../../types/state.ts';
import { theme } from '../theme.ts';

export interface NoteEditorProps {
  /** Existing note when editing; absent when creating. */
  initial?: Note;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}

/**
 * Two-phase note editor (mirrors AddTaskModal's wizard pattern so titles can
 * contain any key): PHASE 'title' -> enter advances, esc cancels.
 * PHASE 'body'   -> printable/backspace edit, char counter, enter saves
 *                   (blocked while title empty), esc cancels.
 */
export function NoteEditor({
  initial,
  onSave,
  onCancel,
}: NoteEditorProps): React.ReactElement {
  const [phase, setPhase] = useState<'title' | 'body'>('title');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [warning, setWarning] = useState<string | null>(null);

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel();
        return;
      }

      if (phase === 'title') {
        if (key.return) {
          if (title.trim().length === 0) {
            setWarning('title must not be empty');
            return;
          }
          setWarning(null);
          setPhase('body');
          return;
        }
        if (key.backspace || key.delete) setTitle(title.slice(0, -1));
        else if (input.length === 1 && title.length < 80) setTitle(title + input);
        return;
      }

      // body phase
      if (key.return) {
        if (title.trim().length === 0) {
          setWarning('title must not be empty');
          return;
        }
        onSave(title.trim(), body);
        return;
      }
      if (key.backspace || key.delete) setBody(body.slice(0, -1));
      else if (input.length === 1 && body.length < MAX_NOTE_BODY_LEN) {
        setBody(body + input);
      }
    },
    { isActive: true },
  );

  const atCap = body.length >= MAX_NOTE_BODY_LEN;

  return (
    <Box borderStyle="round" borderColor={theme.accent} flexDirection="column" paddingX={1} width={64}>
      <Text bold color={theme.accent}>
        {initial ? 'Edit Note' : 'New Note'}
      </Text>
      <Text>
        {phase === 'title' ? '> ' : ''}
        {title}
        {phase === 'title' && <Text inverse> </Text>}
      </Text>
      {phase === 'body' && (
        <>
          <Text>
            {'> '}
            {body}
            <Text inverse> </Text>
          </Text>
          <Box gap={2}>
            <Text color={atCap ? 'red' : theme.muted}>
              {body.length}/{MAX_NOTE_BODY_LEN}
            </Text>
            {warning !== null && (
              <Text color="yellow" bold>
                ⚠ {warning}
              </Text>
            )}
          </Box>
        </>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          {phase === 'title'
            ? 'title · enter: next · esc: cancel'
            : 'body · enter: save · esc: cancel'}
        </Text>
      </Box>
    </Box>
  );
}
