// Note CRUD over GameState — immutable updates; caller persists via
// saveStateAtomic. Validation policy (M10/T10.B): user-facing mutations
// REJECT over-long input by throwing — nothing is ever silently truncated.
// (The disk loader clamps instead, so hand-edited saves lose characters,
// never whole notes.)
import { randomUUID } from 'node:crypto';
import {
  MAX_NOTE_BODY_LEN,
  MAX_NOTE_TITLE_LEN,
  type GameState,
  type Note,
} from '../types/state.ts';

/** Throw with a clear message when a title violates the cap. */
export function validateTitle(title: string): void {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('note title must not be empty');
  }
  if (title.length > MAX_NOTE_TITLE_LEN) {
    throw new Error(`note title too long (max ${MAX_NOTE_TITLE_LEN})`);
  }
}

/** Throw with a clear message when a body violates the cap. */
export function validateBody(body: string): void {
  if (typeof body !== 'string') throw new Error('note body must be a string');
  if (body.length > MAX_NOTE_BODY_LEN) {
    throw new Error(`note body too long (max ${MAX_NOTE_BODY_LEN})`);
  }
}

function nextId(): string {
  return `n-${randomUUID().slice(0, 8)}`;
}

export function createNote(
  state: GameState,
  title: string,
  body: string = '',
  now: number = Date.now(),
): GameState {
  validateTitle(title);
  validateBody(body);
  const note: Note = {
    id: nextId(),
    title: title.trim(),
    body,
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
  return { ...state, notes: [...state.notes, note] };
}

export interface NotePatch {
  title?: string;
  body?: string;
}

/**
 * Content edit: applies the patch and touches `updatedAt` ONLY when something
 * actually changed. Unknown id → state unchanged (defensive no-op).
 */
export function updateNote(
  state: GameState,
  id: string,
  patch: NotePatch,
  now: number = Date.now(),
): GameState {
  const current = getNote(state, id);
  if (!current) return state;
  const title = patch.title ?? current.title;
  const body = patch.body ?? current.body;
  validateTitle(title);
  validateBody(body);
  const changed = title !== current.title || body !== current.body;
  return {
    ...state,
    notes: state.notes.map((n) =>
      n.id === id ? { ...n, title, body, updatedAt: changed ? now : n.updatedAt } : n,
    ),
  };
}

export function deleteNote(state: GameState, id: string): GameState {
  return { ...state, notes: state.notes.filter((n) => n.id !== id) };
}

/** Pin toggle is organizational — updatedAt deliberately NOT touched. */
export function togglePin(state: GameState, id: string): GameState {
  return {
    ...state,
    notes: state.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
  };
}

export function getNote(state: GameState, id: string): Note | undefined {
  return state.notes.find((n) => n.id === id);
}

/**
 * Display order: pinned first; within each group most-recently-updated wins.
 * Stable for equal keys (Array.sort is stable in modern runtimes).
 */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
