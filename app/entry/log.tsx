// Log a workout done outside the app. Produces an entry identical to one the runner saved.
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { newId, useStore } from '@/lib/store';
import { SetsEditor, copyLogs, logsFromExercises } from '@/lib/sets';
import { totalSec } from '@/lib/timer';
import { C, Stars, Stepper } from '@/lib/ui';
import type { Entry, ExerciseLog, Stars as StarsT, WorkoutTemplate } from '@/lib/types';

/** Standard iOS header height — keep lifted content clear of it. */
const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 0;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export default function LogPastWorkout() {
  const { templates, settings, addEntry } = useStore();

  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  // Default: the hour just started — a past workout, not "right now, mid-set".
  const [when, setWhen] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), 0, 0, 0);
  });
  const [min, setMin] = useState(30);
  const [completed, setCompleted] = useState(true);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [qWhat, setQWhat] = useState('');
  const [stars, setStars] = useState<StarsT | null>(null);
  const [qHowNotes, setQHowNotes] = useState('');

  const pick = (t: WorkoutTemplate | null) => {
    if (!t) {
      setTemplateId('');
      return;
    }
    setTemplateId(t.id);
    setName(t.name);
    setExercises(logsFromExercises(t.exercises));
    setMin(Math.max(1, Math.round(totalSec(t) / 60)));
  };

  const patchEx = (i: number, p: Partial<ExerciseLog>) =>
    setExercises((xs) => copyLogs(xs.map((x, j) => (j === i ? { ...x, ...p } : x))));

  const at = (dayOffset: number, hour: number, minute: number) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, minute, 0, 0);
  };
  const shiftDay = (n: number) => setWhen((w) => atFrom(w, n));
  const jumpDay = (n: number) => setWhen((w) => at(n, w.getHours(), w.getMinutes()));
  const setHM = (h: number, m: number) => setWhen((w) => atFrom(w, 0, h, m));

  const now = new Date();
  // Don't let the stepper walk past today — a past workout can't start tomorrow.
  const canForward = atFrom(when, 1).getTime() <= now.getTime();
  const today = startOfDay(now);

  const canSave = name.trim() !== '';
  const saving = useRef(false);

  const save = () => {
    if (!canSave || saving.current) return;
    saving.current = true; // one tap = one entry = one navigation
    const stamp = new Date();
    const started = when.getTime() > stamp.getTime() ? stamp : when; // never log a future start
    const actualSec = min * 60;
    const template = templates.find((t) => t.id === templateId);
    // Always plan longer than actual unless the whole thing was finished — "stopped early" must never read 100%.
    const plannedSec = Math.max(
      template ? totalSec(template) : 0,
      completed ? actualSec : Math.round(actualSec * 1.25)
    );
    const entry: Entry = {
      id: newId(),
      templateId,
      name: name.trim(),
      startedAt: started.toISOString(),
      endedAt: new Date(started.getTime() + min * 60000).toISOString(),
      plannedSec,
      actualSec,
      completed,
      qWhat,
      qHowStars: stars,
      qHowNotes,
      exercises: exercises
        .map((x) => ({ name: x.name.trim(), notes: x.notes.trim(), sets: x.sets.filter((y) => y.reps > 0) }))
        // clean up first, then keep what still says something
        .filter((x) => x.name !== '' || x.sets.length > 0),
      manual: true,
    };
    addEntry(entry);
    router.replace({ pathname: '/entry/[id]', params: { id: entry.id } });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={HEADER_HEIGHT}
    >
      <Stack.Screen
        options={{
          title: 'Log past workout',
          headerLeft: () => (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              hitSlop={8}
            >
              <Text style={s.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} disabled={!canSave} hitSlop={8}>
              <Text style={[s.headerBtn, { fontWeight: '700', color: canSave ? C.accent : C.faint }]}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 8 }}>
          <Text style={s.label}>From template</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="None" on={templateId === ''} onPress={() => pick(null)} />
            {templates.map((t) => (
              <Chip key={t.id} label={t.name} on={templateId === t.id} onPress={() => pick(t)} />
            ))}
          </ScrollView>
        </View>

        <View>
          <Text style={s.label}>Name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Gym session"
            placeholderTextColor={C.faint}
            returnKeyType="done"
          />
        </View>

        <View style={[s.card, { gap: 14 }]}>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Date</Text>
            <View style={s.dateRow}>
              <Pressable onPress={() => shiftDay(-1)} hitSlop={8} accessibilityLabel="Previous day">
                <Ionicons name="chevron-back" size={22} color={C.dim} />
              </Pressable>
              <Text style={s.dateText} numberOfLines={1}>
                {when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <Pressable
                onPress={() => shiftDay(1)}
                disabled={!canForward}
                hitSlop={8}
                accessibilityLabel="Next day"
              >
                <Ionicons name="chevron-forward" size={22} color={canForward ? C.dim : C.border} />
              </Pressable>
            </View>
          </View>
          <View style={s.quickRow}>
            <Chip label="Today" on={startOfDay(when) === today} onPress={() => jumpDay(0)} />
            <Chip label="Yesterday" on={startOfDay(when) === startOfDay(at(-1, 12, 0))} onPress={() => jumpDay(-1)} />
          </View>
          <Field label="Time">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Stepper value={when.getHours()} onChange={(h) => setHM(h, when.getMinutes())} min={0} max={23} step={1} />
              <Text style={{ color: C.text, fontSize: 18 }}>:</Text>
              <Stepper value={when.getMinutes()} onChange={(m) => setHM(when.getHours(), m)} min={0} max={55} step={5} />
            </View>
          </Field>
        </View>

        <View style={s.card}>
          <Field label="Duration">
            <Stepper value={min} onChange={setMin} min={1} max={600} step={5} suffix="min" />
          </Field>
          <View style={[s.fieldRow, { marginTop: 10 }]}>
            <Text style={s.fieldLabel}>Finished the whole thing</Text>
            <Switch value={completed} onValueChange={setCompleted} trackColor={{ true: C.accent }} />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={s.label}>Exercises</Text>
          {exercises.map((x, i) => (
            <View key={i} style={s.exCard}>
              <View style={s.exHead}>
                <TextInput
                  style={[s.input, { flex: 1, minWidth: 0, paddingVertical: 8 }]}
                  value={x.name}
                  onChangeText={(v) => patchEx(i, { name: v })}
                  placeholder={`Exercise ${i + 1}`}
                  placeholderTextColor={C.faint}
                  accessibilityLabel={`Exercise ${i + 1} name`}
                />
                <Pressable
                  hitSlop={6}
                  onPress={() => setExercises((xs) => xs.filter((_, j) => j !== i))}
                  accessibilityLabel={`Remove exercise ${x.name || i + 1}`}
                >
                  <Ionicons name="trash-outline" size={19} color={C.danger} />
                </Pressable>
              </View>
              <TextInput
                style={[s.input, { minHeight: 56 }]}
                multiline
                value={x.notes}
                onChangeText={(v) => patchEx(i, { notes: v })}
                placeholder="Description / how it went"
                placeholderTextColor={C.faint}
                textAlignVertical="top"
                accessibilityLabel={`Exercise ${i + 1} description`}
              />
              <SetsEditor
                sets={x.sets}
                units={settings.units}
                onChange={(sets) => setExercises((xs) => copyLogs(xs.map((y, j) => (j === i ? { ...y, sets } : y))))}
              />
            </View>
          ))}
          <Pressable
            style={s.addBtn}
            onPress={() => setExercises((xs) => [...xs, { name: '', notes: '', sets: [{ reps: 10, weight: null }] }])}
            accessibilityLabel="Add exercise"
          >
            <Ionicons name="add" size={18} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '600' }}>Add exercise</Text>
          </Pressable>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={s.label}>Anything else?</Text>
          <TextInput
            style={[s.input, { minHeight: 70 }]}
            multiline
            value={qWhat}
            onChangeText={setQWhat}
            placeholder="Exercises, weights, reps, variations…"
            placeholderTextColor={C.faint}
            textAlignVertical="top"
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={s.label}>How was it?</Text>
          <Stars value={stars} onChange={setStars} size={36} />
          <TextInput
            style={[s.input, { minHeight: 100 }]}
            multiline
            value={qHowNotes}
            onChangeText={setQHowNotes}
            placeholder="Energy, form, anything to remember next time…"
            placeholderTextColor={C.faint}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Same wall-clock time, `dayOffset` days away (or a new hour/minute on the same day). */
function atFrom(w: Date, dayOffset: number, hour = w.getHours(), minute = w.getMinutes()): Date {
  return new Date(w.getFullYear(), w.getMonth(), w.getDate() + dayOffset, hour, minute, 0, 0);
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[s.chip, on && s.chipOn]}
      onPress={onPress}
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
    >
      <Text style={[s.chipText, on && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  headerBtn: { color: C.text, fontSize: 17, paddingHorizontal: 8 },
  label: { color: C.dim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  input: {
    backgroundColor: C.card,
    color: C.text,
    fontSize: 17,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 36 },
  fieldLabel: { color: C.text, fontSize: 16 },
  chip: {
    backgroundColor: C.cardHi,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    maxWidth: 220,
  },
  chipOn: { backgroundColor: C.accent },
  chipText: { color: C.dim, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dateText: { color: C.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', gap: 8 },
  exCard: { backgroundColor: C.card, borderRadius: 14, padding: 12, gap: 8 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.accent,
  },
});