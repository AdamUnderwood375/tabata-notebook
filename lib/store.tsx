// One Context + AsyncStorage. Hydrate once, write-through on every change.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Entry, type Settings, type WorkoutTemplate } from './types';
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
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // ---- hydrate ----
  useEffect(() => {
    (async () => {
      const [t, e, s] = await Promise.all([
        load<WorkoutTemplate[]>(K.templates, []),
        load<Entry[]>(K.entries, []),
        load<Partial<Settings>>(K.settings, {}),
      ]);
      setTemplates(Array.isArray(t) ? t : []);
      setEntries(Array.isArray(e) ? [...e].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : []);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setReady(true);
    })();
  }, []);

  // ---- persist (write-through after hydration) ----
  useEffect(() => {
    if (ready) AsyncStorage.setItem(K.templates, JSON.stringify(templates)).catch(() => {});
  }, [ready, templates]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(K.entries, JSON.stringify(entries)).catch(() => {});
  }, [ready, entries]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(K.settings, JSON.stringify(settings)).catch(() => {});
  }, [ready, settings]);

  // ---- keep OS reminders in sync with template schedules ----
  const lastSig = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const sig = remindersSignature(templates);
    if (sig === lastSig.current) return; // lastDoneAt changes etc. don't reschedule
    lastSig.current = sig;
    syncReminders(templates);
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
    setSettings(DEFAULT_SETTINGS);
    await AsyncStorage.multiRemove(Object.values(K));
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
