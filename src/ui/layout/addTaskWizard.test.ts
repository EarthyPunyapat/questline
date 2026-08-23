// M9/T9.2: pure-logic coverage for the two-phase add-task wizard.
import { describe, expect, test } from 'bun:test';
import { DIFFICULTIES } from '../../types/task.ts';
import {
  DUE_CYCLE,
  INITIAL_STATE,
  MAX_TITLE_LEN,
  REC_CYCLE,
  WEEKLY_WARNING,
  buildRecurrence,
  reduceModal,
  toggleWeekday,
  type KeyLike,
  type ModalState,
  type RecMode,
} from './addTaskWizard.ts';

const k = (over: Partial<KeyLike> = {}): KeyLike => ({ ...over });
const press = (state: ModalState, input: string, key: KeyLike = k()) =>
  reduceModal(state, input, key);
const type = (state: ModalState, text: string): ModalState => {
  let s = state;
  for (const ch of text) s = press(s, ch).state;
  return s;
};
/** Advance a non-empty title into the options phase. */
const toOptions = (title = 'jog'): Extract<ModalState, { phase: 'options' }> => {
  const next = reduceModal(type(INITIAL_STATE, title), '', k({ return: true }));
  return next.state as Extract<ModalState, { phase: 'options' }>;
};

describe('wizard phase 1 (free typing)', () => {
  test("REGRESSION: 'r' inserts the letter instead of cycling recurrence", () => {
    const res = press(INITIAL_STATE, 'r');
    expect(res.effect.kind).toBe('none');
    expect(res.state).toEqual({ phase: 'title', title: 'r' });
  });

  test('digits and spaces type freely — "read 30 pages" lands verbatim', () => {
    const typed = type(INITIAL_STATE, 'read 30 pages');
    expect(typed.phase).toBe('title');
    expect((typed as { title: string }).title).toBe('read 30 pages');
  });

  test('enter with empty/blank title stays in phase 1', () => {
    for (const t of [INITIAL_STATE, type(INITIAL_STATE, '   ')]) {
      const res = press(t, '', k({ return: true }));
      expect(res.state.phase).toBe('title');
      expect(res.effect.kind).toBe('none');
    }
  });

  test('enter with a real title advances; defaults match old modal (medium, none)', () => {
    const res = reduceModal(type(INITIAL_STATE, 'jog'), '', k({ return: true }));
    expect(res.state).toEqual({
      phase: 'options',
      title: 'jog',
      diffIdx: 1,
      recIdx: 0,
      weekdays: [],
      dueIdx: 0,
    });
    expect(DIFFICULTIES[1]).toBe('medium');
    expect(REC_CYCLE[0]).toBe('none');
  });

  test('esc in phase 1 cancels the modal', () => {
    const res = press(type(INITIAL_STATE, 'ab'), '', k({ escape: true }));
    expect(res.effect.kind).toBe('cancel');
    expect(res.state.phase).toBe('title'); // state untouched; host unmounts
  });

  test('backspace removes the last char; nav keys are inert while typing', () => {
    const afterBs = press(type(INITIAL_STATE, 'abc'), '', k({ backspace: true }));
    expect((afterBs.state as { title: string }).title).toBe('ab');

    const tabbed = press(type(INITIAL_STATE, 'abc'), '\t', k({ tab: true }));
    expect(tabbed.state).toEqual(type(INITIAL_STATE, 'abc'));
  });

  test('80-char cap still holds', () => {
    const full = type(INITIAL_STATE, 'x'.repeat(MAX_TITLE_LEN));
    expect((full as { title: string }).title.length).toBe(MAX_TITLE_LEN);
    expect((press(full, 'y').state as { title: string }).title.length).toBe(MAX_TITLE_LEN);
  });
});

