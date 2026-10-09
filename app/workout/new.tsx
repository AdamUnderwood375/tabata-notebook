// Template editor. /workout/new → create; /workout/new?id=<id> → edit.
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { newId, useStore } from '@/lib/store';
import { ensurePermission } from '@/lib/notifications';
import { DAY_LETTER, DAY_SHORT, WEEK_ORDER, formatTime, nextFireTimes, parseTime, totalSec } from '@/lib/timer';
import { C, Stepper, formatDuration } from '@/lib/ui';
import type { Exercise, Schedule, WorkoutTemplate } from '@/lib/types';

/** Standard iOS header height — keep lifted content clear of it. */
const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 0;

export default function TemplateEditor() {
  // A repeated param arrives as an array; the template id is single-valued.
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const { getTemplate, saveTemplate, settings } = useStore();
  const existing = id ? getTemplate(id) : undefined;

  const blankExercise = (): Exercise => ({
    name: '',
    workSec: settings.defaultWorkSec,
    restSec: settings.defaultRestSec,
    rounds: settings.defaultRounds,
  });

  const [name, setName] = useState(existing?.name ?? '');
  const [exercises, setExercises] = useState<Exercise[]>(
    existing ? existing.exercises.map((e) => ({ ...e })) : [blankExercise()],
  );
  const [restBetweenSec, setRestBetween] = useState(existing?.restBetweenSec ?? 60);
  const [scheduleOn, setScheduleOn] = useState(!!existing?.schedule);
  // Picked days live in state as a sorted "1,3,5" key: primitive, stable identity, memo-safe.
  const [daysKey, setDaysKey] = useState(() =>
    [...(existing?.schedule?.days ?? [1, 3, 5])].sort((a, b) => a - b).join(','),
  );
  const [time, setTime] = useState(existing?.schedule?.time ?? '07:00');
  const [permWarning, setPermWarning] = useState(false);

  const days = useMemo(() => (daysKey ? daysKey.split(',').map(Number) : []), [daysKey]);
  const schedule = toSchedule(scheduleOn, daysKey, time);

  const draft: WorkoutTemplate = {
    id: existing?.id ?? 'draft',
    name: name.trim() || 'Untitled workout',
    exercises: exercises.map((e, i) => ({ ...e, name: e.name.trim() || `Exercise ${i + 1}` })),
    restBetweenSec,
    schedule,
    lastDoneAt: existing?.lastDoneAt,
  };
  const preview = useMemo(
    () => nextFireTimes(toSchedule(scheduleOn, daysKey, time), new Date(), 3),
    [scheduleOn, daysKey, time],
  );
  // Reminder on but no days picked would silently save without any reminder.
  const noDays = scheduleOn && daysKey === '';
  const canSave = !noDays && exercises.some((e) => e.workSec > 0 && e.rounds > 0);

  const toggleDay = (d: number) =>
    setDaysKey((k) => {
      const cur = k ? k.split(',').map(Number) : [];
      const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
      return next.sort((a, b) => a - b).join(',');
    });

  const patchEx = (i: number, p: Partial<Exercise>) =>
    setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setExercises((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Minted once: a retry after a denied notification permission (or a double tap)
  // must overwrite the same id, not create a second copy of the workout.
  const saveId = useRef(existing?.id ?? newId());
  const saving = useRef(false);

  const save = async () => {
    if (!canSave || saving.current) return;
    saving.current = true; // one tap = one save = one pop
    const t: WorkoutTemplate = { ...draft, id: saveId.current };
    saveTemplate(t);
    if (t.schedule && Platform.OS !== 'web') {
      const ok = await ensurePermission();
      if (!ok) {
        setPermWarning(true);
        return; // stay so the user sees why reminders won't fire
      }
    }
    goBack();
  };

  const { hour, minute } = parseTime(time);
  const setHM = (h: number, m: number) => setTime(formatTime(wholeNumber(h) % 24, wholeNumber(m) % 60));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={HEADER_HEIGHT}
    >
      <Stack.Screen
        options={{
          title: existing ? 'Edit workout' : 'New workout',
          headerLeft: () => (
            <Pressable onPress={goBack} hitSlop={8}>
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
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={s.label}>Name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Morning Tabata"
            placeholderTextColor={C.faint}
            autoFocus={!existing}
            returnKeyType="done"
          />
        </View>

        <View style={{ gap: 10 }}>
          <View style={s.sectionHead}>
            <Text style={s.label}>Exercises</Text>
            <Text style={s.total}>Total {formatDuration(totalSec(draft))}</Text>
          </View>
          {exercises.map((e, i) => (
            <View key={i} style={s.exCard}>
              <View style={s.exHead}>
                <Text style={s.exNum}>{i + 1}</Text>
                <TextInput
                  style={[s.input, { flex: 1, minWidth: 0, paddingVertical: 8 }]}
                  value={e.name}
                  onChangeText={(v) => patchEx(i, { name: v })}
                  placeholder={`Exercise ${i + 1}`}
                  placeholderTextColor={C.faint}
                />
                <Pressable hitSlop={6} onPress={() => move(i, -1)} disabled={i === 0}>
                  <Ionicons name="chevron-up" size={20} color={i === 0 ? C.border : C.dim} />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => move(i, 1)} disabled={i === exercises.length - 1}>
                  <Ionicons name="chevron-down" size={20} color={i === exercises.length - 1 ? C.border : C.dim} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  disabled={exercises.length === 1}
                  onPress={() => setExercises((xs) => xs.filter((_, j) => j !== i))}
                  accessibilityLabel="Remove exercise"
                >
                  <Ionicons name="trash-outline" size={19} color={exercises.length === 1 ? C.border : C.danger} />
                </Pressable>
              </View>
              <Field label="Work">
                <Stepper value={e.workSec} onChange={(v) => patchEx(i, { workSec: v })} min={1} step={5} suffix="s" />
              </Field>
              <Field label="Rest">
                <Stepper value={e.restSec} onChange={(v) => patchEx(i, { restSec: v })} min={0} step={5} suffix="s" />
              </Field>
              <Field label="Rounds">
                <Stepper value={e.rounds} onChange={(v) => patchEx(i, { rounds: v })} min={1} max={99} step={1} />
              </Field>
            </View>
          ))}
          <Pressable style={s.addBtn} onPress={() => setExercises((xs) => [...xs, blankExercise()])}>
            <Ionicons name="add" size={18} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '600' }}>Add exercise</Text>
          </Pressable>
        </View>

        <View style={s.card}>
          <Field label="Rest between">
            <Stepper value={restBetweenSec} onChange={setRestBetween} min={0} step={15} suffix="s" />
          </Field>
        </View>

        <View style={[s.card, { gap: 14 }]}>
          <View style={s.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Reminder</Text>
              <Text style={s.small}>Repeats weekly on the days you pick</Text>
            </View>
            <Switch value={scheduleOn} onValueChange={setScheduleOn} trackColor={{ true: C.accent }} />
          </View>

          {scheduleOn ? (
            <>
              <View style={s.days}>
                {WEEK_ORDER.map((d) => {
                  const on = days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      style={[s.day, on && s.dayOn]}
                      onPress={() => toggleDay(d)}
                      accessibilityLabel={DAY_SHORT[d]}
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.dayText, on && { color: '#fff' }]}>{DAY_LETTER[d]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field label="Time">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Stepper value={hour} onChange={(h) => setHM(h, minute)} min={0} max={23} step={1} />
                  <Text style={{ color: C.text, fontSize: 18 }}>:</Text>
                  <Stepper value={minute} onChange={(m) => setHM(hour, m)} min={0} max={55} step={5} />
                </View>
              </Field>
              <View style={{ gap: 3 }}>
                <Text style={s.small}>Next reminders</Text>
                {noDays ? (
                  <Text style={{ color: C.prepare }}>Pick at least one day for your reminder.</Text>
                ) : (
                  preview.map((d) => (
                    <Text key={d.toISOString()} style={s.preview}>
                      {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                      {formatTime(d.getHours(), d.getMinutes())}
                    </Text>
                  ))
                )}
              </View>
              {permWarning ? (
                <Text style={{ color: C.danger }}>
                  Notifications are off for this app. Saved, but reminders won&apos;t fire until you allow them in iPhone
                  Settings → Notifications.
                </Text>
              ) : null}
              {Platform.OS === 'web' ? <Text style={s.small}>(Reminders only fire on the phone, not in the browser.)</Text> : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function toSchedule(on: boolean, daysKey: string, time: string): Schedule | null {
  const picked = daysKey ? daysKey.split(',').map(Number) : [];
  if (!on || picked.length === 0) return null;
  return { days: picked.sort((a, b) => a - b), time };
}

/** Guards the stepper's number-pad path: NaN would format as "NaN:NaN". */
function wholeNumber(n: number): number {
  return Number.isFinite(n) ? Math.trunc(n) : 0;
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
  label: { color: C.dim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  total: { color: C.dim, fontSize: 13 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
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
  exCard: { backgroundColor: C.card, borderRadius: 14, padding: 12, gap: 8 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exNum: { color: C.accent, fontWeight: '800', fontSize: 16, width: 16, textAlign: 'center' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  fieldLabel: { color: C.text, fontSize: 16 },
  small: { color: C.dim, fontSize: 13 },
  preview: { color: C.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
  },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardHi,
  },
  dayOn: { backgroundColor: C.accent },
  dayText: { color: C.dim, fontWeight: '700' },
});
