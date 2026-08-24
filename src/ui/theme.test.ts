// M12/T12.A: boot-default theme selection from config.json.
import { describe, expect, test } from 'bun:test';
import { THEMES, cycleTheme, setInitialTheme, theme } from './theme.ts';

describe('setInitialTheme', () => {
  test('selects a known palette by id', () => {
    setInitialTheme('ocean');
    expect(theme.name).toBe('ocean');
    setInitialTheme(THEMES[0]!.name); // restore singleton for other suites
  });

  test('unknown id is a no-op (bad config never breaks boot)', () => {
    setInitialTheme('ocean');
    const before = theme.name;
    setInitialTheme('definitely-not-a-theme');
    expect(theme.name).toBe(before);
    setInitialTheme(THEMES[0]!.name);
  });

  test('cycles continue relative to the seeded palette', () => {
    setInitialTheme('inferno');
    expect(cycleTheme()).toBe('ocean');
    setInitialTheme(THEMES[0]!.name);
    expect(theme.name).toBe(THEMES[0]!.name);
  });
});
