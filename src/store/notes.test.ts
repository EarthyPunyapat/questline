// M10/T10.B: note CRUD + persistence through the real atomic save path.
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultState, loadState, saveStateAtomic } from './persist.ts';
import {
  createNote,
  deleteNote,
  getNote,
  sortNotes,
  togglePin,
  updateNote,
} from './notes.ts';
import {
  MAX_NOTE_BODY_LEN,
  MAX_NOTE_TITLE_LEN,
  type GameState,
} from '../types/state.ts';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'questline-notes-'));
  path = join(dir, 'state.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const T0 = 1_700_000_000_000;

describe('notes CRUD', () => {
  test('create → persisted via real save/load roundtrip', () => {
    let s: GameState = defaultState();
    s = createNote(s, 'grocery list', 'eggs\nmilk', T0);
    saveStateAtomic(s, path);
    const loaded = loadState(path);
    expect(loaded.version).toBe(4);
    expect(loaded.notes.length).toBe(1);
    const n = loaded.notes[0]!;
    expect(n.id.startsWith('n-')).toBe(true);
    expect(n.title).toBe('grocery list');
    expect(n.body).toBe('eggs\nmilk');
    expect(n.pinned).toBe(false);
    expect(n.createdAt).toBe(T0);
  });

  test('create trims title whitespace; empty/blank title rejected', () => {
    let s = defaultState();
    s = createNote(s, '  jog plan  ', '', T0);
    expect(s.notes[0]?.title).toBe('jog plan');
    for (const bad of ['', '   ']) {
      expect(() => createNote(s, bad, '', T0)).toThrow('title must not be empty');
    }
  });

  test('update touches updatedAt only on real change; unknown id is a no-op', () => {
    let s = defaultState();
    s = createNote(s, 't', 'b', T0);
    const id = s.notes[0]!.id;
    // no-op patch keeps timestamp
    const same = updateNote(s, id, {}, T0 + 5);
    expect(same.notes[0]!.updatedAt).toBe(T0);
    const edited = updateNote(s, id, { body: 'b2' }, T0 + 10);
    expect(edited.notes[0]!.body).toBe('b2');
    expect(edited.notes[0]!.updatedAt).toBe(T0 + 10);
    expect(updateNote(s, 'n-nope', { body: 'x' }, T0 + 99)).toEqual(s);
  });

  test('delete removes exactly one; getNote finds by id', () => {
    let s = defaultState();
    s = createNote(s, 'a', '', T0);
    s = createNote(s, 'b', '', T0 + 1);
    const a = s.notes[0]!;
    expect(getNote(s, a.id)?.title).toBe('a');
    s = deleteNote(s, a.id);
    expect(s.notes.length).toBe(1);
    expect(s.notes[0]!.title).toBe('b');
    expect(getNote(s, a.id)).toBeUndefined();
  });

  test('togglePin flips without touching updatedAt (organizational)', () => {
    let s = defaultState();
    s = createNote(s, 't', 'b', T0);
    const id = s.notes[0]!.id;
    const pinned = togglePin(s, id);
    expect(pinned.notes[0]!.pinned).toBe(true);
    expect(pinned.notes[0]!.updatedAt).toBe(T0);
    expect(togglePin(pinned, id).notes[0]!.pinned).toBe(false);
  });

  test('caps REJECTED with clear errors — never silently truncated', () => {
    const s = defaultState();
    expect(() => createNote(s, 'x'.repeat(MAX_NOTE_TITLE_LEN + 1), '')).toThrow(
      `note title too long (max ${MAX_NOTE_TITLE_LEN})`,
    );
    expect(() => createNote(s, 'ok', 'y'.repeat(MAX_NOTE_BODY_LEN + 1))).toThrow(
      `note body too long (max ${MAX_NOTE_BODY_LEN})`,
    );
    // boundary values pass
    createNote(s, 'x'.repeat(MAX_NOTE_TITLE_LEN), 'y'.repeat(MAX_NOTE_BODY_LEN));
  });
});

describe('sortNotes display order', () => {
  test('pinned first, then updatedAt desc within groups', () => {
    let s = defaultState();
    s = createNote(s, 'old-free', '', T0);
    s = createNote(s, 'new-free', '', T0 + 100);
    s = createNote(s, 'mid-pin', '', T0 + 50);
    s = createNote(s, 'ancient-pin', '', T0 - 999);
    const mp = s.notes.find((n) => n.title === 'mid-pin')!;
    const ap = s.notes.find((n) => n.title === 'ancient-pin')!;
    s = togglePin(s, mp.id);
    s = togglePin(s, ap.id);
    expect(sortNotes(s.notes).map((n) => n.title)).toEqual([
      'mid-pin', // pinned group: newer updatedAt first
      'ancient-pin',
      'new-free',
      'old-free',
    ]);
    // input untouched (pure)
    expect(s.notes.length).toBe(4);
  });
});