describe('wizard phase 2 (options)', () => {
  test("'r' cycles recurrence none → daily → weekly → none", () => {
    let s = toOptions();
    const cycle: RecMode[] = ['daily', 'weekly', 'none'];
    for (const expected of cycle) {
      s = press(s, 'r').state as typeof s;
      expect(REC_CYCLE[s.recIdx]).toBe(expected);
    }
  });

  test('digits are inert outside weekly mode (titles already frozen anyway)', () => {
    const before = toOptions();
    const after = press(before, '3').state;
    expect(after).toEqual(before);
  });

  test('weekly weekday picker: toggle on/off, digit 7 maps to Sunday/dow 0', () => {
    let s = toOptions();
    s = press(s, 'r').state as typeof s; // daily
    s = press(s, 'r').state as typeof s; // weekly
    s = press(s, '1').state as typeof s;
    s = press(s, '7').state as typeof s;
    expect(s.weekdays).toEqual([1, 0]);
    s = press(s, '1').state as typeof s;
    expect(s.weekdays).toEqual([0]);
  });

  test('submit blocked while weekly with no days picked — warning, no submit', () => {
    let s = toOptions();
    s = press(s, 'r').state as typeof s;
    s = press(s, 'r').state as typeof s; // weekly, weekdays []
    const res = press(s, '', k({ return: true }));
    expect(res.effect.kind).toBe('warn');
    if (res.effect.kind === 'warn') expect(res.effect.message).toBe(WEEKLY_WARNING);
    expect(res.state).toBe(s); // unchanged
  });

  test('submit once at least one day is picked', () => {
    let s = toOptions();
    s = press(s, 'r').state as typeof s;
    s = press(s, 'r').state as typeof s;
    s = press(s, '3').state as typeof s;
    const res = press(s, '', k({ return: true }));
    expect(res.effect.kind).toBe('submit');
    if (res.effect.kind === 'submit') {
      expect(res.effect.title).toBe('jog');
      expect(res.effect.recurrence).toEqual({ freq: 'weekly', weekdays: [3] });
    }
  });

  test('tab / ← / → cycle difficulty with wraparound; esc returns preserving title', () => {
    let s = toOptions();
    s = press(s, '\t', k({ tab: true })).state as typeof s;
    expect(s.diffIdx).toBe(2);
    s = press(s, '', k({ leftArrow: true })).state as typeof s;
    expect(s.diffIdx).toBe(1);
    s = press(s, '', k({ leftArrow: true })).state as typeof s;
    expect(s.diffIdx).toBe(0);
    s = press(s, '', k({ leftArrow: true })).state as typeof s; // wrap to tail
    expect(s.diffIdx).toBe(DIFFICULTIES.length - 1);

    const back = press(s, '', k({ escape: true })).state;
    expect(back).toEqual({ phase: 'title', title: 'jog' });
  });

  test('esc from options then enter re-enters options with the same title', () => {
    const back = press(toOptions(), '', k({ escape: true })).state;
    const again = reduceModal(back, '', k({ return: true }));
    expect(again.state.phase).toBe('options');
    expect((again.state as { title: string }).title).toBe('jog');
  });

  test('plain-mode submit passes recurrence undefined and trims nothing away', () => {
    const s = toOptions('  jog  ');
    const res = press(s, '', k({ return: true }));
    expect(res.effect.kind).toBe('submit');
    if (res.effect.kind === 'submit') {
      expect(res.effect.title).toBe('jog');
      expect(res.effect.difficulty).toBe('medium');
      expect(res.effect.recurrence).toBeUndefined();
    }
  });
});

describe('pure helpers', () => {
  test('toggleWeekday adds then removes without mutating input', () => {
    const base = [1];
    expect(toggleWeekday(base, 3)).toEqual([1, 3]);
    expect(base).toEqual([1]);
    expect(toggleWeekday(toggleWeekday(base, 3), 3)).toEqual([1]);
  });

  test('buildRecurrence sorts weekdays ascending; none/daily shapes preserved', () => {
    expect(buildRecurrence(0, [])).toBeUndefined();
    expect(buildRecurrence(1, [])).toEqual({ freq: 'daily' });
    expect(buildRecurrence(2, [6, 0, 3])).toEqual({ freq: 'weekly', weekdays: [0, 3, 6] });
  });
});

describe('M11/B due cycle (key u in options phase)', () => {
  test('u cycles none -> today -> tomorrow -> next-week -> none', () => {
    let s = toOptions();
    expect(DUE_CYCLE[s.dueIdx]).toBe('none');
    for (const want of ['today', 'tomorrow', 'next-week', 'none'] as const) {
      s = press(s, 'u').state as Extract<ModalState, { phase: 'options' }>;
      expect(DUE_CYCLE[s.dueIdx]).toBe(want);
    }
  });

  test('submit carries the chosen due spec; none omits the key', () => {
    let s = toOptions();
    const none = press(s, '', k({ return: true })).effect;
    expect(none.kind === 'submit' && 'due' in none).toBe(false);

    s = press(s, 'u').state as Extract<ModalState, { phase: 'options' }>;
    const today = press(s, '', k({ return: true })).effect;
    expect(today).toMatchObject({ kind: 'submit', due: 'today' });

    // two more presses -> next-week
    s = press(press(s, 'u').state, 'u').state as Extract<
      ModalState,
      { phase: 'options' }
    >;
    const nw = press(s, '', k({ return: true })).effect;
    expect(nw).toMatchObject({ kind: 'submit', due: 'next-week' });
  });

  test('M9 regression guard: u while typing a title is TEXT, not a command', () => {
    const typed = type(INITIAL_STATE, 'unplug the uke at noon');
    expect(typed).toEqual({ phase: 'title', title: 'unplug the uke at noon' });
  });
});
