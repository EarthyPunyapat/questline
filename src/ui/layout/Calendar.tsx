import React from 'react';
import { Box, Text } from 'ink';
import type { GameState } from '../../types/state.ts';
import { buildMonthGrid, dayActivity, monthLabel } from '../../calendar/logic.ts';
import { theme } from '../theme.ts';

interface CalendarProps {
  state: GameState;
  year: number;
  /** 0-11, Date-style. */
  monthIdx: number;
  bordered?: boolean;
}

const WEEKDAYS = 'Mo Tu We Th Fr Sa Su';

/** Dumb month panel: no key handling, no nav state — parent owns the cursor. */
export function Calendar({
  state,
  year,
  monthIdx,
  bordered = false,
}: CalendarProps): React.ReactElement {
  const grid = buildMonthGrid(year, monthIdx);
  const todayISO = toLocalToday();

  return (
    <Box
      flexDirection="column"
      borderStyle={bordered ? 'round' : undefined}
      borderColor={bordered ? theme.accent : undefined}
      paddingX={bordered ? 1 : undefined}
    >
      <Text bold color={theme.accent}>
        ‹ {monthLabel(year, monthIdx)} ›
      </Text>
      <Text dimColor>{WEEKDAYS}</Text>
      {grid.map((row, ri) => (
        <Box key={ri}>
          {row.map((cell, ci) => {
            if (cell === null) {
              return (
                <Box key={ci} width={3}>
                  <Text dimColor> ·</Text>
                </Box>
              );
            }
            const day = Number(cell.slice(-2));
            const label = String(day).padStart(2, ' ');
            const { completions } = dayActivity(state, cell);
            const hot = completions >= 3;
            const warm = completions >= 1 && !hot;
            return (
              <Box key={ci} width={3}>
                <Text
                  inverse={cell === todayISO}
                  bold={hot || cell === todayISO}
                  color={warm ? theme.accent : hot ? theme.accent : undefined}
                  dimColor={warm}
                >
                  {label}
                </Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function toLocalToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
