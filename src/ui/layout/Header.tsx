import React from 'react';
import { Box, Text } from 'ink';
import type { Profile } from '../../types/state.ts';
import { levelCurve } from '../../xp/levels.ts';
import { fmtClock } from '../../pomodoro/logic.ts';
import { XpBar } from './XpBar.tsx';
import { TrophyRow } from './TrophyRow.tsx';

export interface PomodoroStatus {
  remainingSec: number;
  running: boolean;
}

export function Header({
  profile,
  pomodoro,
}: {
  profile: Profile;
  /** Present while a pomodoro session exists (running or paused). */
  pomodoro?: PomodoroStatus;
}): React.ReactElement {
  const lv = levelCurve(profile.totalXp);
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ⚔ QUESTLINE
        </Text>
        <Text>
          {pomodoro && (
            <>
              <Text bold={pomodoro.running} dimColor={!pomodoro.running} color="magenta">
                ⏳ {fmtClock(pomodoro.remainingSec)}
                {pomodoro.running ? '' : ' ⏸'}
              </Text>
              <Text dimColor> · </Text>
            </>
          )}
          <Text bold color="magenta">
            Lv {lv.level}
          </Text>
          <Text dimColor> · </Text>
          <Text color="yellow">🔥 {profile.streakDays}d streak</Text>
          <Text dimColor> · </Text>
          <Text dimColor>{profile.totalXp} total XP</Text>
        </Text>
      </Box>
      <XpBar intoLevel={lv.intoLevel} xpForNext={lv.xpForNext} />
      <TrophyRow achievements={profile.achievements ?? []} />
    </Box>
  );
}
