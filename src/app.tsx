import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { loadState, saveStateAtomic, statePath } from './store/persist.ts';
import {
  addTask,
  canDelete,
  deleteTask,
  getTask,
  selectNextId,
  sortedForDisplay,
  toggleDone,
} from './store/tasks.ts';
import type { Difficulty } from './types/task.ts';
import { advanceStreak, localDateStr, streakMultiplier } from './xp/streaks.ts';
import { awardXp } from './xp/engine.ts';
import { awardQuestIfComplete } from './xp/quests.ts';
import {
  awardDailyBonusIfComplete,
  ensureDailySet,
  skipDaily,
  todayDailies,
} from './xp/daily.ts';
import { applyRecurrenceRollover } from './xp/recurrence.ts';
import { evaluateAchievements } from './xp/achievements.ts';
import { formatXpGain } from './xp/format.ts';
import { levelCurve } from './xp/levels.ts';
import { resolveController, type MediaController } from './media/controller.ts';
import {
  createMediaSession,
  type ActiveMediaSession,
  type PlayerChoice,
} from './media/session.ts';
import { cycleTheme } from './ui/theme.ts';
import { Header } from './ui/layout/Header.tsx';
import { TaskList } from './ui/layout/TaskList.tsx';
import { Dailies } from './ui/layout/Dailies.tsx';
import { AddTaskModal } from './ui/layout/AddTaskModal.tsx';
import { Footer } from './ui/layout/Footer.tsx';
import { LevelUpToast } from './ui/layout/LevelUpToast.tsx';
import { HelpOverlay } from './ui/layout/HelpOverlay.tsx';
import { StatsView } from './views/StatsView.tsx';
import { NowPlaying, type PlayerSnapshot } from './ui/layout/NowPlaying.tsx';
import { Calendar } from './ui/layout/Calendar.tsx';
import { Notes } from './ui/layout/Notes.tsx';
import { NoteEditor } from './ui/layout/NoteEditor.tsx';
import { createNote, deleteNote, sortNotes, togglePin, updateNote } from './store/notes.ts';
import type { Note } from './types/state.ts';
import {
  POMODORO_SECS,
  POMODORO_XP,
  isPomodoroComplete,
  tickRemaining,
} from './pomodoro/logic.ts';

type Mode = 'normal' | 'adding' | 'help' | 'notes';

