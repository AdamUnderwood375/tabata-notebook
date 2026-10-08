// One Context + AsyncStorage. Hydrate once, write-through on every change.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Entry, type Schedule, type Settings, type WorkoutTemplate } from './types';
import { remindersSignature, syncReminders } from './notifications';

const K = {
  templates: 'tn.templates.v1',
  entries: 'tn.entries.v1',
  settings: 'tn.settings.v1',
} as const;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type Store = {
  ready: boolean;
  templates: WorkoutTemplate[];
  entries: Entry[]; // newest first
  settings: Settings;
  getTemplate: (id: string) => WorkoutTemplate | undefined;
  getEntry: (id: string) => Entry | undefined;
  saveTemplate: (t: WorkoutTemplate) => void; // upsert
  duplicateTemplate: (id: string) => string | undefined;
  deleteTemplate: (id: string) => void;
  addEntry: (e: Entry) => void; // also stamps template.lastDoneAt
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  deleteEntry: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  wipeAll: () => Promise<void>;
  exportJson: () => string;
};

const Ctx = createContext<Store | null>(null);

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (err) {
    console.warn(`[store] load ${key} failed, using fallback`, err);
    return fallback;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Corrupt schedules become null rather than crashing the schedule helpers. */
function sanitizeSchedule(v: unknown): Schedule | null {
  if (!isObj(v) || !Array.isArray(v.days) || typeof v.time !== 'string') return null;
  const days = v.days.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6);
  return { days, time: v.time };
}

function sanitizeTemplates(v: unknown): WorkoutTemplate[] {
  if (!Array.isArray(v)) return [];
  const out: WorkoutTemplate[] = [];
  for (const raw of v) {
    if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) continue;
    out.push({
      ...(raw as unknown as WorkoutTemplate),
      // Missing/non-array exercises -> empty list, template is still worth keeping.
      exercises: (Array.isArray(raw.exercises) ? raw.exercises : []).filter(isObj) as WorkoutTemplate['exercises'],
      schedule: sanitizeSchedule(raw.schedule),
    });
  }
  return out;
}

/** Newest first; startedAt may be missing or non-string in corrupt data. */
function sanitizeEntries(v: unknown): Entry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((raw): raw is Entry => isObj(raw) && typeof raw.id === 'string' && !!raw.id)
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
}

function sanitizeSettings(v: unknown): Settings {
  return { ...DEFAULT_SETTINGS, ...(isObj(v) ? v : {}) };
}

function persist(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch((err) => console.warn(`[store] save ${key} failed`, err));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // ---- hydrate ----
  useEffect(() => {
    (async () => {
      try {
        const [t, e, s] = await Promise.all([
          load<unknown>(K.templates, []),
          load<unknown>(K.entries, []),
          load<unknown>(K.settings, {}),
        ]);
        setTemplates(sanitizeTemplates(t));
        setEntries(sanitizeEntries(e));
        setSettings(sanitizeSettings(s));
      } catch (err) {
        console.warn('[store] hydration failed, resetting to defaults', err);
        setTemplates([]);
        setEntries([]);
        setSettings({ ...DEFAULT_SETTINGS });
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // ---- persist (write-through after hydration) ----
  useEffect(() => {
    if (ready) persist(K.templates, templates);
  }, [ready, templates]);
  useEffect(() => {
    if (ready) persist(K.entries, entries);
  }, [ready, entries]);
  useEffect(() => {
    if (ready) persist(K.settings, settings);
  }, [ready, settings]);

  // ---- keep OS reminders in sync with template schedules ----
  const lastSig = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const sig = remindersSignature(templates);
    if (sig === lastSig.current) return; // lastDoneAt changes etc. don't reschedule
    syncReminders(templates).then((applied) => {
      // Only latch when the schedule actually landed, else a denied permission
      // would freeze the sig and we'd never retry after it's granted.
      if (applied) lastSig.current = sig;
    });
  }, [ready, templates]);

  const getTemplate = useCallback((id: string) => templates.find((t) => t.id === id), [templates]);
  const getEntry = useCallback((id: string) => entries.find((e) => e.id === id), [entries]);

  const saveTemplate = useCallback((t: WorkoutTemplate) => {
    setTemplates((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [...prev, t];
      const next = [...prev];
      next[i] = t;
      return next;
    });
  }, []);

  const duplicateTemplate = useCallback(
    (id: string) => {
      const src = templates.find((t) => t.id === id);
      if (!src) return undefined;
      const copy: WorkoutTemplate = {
        ...src,
        id: newId(),
        name: `${src.name} copy`,
        exercises: src.exercises.map((e) => ({ ...e })),
        schedule: null, // a copy shouldn't double-fire the original's reminders
        lastDoneAt: undefined,
      };
      setTemplates((prev) => {
        const i = prev.findIndex((t) => t.id === id);
        if (i === -1) return prev;
        const next = [...prev];
        next.splice(i + 1, 0, copy);
        return next;
      });
      return copy.id;
    },
    [templates],
  );

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addEntry = useCallback((e: Entry) => {
    setEntries((prev) => [e, ...prev.filter((x) => x.id !== e.id)]);
    setTemplates((prev) => prev.map((t) => (t.id === e.templateId ? { ...t, lastDoneAt: e.endedAt } : t)));
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch, id } : e)));
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const wipeAll = useCallback(async () => {
    setTemplates([]);
    setEntries([]);
    setSettings({ ...DEFAULT_SETTINGS });
    try {
      await AsyncStorage.multiRemove(Object.values(K));
    } catch (err) {
      console.warn('[store] wipeAll failed to clear storage', err);
    }
  }, []);

  const exportJson = useCallback(
    () =>
      JSON.stringify(
        { app: 'tabata-notebook', version: 1, exportedAt: new Date().toISOString(), settings, templates, entries },
        null,
        2,
      ),
    [settings, templates, entries],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      templates,
      entries,
      settings,
      getTemplate,
      getEntry,
      saveTemplate,
      duplicateTemplate,
      deleteTemplate,
      addEntry,
      updateEntry,
      deleteEntry,
      updateSettings,
      wipeAll,
      exportJson,
    }),
    [ready, templates, entries, settings, getTemplate, getEntry, saveTemplate, duplicateTemplate, deleteTemplate, addEntry, updateEntry, deleteEntry, updateSettings, wipeAll, exportJson],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
