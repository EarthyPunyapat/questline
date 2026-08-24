// M12/T12.C: built-in quest templates + pure instantiation.
// A template bundles a motivating quest title with 3-4 starter task specs;
// instantiateTemplate() expands it into real Quest/Task objects using the
// existing domain factories. Pure — data-in/data-out, no persistence here.
import type { GameState } from '../types/state.ts';
import { createQuest, type Quest } from '../types/quest.ts';
import { createTask, type Difficulty, type Task } from '../types/task.ts';

/** One starter task inside a quest template. */
export interface TaskSpec {
  title: string;
  difficulty: Difficulty;
}

/** A ready-to-instantiate quest chain shown in the quest library overlay. */
export interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  /** Bonus XP granted once when every chained task is done. */
  rewardXp: number;
  tasks: readonly TaskSpec[];
}

export const QUEST_TEMPLATES: readonly QuestTemplate[] = [
  {
    id: 'fitness',
    title: 'Couch to Consistency',
    description: 'Rebuild the movement habit from zero — small reps, honest streaks.',
    rewardXp: 120,
    tasks: [
      { title: 'Walk 20 minutes', difficulty: 'easy' },
      { title: 'Do a 10-min bodyweight circuit', difficulty: 'medium' },
      { title: 'Stretch for 10 minutes', difficulty: 'easy' },
      { title: 'Complete a full workout session', difficulty: 'hard' },
    ],
  },
  {
    id: 'learning',
    title: 'Skill Sprint',
    description: 'One week, one skill — ship a tiny project instead of endless tutorials.',
    rewardXp: 100,
    tasks: [
      { title: 'Skim one intro tutorial end-to-end', difficulty: 'easy' },
      { title: 'Study 3 focused sessions (25 min each)', difficulty: 'medium' },
      { title: 'Build and share a tiny practice project', difficulty: 'hard' },
    ],
  },
  {
    id: 'home',
    title: 'Home Reset Ritual',
    description: 'Reset the nest in one afternoon so the week starts calm.',
    rewardXp: 80,
    tasks: [
      { title: 'Clear and wipe one flat surface', difficulty: 'easy' },
      { title: 'Run one full laundry cycle (wash to fold)', difficulty: 'medium' },
      { title: 'Deep-clean the kitchen or bathroom', difficulty: 'hard' },
    ],
  },
  {
    id: 'career',
    title: 'Career Push Week',
    description: 'Seven days of visible momentum — network, polish, put work out there.',
    rewardXp: 110,
    tasks: [
      { title: 'Update resume or portfolio headline', difficulty: 'easy' },
      { title: 'Reach out to two contacts', difficulty: 'medium' },
      { title: 'Apply to one stretch opportunity', difficulty: 'medium' },
      { title: 'Ship one public piece of work', difficulty: 'hard' },
    ],
  },
  {
    id: 'declutter',
    title: 'Digital Declutter',
    description: 'Tame the tabs, feeds and folders — reclaim attention in one sweep.',
    rewardXp: 60,
    tasks: [
      { title: 'Close every tab; bookmark what matters', difficulty: 'easy' },
      { title: 'Unsubscribe or mute five noisy feeds', difficulty: 'easy' },
      { title: 'Organize downloads and desktop into folders', difficulty: 'medium' },
      { title: 'Do a 24-hour notification fast', difficulty: 'hard' },
    ],
  },
] as const;

/**
 * Result of expanding a template.
 * Success carries the freshly minted quest plus its starter tasks (ids are
 * linked both ways); failures carry a machine-readable reason.
 */
export type InstantiateResult =
  | { quest: Quest; tasks: Task[] }
  | { error: 'unknown-template' | 'duplicate' };

/**
 * Pure expansion of a library template into a live quest chain.
 * - Unknown ids are rejected ({@link InstantiateResult} error branch).
 * - Refuses while a quest with the identical title is still ACTIVE (not yet
 *   rewarded); completing the chain frees the title for a replay run.
 */
export function instantiateTemplate(
  state: GameState,
  templateId: string,
): InstantiateResult {
  const tpl = QUEST_TEMPLATES.find((t) => t.id === templateId);
  if (tpl === undefined) return { error: 'unknown-template' };

  const activeDuplicate = state.quests.some(
    (q) => q.title === tpl.title && !state.completedQuestIds.includes(q.id),
  );
  if (activeDuplicate) return { error: 'duplicate' };

  const quest = createQuest(tpl.title, [], tpl.rewardXp);
  const tasks = tpl.tasks.map((spec) => createTask(spec.title, spec.difficulty, quest.id));
  return { quest: { ...quest, taskIds: tasks.map((t) => t.id) }, tasks };
}
