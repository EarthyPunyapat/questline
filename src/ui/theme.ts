// Three color palettes cycled at runtime with key `t`.
// Components read the live singleton each render; App bumps a tick after cycling.
export interface Palette {
  name: string;
  accent: string;
  headerFg: string;
  warn: string;
}

export const THEMES: Palette[] = [
  { name: 'emerald', accent: 'green', headerFg: 'cyan', warn: 'yellow' },
  { name: 'inferno', accent: 'red', headerFg: 'magenta', warn: 'yellow' },
  { name: 'ocean', accent: 'blue', headerFg: 'cyan', warn: 'cyan' },
];

let idx = 0;

/** Live palette singleton — mutate via cycleTheme(). */
export const theme = {
  get name(): string {
    return THEMES[idx]!.name;
  },
  get accent(): string {
    return THEMES[idx]!.accent;
  },
  get headerFg(): string {
    return THEMES[idx]!.headerFg;
  },
  get warn(): string {
    return THEMES[idx]!.warn;
  },
  get muted(): string {
    return 'gray';
  },
};

/** Advance to next palette; returns its name. */
export function cycleTheme(): string {
  idx = (idx + 1) % THEMES.length;
  return THEMES[idx]!.name;
}

/** Point the singleton at a named palette WITHOUT cycling (M12/T12.A boot
 * default from config.json). Unknown ids are ignored — no-op safe, so bad
 * config can never break startup. */
export function setInitialTheme(id: string): void {
  const i = THEMES.findIndex((t) => t.name === id);
  if (i >= 0) idx = i;
}

export const difficultyColor: Record<'easy' | 'medium' | 'hard', string> = {
  easy: 'green',
  medium: 'yellow',
  hard: 'red',
};

export const difficultyLabel: Record<'easy' | 'medium' | 'hard', string> = {
  easy: 'EZ',
  medium: 'MD',
  hard: 'HD',
};
