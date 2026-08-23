// M9/T9.2: pure two-phase add-task wizard logic, extracted from AddTaskModal
// so the key semantics are unit-testable without an Ink renderer.
//
// Bug being fixed: the old single-phase handler captured 'r' and digits 1-7
// as OPTION commands even while the user was typing the title, so titles
// like "read 30 pages" were impossible to enter.
//
// PHASE 1 'title'   : every printable char appends (incl. 'r' and digits),
//                     backspace deletes, Enter advances (non-empty trimmed),
//                     Esc cancels the whole modal.
// PHASE 2 'options' : keys mean commands again — tab/←/→ cycle difficulty,
//                     'r' cycles recurrence, digits 1-7 pick weekdays ONLY
//                     while weekly, Enter submits (blocked with a warning
//                     while weekly and no day picked), Esc returns to
//                     phase 1 with the title preserved for editing.
import {
  DIFFICULTIES,
  type Difficulty,
  type Recurrence,
} from '../../types/task.ts';

export type RecMode = 'none' | 'daily' | 'weekly';

export const REC_CYCLE: readonly RecMode[] = ['none', 'daily', 'weekly'];

export const BADGE: Record<RecMode, string> = {
  none: '',
  daily: '⟳ daily',
  weekly: '⟳ weekly',
};

/** Display order Mon..Sun; stored as JS dow numbers (1..6, 0 for Sun). */
export const DAY_LABELS: ReadonlyArray<{ label: string; dow: number }> = [
  { label: 'Mo', dow: 1 },
  { label: 'Tu', dow: 2 },
  { label: 'We', dow: 3 },
  { label: 'Th', dow: 4 },
  { label: 'Fr', dow: 5 },
  { label: 'Sa', dow: 6 },
  { label: 'Su', dow: 0 },
];

export interface TitlePhase {
  phase: 'title';
  title: string;
}

export interface OptionsPhase {
  phase: 'options';
  /** Frozen while editing options; returned to phase 1 untouched via Esc. */
  title: string;
  diffIdx: number;
  recIdx: number;
  weekdays: number[];
}

export type ModalState = TitlePhase | OptionsPhase;

export type ModalEffect =
  | { kind: 'none' }
  | { kind: 'cancel' }
  | { kind: 'submit'; title: string; difficulty: Difficulty; recurrence?: Recurrence }
  | { kind: 'warn'; message: string };

/** Structural subset of Ink's `Key` object (keeps this module Ink-free). */
export interface KeyLike {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export const INITIAL_STATE: ModalState = { phase: 'title', title: '' };

/** Medium is preselected, matching the original modal's default. */
const DEFAULT_DIFF_IDX = 1;

export const MAX_TITLE_LEN = 80;

export const WEEKLY_WARNING = 'pick at least one day (1-7)';

export function toggleWeekday(days: readonly number[], dow: number): number[] {
  return days.includes(dow) ? days.filter((d) => d !== dow) : [...days, dow];
}

export function buildRecurrence(
  recIdx: number,
  weekdays: readonly number[],
): Recurrence | undefined {
  const mode = REC_CYCLE[recIdx] as RecMode;
  if (mode === 'daily') return { freq: 'daily' };
  if (mode === 'weekly') {
    if (weekdays.length === 0) return undefined; // defensive: never reached post-gate
    return { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
  }
  return undefined;
}

function printable(input: string, key: KeyLike): boolean {
  return Boolean(input) && !key.ctrl && !key.meta;
}

/** Pure key dispatch shared by both phases. Never mutates `state`. */
export function reduceModal(
  state: ModalState,
  input: string,
  key: KeyLike,
): { state: ModalState; effect: ModalEffect } {
  if (state.phase === 'title') {
    if (key.escape) return { state, effect: { kind: 'cancel' } };
    if (key.return) {
      // Advance only with something to name the quest after.
      if (state.title.trim().length > 0) {
        return {
          state: {
            phase: 'options',
            title: state.title,
            diffIdx: DEFAULT_DIFF_IDX,
            recIdx: 0,
            weekdays: [],
          },
          effect: { kind: 'none' },
        };
      }
      return { state, effect: { kind: 'none' } };
    }
    if (key.backspace || key.delete) {
      return {
        state: { phase: 'title', title: state.title.slice(0, -1) },
        effect: { kind: 'none' },
      };
    }
    // Navigation keys are inert while typing (they belong to phase 2).
    if (key.tab || key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      return { state, effect: { kind: 'none' } };
    }
    // THE fix: 'r', digits, spaces, symbols — every printable char is text here.
    if (printable(input, key) && state.title.length < MAX_TITLE_LEN) {
      return {
        state: { phase: 'title', title: state.title + input },
        effect: { kind: 'none' },
      };
    }
    return { state, effect: { kind: 'none' } };
  }

  // ---------- phase: options ----------
  if (key.escape) {
    // Back to editing the title, preserved verbatim (cursor restarts at end).
    return { state: { phase: 'title', title: state.title }, effect: { kind: 'none' } };
  }
  const cycleDiff = (dir: 1 | -1): ModalState => ({
    ...state,
    diffIdx: (state.diffIdx + dir + DIFFICULTIES.length) % DIFFICULTIES.length,
  });
  if (key.tab || key.rightArrow) return { state: cycleDiff(1), effect: { kind: 'none' } };
  if (key.leftArrow) return { state: cycleDiff(-1), effect: { kind: 'none' } };
  if (input === 'r') {
    return {
      state: { ...state, recIdx: (state.recIdx + 1) % REC_CYCLE.length },
      effect: { kind: 'none' },
    };
  }
  const mode = REC_CYCLE[state.recIdx] as RecMode;
  // Weekly picker: digits 1-7 map to Mon..Sun (7 → Sunday/dow 0). Weekly only.
  if (mode === 'weekly' && input >= '1' && input <= '7') {
    const dow = input === '7' ? 0 : Number.parseInt(input, 10);
    return {
      state: { ...state, weekdays: toggleWeekday(state.weekdays, dow) },
      effect: { kind: 'none' },
    };
  }
  if (key.return) {
    if (mode === 'weekly' && state.weekdays.length === 0) {
      return { state, effect: { kind: 'warn', message: WEEKLY_WARNING } };
    }
    return {
      state,
      effect: {
        kind: 'submit',
        title: state.title.trim(),
        difficulty: DIFFICULTIES[state.diffIdx] as Difficulty,
        recurrence: buildRecurrence(state.recIdx, state.weekdays),
      },
    };
  }
  // Any other key (stray letters/digits outside weekly, etc.) is inert here.
  return { state, effect: { kind: 'none' } };
}
