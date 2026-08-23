// M11/B: due-date helpers — validation and relative-spec resolution.
// Pure functions, no clock dependency except explicit arguments.
import { describe, test, expect } from 'bun:test';
import {
  isValidDueDate,
  resolveDueSpec,
  makeTask,
  isValidTask,
} from './task.ts';

describe('isValidDueDate', () => {
  test('accepts real LOCAL calendar days in strict form', () => {
    expect(isValidDueDate('2026-08-23')).toBe(true);
    expect(isValidDueDate('2024-02-29')).toBe(true); // leap year
    expect(isValidDueDate('1999-12-31')).toBe(true);
  });

  test('rejects impossible dates, short forms, junk', () => {
    for (const bad of [
      '2026-02-30', // Feb 30
      '2023-02-29', // non-leap
      '2026-13-01', // month 13
      '2026-00-10', // month 0
      '2026-08-00', // day 0
      '2026-8-23', // no zero pad
      '26-08-23', // short year
      '2026/08/23', // slashes
      '20260823', // compact
      '', // empty
      'today', // spec word, not a date
      42,
      null,
      undefined,
      {},
    ]) {
      expect(isValidDueDate(bad)).toBe(false);
    }
  });
});

describe('resolveDueSpec', () => {
  const base = '2026-08-23'; // a Sunday

  test("'today' returns the base unchanged", () => {
    expect(resolveDueSpec('today', base)).toBe('2026-08-23');
  });

  test("'tomorrow' shifts by one day", () => {
    expect(resolveDueSpec('tomorrow', base)).toBe('2026-08-24');
  });

  test("'next-week' shifts by seven days", () => {
    expect(resolveDueSpec('next-week', base)).toBe('2026-08-30');
  });

  test('shifts roll across month boundaries', () => {
    expect(resolveDueSpec('tomorrow', '2026-08-31')).toBe('2026-09-01');
    expect(resolveDueSpec('next-week', '2026-08-28')).toBe('2026-09-04');
    expect(resolveDueSpec('tomorrow', '2026-12-31')).toBe('2027-01-01'); // year rollover
  });

  test('a literal YYYY-MM-DD passes through untouched', () => {
    expect(resolveDueSpec('2026-11-02', base)).toBe('2026-11-02');
  });

  test('unknown/malformed specs are undefined (caller keeps going)', () => {
    expect(resolveDueSpec('someday', base)).toBeUndefined();
    expect(resolveDueSpec('2026-02-30', base)).toBeUndefined();
    expect(resolveDueSpec('', base)).toBeUndefined();
  });
});

describe('makeTask due-date integration', () => {
  test('stores a valid dueDate', () => {
    const t = makeTask('t-x', 'file taxes', 'medium', undefined, undefined, '2026-09-01');
    expect(t.dueDate).toBe('2026-09-01');
  });

  test('throws on malformed dueDate', () => {
    expect(() => makeTask('t-y', 'bad', 'easy', undefined, undefined, '2026-02-30')).toThrow(
      /invalid dueDate/,
    );
  });

  test('omits the key when no due date given', () => {
    const t = makeTask('t-z', 'plain', 'easy');
    expect('dueDate' in t).toBe(false);
  });

  test('isValidTask tolerates valid dueDate, rejects malformed ones', () => {
    const ok = makeTask('t-1', 'ok', 'easy', undefined, undefined, '2026-09-09');
    expect(isValidTask(ok)).toBe(true);
    const bad = { ...makeTask('t-2', 'bad', 'easy'), dueDate: 'soon' };
    expect(isValidTask(bad)).toBe(false);
  });
});
