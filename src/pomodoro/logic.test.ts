// M10/T10.D: tick math + formatting for the header countdown.
import { describe, expect, test } from 'bun:test';
import {
  POMODORO_SECS,
  POMODORO_XP,
  fmtClock,
  isPomodoroComplete,
  tickRemaining,
} from './logic.ts';

describe('tickRemaining', () => {
  test('decrements by one', () => {
    expect(tickRemaining(POMODORO_SECS)).toBe(POMODORO_SECS - 1);
    expect(tickRemaining(1)).toBe(0);
  });

  test('floors at zero (idempotent)', () => {
    expect(tickRemaining(0)).toBe(0);
    expect(tickRemaining(tickRemaining(0))).toBe(0);
  });
});

describe('fmtClock', () => {
  test('renders mm:ss with zero padding across boundaries', () => {
    expect(fmtClock(POMODORO_SECS)).toBe('25:00');
    expect(fmtClock(599)).toBe('09:59');
    expect(fmtClock(60)).toBe('01:00');
    expect(fmtClock(0)).toBe('00:00');
  });

  test('clamps negative input defensively', () => {
    expect(fmtClock(-5)).toBe('00:00');
  });
});

describe('completion', () => {
  test('only exact zero completes; constants stay in sync', () => {
    expect(isPomodoroComplete(0)).toBe(true);
    expect(isPomodoroComplete(1)).toBe(false);
    expect(POMODORO_SECS).toBe(1500);
    expect(POMODORO_XP).toBe(15);
  });
});
