/** One set of a rep-based movement. weight is in Settings.units; null = bodyweight / not tracked. */
export type SetLog = { reps: number; weight: number | null };

export type Exercise = {
  name: string;
  workSec: number;
  restSec: number;
  rounds: number;
  /** Free-text description, e.g. "slow negatives, wide grip". Optional for old data. */
  notes?: string;
  /** Planned sets x reps (target). Empty/missing = timed only. */
  sets?: SetLog[];
};

/** What was actually done for one exercise, stored on a notebook Entry. */
export type ExerciseLog = {
  name: string;
  notes: string;
  sets: SetLog[];
};

/** days: JS weekday numbers, 0 = Sunday … 6 = Saturday. time: "HH:MM" 24h. */
export type Schedule = { days: number[]; time: string };

export type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: Exercise[];
  restBetweenSec: number;
  schedule: Schedule | null;
  lastDoneAt?: string; // ISO
};

export type Stars = 1 | 2 | 3 | 4 | 5;

export type Entry = {
  id: string;
  templateId: string;
  name: string;
  startedAt: string; // ISO
  endedAt: string; // ISO
  plannedSec: number;
  actualSec: number;
  completed: boolean;
  qWhat: string;
  qHowStars: Stars | null;
  qHowNotes: string;
  /** Per-exercise sets/reps actually done. Missing on entries from older versions. */
  exercises?: ExerciseLog[];
  /** true when logged by hand via "Log past workout" rather than the runner. */
  manual?: boolean;
};

export type Settings = {
  defaultWorkSec: number;
  defaultRestSec: number;
  defaultRounds: number;
  keepAwake: boolean;
  sound: boolean;
  haptics: boolean;
  units: 'kg' | 'lb';
};

export const DEFAULT_SETTINGS: Settings = {
  defaultWorkSec: 20,
  defaultRestSec: 10,
  defaultRounds: 8,
  keepAwake: true,
  sound: true,
  haptics: true,
  units: 'kg',
};
