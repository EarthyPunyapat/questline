// Daily-quest template pool. Deterministic per-date selection picks from here.
// Difficulty kept to easy/medium per spec ("difficulty mixed easy/medium").
import type { Difficulty } from '../types/task.ts';

export interface DailyTemplate {
  title: string;
  difficulty: Difficulty;
}

export const DAILY_TEMPLATES: readonly DailyTemplate[] = [
  { title: 'Take a 30-min focus block', difficulty: 'medium' },
  { title: 'Inbox zero sweep', difficulty: 'easy' },
  { title: 'Plan tomorrow tonight', difficulty: 'easy' },
  { title: 'Move your body', difficulty: 'medium' },
  { title: 'Learn something new', difficulty: 'medium' },
  { title: 'Tidy one space', difficulty: 'easy' },
  { title: 'Hydrate check — 8 glasses', difficulty: 'easy' },
  { title: 'Ship something small', difficulty: 'medium' },
] as const;
