export type Exercise = {
  name: string;
  workSec: number;
  restSec: number;
  rounds: number;
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
