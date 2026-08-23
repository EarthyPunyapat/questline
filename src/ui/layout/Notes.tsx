import React from 'react';
import { Box, Text } from 'ink';
import { sortNotes } from '../../store/notes.ts';
import type { Note } from '../../types/state.ts';
import { theme } from '../theme.ts';

export interface NotesProps {
  notes: readonly Note[];
  /** Clock for relative times; defaults to now (injectable for tests). */
  now?: number;
}

/** 'just now' | '5m' | '3h' | '2d' since updated. */
function relTime(updatedAt: number, now: number): string {
  const s = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** One-line body preview; empty bodies show a muted placeholder. */
function preview(body: string): string {
  const first = body.split('\n', 1)[0] ?? '';
  return first.length > 36 ? `${first.slice(0, 33)}...` : first;
}

/** Dumb list panel: pinned first, then most recently updated. */
export function Notes({ notes, now = Date.now() }: NotesProps): React.ReactElement {
  if (notes.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>no notes yet — N to add</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {sortNotes(notes).map((n) => {
        const age = relTime(n.updatedAt, now);
        return (
          <Box key={n.id} gap={1}>
            <Text color={n.pinned ? theme.accent : theme.muted} bold={n.pinned}>
              {n.pinned ? '⚑' : '·'}
            </Text>
            <Box flexDirection="column">
              <Text bold>{n.title}</Text>
              <Text dimColor>
                {preview(n.body)}
                {n.body.includes('\n') ? ' …' : ''}
                {' — '}
                {age}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