export function App(): React.ReactElement {
  const { exit } = useApp();
  // Boot: load (v1 saves migrated transparently), roll today's daily set BEFORE
  // first render; a rollover/migration is persisted immediately so archives
  // survive even if the user quits idle.
  const [state, setState] = useState(() => {
    const loaded = loadState();
    const today = localDateStr();
    // v3: roll dailies AND reopen recurring tasks whose window elapsed.
    let next = ensureDailySet(loaded, today);
    next = applyRecurrenceRollover(next, today);
    if (next !== loaded) {
      try {
        saveStateAtomic(next, statePath());
      } catch {
        /* boot continues; next commit persists */
      }
    }
    return next;
  });
  // Selection spans dailies + tasks: j/k traverses both sections in one list.
  const navOrder = useMemo(
    () => [...todayDailies(state), ...sortedForDisplay(state.tasks.filter((t) => !t.isDaily))],
    [state.tasks, state.dailies],
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(() => navOrder[0]?.id);
  const [mode, setMode] = useState<Mode>('normal');
  const [showStats, setShowStats] = useState(false);
  const [, bumpThemeTick] = useState(0);
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null);
  // M9: transient blocker notice (e.g. 'd' on a daily); auto-clears in 2s.
  const [flash, setFlash] = useState<{ key: number; text: string } | null>(null);
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null);
  const [controller, setController] = useState<MediaController | null>(null);
  const playerBusRef = React.useRef<string | null>(null);
  // T8.3: multi-player session wraps the raw controller (tab switching).
  const mediaRef = React.useRef<ActiveMediaSession | null>(null);
  const [players, setPlayers] = useState<readonly PlayerChoice[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  // M10: calendar panel replaces the board exactly like stats does.
  const [showCal, setShowCal] = useState(false);
  // Calendar cursor (‹ › month paging); resets to the current month on open.
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  // M10: notes overlay — list cursor + open editor ({note} edit, {} new).
  const [noteSel, setNoteSel] = useState(0);
  const [noteEdit, setNoteEdit] = useState<{ note?: Note } | null>(null);
  // M10/T10.D: null = no session; remainingSec===0 && !running = finished.
  const [pomo, setPomo] = useState<{ remainingSec: number; running: boolean } | null>(null);
  const pomoAwardedRef = React.useRef(false);

  // M3: resolve a media controller once, then poll snapshots (1s — cheap busctl/dbus reads).
  useEffect(() => {
    let alive = true;
    let ctl: MediaController | null = null;
    const tick = async (): Promise<void> => {
      if (!ctl) {
        ctl = await resolveController();
        if (alive) setController(ctl);
        if (ctl) {
          const media = createMediaSession(ctl);
          mediaRef.current = media;
          await media.autoPick(); // default stays auto-first (T8.2 semantics)
        }
      }
      const media = mediaRef.current;
      if (!ctl || !media || !alive) return;
      const snap = await media.snapshotActive();
      if (alive) {
        setPlayer(snap);
        setPlayers(media.players);
        setActiveLabel(media.activeLabel);
        playerBusRef.current = media.activeName;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // M9: flash auto-dismiss timer; canceled on change/unmount (no leaks).
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2000);
    return () => clearTimeout(id);
  }, [flash]);

  const regularTasks = useMemo(
    () => sortedForDisplay(state.tasks.filter((t) => !t.isDaily)),
    [state.tasks],
  );

  const persist = useCallback((next: typeof state) => {
    try {
      saveStateAtomic(next, statePath());
    } catch {
      /* keep TUI alive on transient IO errors */
    }
  }, []);

  const commit = useCallback(
    (next: typeof state) => {
      setState(next);
      persist(next);
    },
    [persist],
  );

  /** Completion pipeline: streak → multiplier → XP → quest bonus → toasts. */
  const completePipeline = useCallback(
    (prev: typeof state, taskId: string): typeof state => {
      const task = getTask(prev, taskId);
      if (!task) return prev;
      const levelBefore = levelCurve(prev.profile.totalXp).level;

      // 1. streak evolution
      const today = localDateStr();
      const { profile: streaked } = advanceStreak(prev.profile, today);
      let next: typeof state = { ...prev, profile: streaked };

      // 2. XP with streak multiplier
      const mult = streakMultiplier(streaked.streakDays);
      next = {
        ...next,
        profile: { ...next.profile, totalXp: awardXp(next.profile.totalXp, task, mult) },
      };

      // 3. quest bonuses (exactly-once each)
      const messages: string[] = [];
      for (const q of next.quests) {
        if (!q.taskIds.includes(taskId)) continue;
        const res = awardQuestIfComplete(next, q);
        next = res.state;
        if (res.awarded) messages.push(`Quest complete: ${q.title} +${res.xp} XP!`);
      }

      // 4. daily all-done bonus (+50, exactly-once via completedAll)
      const dailyRes = awardDailyBonusIfComplete(next, today);
      next = dailyRes.state;
      if (dailyRes.awarded) messages.push(`☀ All dailies done! +${dailyRes.xp} XP bonus`);

      // 4.5 achievements post-event: exactly-once unlocks w/ timestamps.
      const achRes = evaluateAchievements(next);
      next = achRes.state;
      for (const a of achRes.unlocked) messages.push(`🏆 Achievement: ${a.title}`);

      // 5. notifications — XP line derives from the ACTUAL totalXp delta so
      // toast always matches persisted state (S7.1.1; see xp/format.ts).
      const levelAfter = levelCurve(next.profile.totalXp).level;
      if (levelAfter > levelBefore) messages.unshift(`LEVEL UP → ${levelAfter}!`);
      const gainedXp = next.profile.totalXp - prev.profile.totalXp;
      messages.push(formatXpGain(gainedXp, mult));
      setToast({ key: Date.now(), message: messages.join('  ') });
      return next;
    },
    [],
  );

  // M10/T10.D: 1s ticker while running; auto-stops when the clock hits zero.
  useEffect(() => {
    if (!pomo?.running) return;
    const id = setInterval(() => {
      setPomo((prev) => {
        if (!prev || !prev.running) return prev;
        const nr = tickRemaining(prev.remainingSec);
        return { ...prev, remainingSec: nr, running: nr > 0 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pomo?.running]);

  // M10/T10.D: flat +15 XP exactly once per completed session. Persisted
  // lastPomodoroAwardedAt marker guards double-award across restarts; the
  // in-process ref guards re-entrant effect runs.
  useEffect(() => {
    if (!pomo || pomo.running || !isPomodoroComplete(pomo.remainingSec)) return;
    const today = localDateStr();
    const claimable =
      !pomoAwardedRef.current && state.profile.lastPomodoroAwardedAt !== today;
    if (claimable) {
      pomoAwardedRef.current = true;
      const levelBefore = levelCurve(state.profile.totalXp).level;
      const next: typeof state = {
        ...state,
        profile: {
          ...state.profile,
          totalXp: state.profile.totalXp + POMODORO_XP,
          lastPomodoroAwardedAt: today,
        },
      };
      commit(next);
      const levelAfter = levelCurve(next.profile.totalXp).level;
      const parts: string[] = [];
      if (levelAfter > levelBefore) parts.push(`LEVEL UP → ${levelAfter}!`);
      parts.push(formatXpGain(POMODORO_XP, 1));
      setToast({ key: Date.now(), message: parts.join('  ') });
      setFlash({ key: Date.now(), text: '🍅 Pomodoro complete!' });
    } else {
      setFlash({ key: Date.now(), text: '🍅 Pomodoro done — daily +15xp already claimed' });
    }
    setPomo(null); // hide the finished timer; next 'p' starts a fresh session
  }, [pomo, state, commit]);

  useInput(
    (input, key) => {
      if (mode !== 'normal') return; // modal owns the keyboard
      if (input === 'q') return exit();

      // M10: while the calendar panel is open, ←/→ page months instead of
      // moving task selection (Date overflow handles the year rollover).
      if (showCal && (key.leftArrow || input === 'h')) {
        return setCalCursor((c) => {
          const d = new Date(c.y, c.m - 1, 1);
          return { y: d.getFullYear(), m: d.getMonth() };
        });
      }
      if (showCal && (key.rightArrow || input === 'l')) {
        return setCalCursor((c) => {
          const d = new Date(c.y, c.m + 1, 1);
          return { y: d.getFullYear(), m: d.getMonth() };
        });
      }

      if (key.upArrow || input === 'k') {
        const idx = navOrder.findIndex((t) => t.id === selectedId);
        if (idx > 0) setSelectedId(navOrder[idx - 1]!.id);
        return;
      }
      if (key.downArrow || input === 'j') {
        const idx = navOrder.findIndex((t) => t.id === selectedId);
        if (idx >= 0 && idx < navOrder.length - 1) setSelectedId(navOrder[idx + 1]!.id);
        return;
      }
      if (key.return && selectedId) {
        const before = getTask(state, selectedId);
        const after = toggleDone(state, selectedId);
        // Commit the FULL pipeline result (streak + XP + quest bonus) on
        // todo→done; un-completing needs only the raw toggle.
        if (before && before.status === 'todo') {
          // Pipeline handles streak/XP/quest-bonus/daily-bonus + toast messages.
          commit(completePipeline(after, selectedId));
        } else {
          commit(after);
        }
        return;
      }
      if (input === 'a') {
        setMode('adding');
        return;
      }
      // Dailies are system-generated: deleting one would orphan today's set.
      // M9: the block is no longer silent — flash explains it; 'x' dismisses.
      if (input === 'd' || key.delete) {
        const task = selectedId ? getTask(state, selectedId) : undefined;
        const perm = canDelete(task);
        if (!perm.ok) {
          setFlash({ key: Date.now(), text: perm.reason ?? 'Blocked.' });
          return;
        }
        // Selection continuity (M9): land on whatever row takes the deleted
        // slot, clamped to the tail. Only an empty board drops selection.
        const nextSel = selectNextId(navOrder.map((t) => t.id), selectedId!);
        commit(deleteTask(state, selectedId!));
        setSelectedId(nextSel);
        return;
      }
      // M9: 'x' dismisses the selected daily for today — hidden from board +
      // bonus math, restored by tomorrow's fresh set. Same continuity rule.
      if (input === 'x' && selectedId) {
        // M9: on anything but a daily, explain instead of silently doing nothing.
        if (!getTask(state, selectedId)?.isDaily) {
          setFlash({ key: Date.now(), text: 'x dismisses dailies only — use d to delete a task.' });
          return;
        }
        const nextSel = selectNextId(navOrder.map((t) => t.id), selectedId);
        commit(skipDaily(state, selectedId));
        setSelectedId(nextSel);
        return;
      }
      if (input === '?') return setMode('help');
      if (input === 'v') return setShowStats((s) => !s);
      // M10: calendar panel toggle (independent of stats); opens on today.
      if (input === 'c') {
        const d = new Date();
        setCalCursor({ y: d.getFullYear(), m: d.getMonth() });
        return setShowCal((s) => !s);
      }
      // M10: notes overlay — uppercase only; lowercase n stays media-next.
      if (input === 'N') {
        setNoteSel(0);
        return setMode('notes');
      }
      // M10/T10.D: start a fresh 25:00 or pause/resume the current one.
      if (input === 'p') {
        setPomo((prev) =>
          prev
            ? { ...prev, running: !prev.running && prev.remainingSec > 0 }
            : { remainingSec: POMODORO_SECS, running: true },
        );
        return;
      }
      if (input === 't') {
        cycleTheme();
        bumpThemeTick((n) => n + 1);
        return;
      }
      if (key.escape) {
        setShowStats(false);
        setShowCal(false);
        return;
      }
      // T8.3: tab cycles between visible players (>1 only; sticky choice).
      if (key.tab && mediaRef.current && players.length > 1) {
        const media = mediaRef.current;
        const list = [...players];
        const i = list.findIndex((p) => p.name === media.activeName);
        const next = list[(i + 1 + list.length) % list.length]!;
        void media.switchTo(next.name);
        return;
      }
      // M3 transport keys (only when a live player is known)
      if (controller && player) {
        if (input === ' ') return void mediaRef.current?.send('playPause');
        if (input === 'n') return void mediaRef.current?.send('next');
        if (input === 'b') return void mediaRef.current?.send('prev');
      }
    },
    { isActive: mode === 'normal' },
  );

  // M10: keys for the notes LIST (the editor owns input once it opens).
  useInput(
    (input, key) => {
      const sorted = sortNotes(state.notes);
      if (input === 'q' || key.escape) {
        setNoteEdit(null);
        return setMode('normal');
      }
      if (input === 'n') return setNoteEdit({});
      if (input === 'j' || key.downArrow) {
        return setNoteSel((i) => Math.min(sorted.length - 1, i + 1));
      }
      if (input === 'k' || key.upArrow) return setNoteSel((i) => Math.max(0, i - 1));
      const sel = sorted[noteSel];
      if (!sel) return;
      if (input === 'e' || key.return) return setNoteEdit({ note: sel });
      if (input === 'p') return commit(togglePin(state, sel.id));
      if (input === 'd' || key.delete) {
        commit(deleteNote(state, sel.id));
        setNoteSel((i) => Math.max(0, Math.min(i, sorted.length - 2)));
      }
    },
    { isActive: mode === 'notes' && noteEdit === null },
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Header profile={state.profile} pomodoro={pomo ?? undefined} />
      {showStats ? (
        <Box borderStyle="round" borderColor="cyan">
          <StatsView state={state} />
        </Box>
      ) : showCal ? (
        <Calendar state={state} year={calCursor.y} monthIdx={calCursor.m} bordered />
      ) : (
        <Box gap={2}>
          <Box borderStyle="round" borderColor="green" flexDirection="column" width="62%">
            <Text bold color="green">
              TASKS (
              {state.tasks.filter((t) => t.status === 'todo' && !t.isDaily).length}/
              {regularTasks.length} open)
            </Text>
            <Box paddingX={1}>
              <Dailies
                tasks={todayDailies(state)}
                set={state.dailies}
                selectedId={selectedId}
              />
            </Box>
            <TaskList tasks={regularTasks} selectedId={selectedId} />
          </Box>
          <NowPlaying player={player} players={players} activeLabel={activeLabel} />
        </Box>
      )}
      {toast && (
        <LevelUpToast key={toast.key} message={toast.message} onDone={() => setToast(null)} />
      )}
      {flash && (
        <Text dimColor color="yellow">
          {flash.text}
        </Text>
      )}
      {mode === 'help' ? (
        <HelpOverlay onDone={() => setMode('normal')} />
      ) : mode === 'adding' ? (
        <AddTaskModal
          onSubmit={(title, difficulty: Difficulty, recurrence) => {
            // Select from the NEXT state — the pre-add `state` closure would
            // never contain the new task (SYNC-2).
            const next = addTask(state, title, difficulty, undefined, recurrence);
            commit(next);
            setMode('normal');
            setSelectedId(sortedForDisplay(next.tasks).at(-1)?.id ?? undefined);
          }}
          onCancel={() => setMode('normal')}
        />
      ) : mode === 'notes' ? (
        noteEdit ? (
          <NoteEditor
            initial={noteEdit.note}
            onSave={(title, body) => {
              commit(
                noteEdit.note
                  ? updateNote(state, noteEdit.note.id, { title, body }, Date.now())
                  : createNote(state, title, body, Date.now()),
              );
              setNoteEdit(null);
            }}
            onCancel={() => setNoteEdit(null)}
          />
        ) : (
          <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
            <Text bold color="cyan">
              NOTES
            </Text>
            <Notes notes={state.notes} />
            <Text dimColor>
              n new · enter/e edit · p pin · d delete · j/k move · esc back
            </Text>
          </Box>
        )
      ) : (
        <Footer />
      )}
    </Box>
  );
}
