// Pure phase math. No React, no timers — easy to reason about and test.
import type { Schedule, WorkoutTemplate } from './types';

export type PhaseKind = 'prepare' | 'work' | 'rest' | 'between';

export type Phase = {
  kind: PhaseKind;
  durationSec: number;
  exerciseIndex: number; // exercise this phase belongs to (between = tail of the finished exercise)
  round: number; // 1-based; 0 for prepare
  totalRounds: number;
};

export const PREPARE_SEC = 3;

/**
 * prepare(3s) → for each exercise, for each round: work → rest.
 * The last round of an exercise has no intra-exercise rest; it is followed by
 * `restBetweenSec` instead (if there is a next exercise and it is > 0).
 * The very last work phase ends the workout — no trailing rest.
 */
export function buildPhases(t: WorkoutTemplate, prepareSec = PREPARE_SEC): Phase[] {
  const out: Phase[] = [];
  const ex = t.exercises.filter((e) => e.workSec > 0 && e.rounds > 0);
  if (ex.length === 0) return out;
  if (prepareSec > 0) {
    out.push({
      kind: 'prepare',
      durationSec: prepareSec,
      exerciseIndex: t.exercises.indexOf(ex[0]),
      round: 0,
      totalRounds: ex[0].rounds,
    });
  }
  ex.forEach((e, i) => {
    const exerciseIndex = t.exercises.indexOf(e);
    for (let r = 1; r <= e.rounds; r++) {
      out.push({ kind: 'work', durationSec: e.workSec, exerciseIndex, round: r, totalRounds: e.rounds });
      const lastRound = r === e.rounds;
      if (!lastRound && e.restSec > 0) {
        out.push({ kind: 'rest', durationSec: e.restSec, exerciseIndex, round: r, totalRounds: e.rounds });
      }
      if (lastRound && i < ex.length - 1 && t.restBetweenSec > 0) {
        out.push({ kind: 'between', durationSec: t.restBetweenSec, exerciseIndex, round: r, totalRounds: e.rounds });
      }
    }
  });
  return out;
}

/** Planned workout length in seconds, excluding the prepare countdown. */
export function totalSec(t: WorkoutTemplate): number {
  return buildPhases(t, 0).reduce((s, p) => s + p.durationSec, 0);
}

/** Index of the next work phase after `i` (i.e. the next round). -1 if none. */
export function nextRoundIndex(phases: Phase[], i: number): number {
  for (let j = i + 1; j < phases.length; j++) if (phases[j].kind === 'work') return j;
  return -1;
}

/** Index of the first work phase of the next exercise after phase `i`. -1 if none. */
export function nextExerciseIndex(phases: Phase[], i: number): number {
  const cur = phases[i]?.exerciseIndex ?? -1;
  for (let j = i + 1; j < phases.length; j++) {
    if (phases[j].kind === 'work' && phases[j].exerciseIndex > cur) return j;
  }
  return -1;
}

/** Sum of durations of phases strictly after `i` (excluding prepare). */
export function remainingAfter(phases: Phase[], i: number): number {
  let s = 0;
  for (let j = i + 1; j < phases.length; j++) s += phases[j].durationSec;
  return s;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

// ---------- schedule helpers (pure) ----------

/** Display order: Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  return { hour: Number.isFinite(h) ? h : 7, minute: Number.isFinite(m) ? m : 0 };
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function scheduleLabel(s: Schedule | null): string | null {
  if (!s || s.days.length === 0) return null;
  const set = new Set(s.days);
  let days: string;
  if (set.size === 7) days = 'Daily';
  else if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) days = 'Weekdays';
  else if (set.size === 2 && set.has(0) && set.has(6)) days = 'Weekends';
  else days = WEEK_ORDER.filter((d) => set.has(d)).map((d) => DAY_SHORT[d]).join('/');
  return `${days} ${s.time}`;
}

export function nextFireTimes(s: Schedule | null, from: Date, n = 3): Date[] {
  if (!s || s.days.length === 0) return [];
  const { hour, minute } = parseTime(s.time);
  const out: Date[] = [];
  for (let d = 0; d < 15 && out.length < n; d++) {
    const c = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d, hour, minute, 0, 0);
    if (s.days.includes(c.getDay()) && c.getTime() > from.getTime()) out.push(c);
  }
  return out;
}

export function relativeDay(iso: string | undefined, now = new Date()): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
