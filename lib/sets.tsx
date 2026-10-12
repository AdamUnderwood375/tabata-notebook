// Shared sets × reps (× weight) editor + helpers. Used by the template editor,
// the entry screen and the "log past workout" form. Not a route.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C } from './ui';
import type { Exercise, ExerciseLog, SetLog } from './types';

/** "3×10 @ 20kg", "10, 8, 6", or "" — compact one-line summary of a set list. */
export function setsSummary(sets: SetLog[] | undefined, units: string): string {
  if (!sets || sets.length === 0) return '';
  const sameReps = sets.every((x) => x.reps === sets[0].reps);
  const sameW = sets.every((x) => x.weight === sets[0].weight);
  if (sameReps && sameW) {
    const w = sets[0].weight != null ? ` @ ${sets[0].weight}${units}` : '';
    return `${sets.length}×${sets[0].reps}${w}`;
  }
  return sets.map((x) => (x.weight != null ? `${x.reps}@${x.weight}` : String(x.reps))).join(', ') + (sets.some((x) => x.weight != null) ? ` ${units}` : ' reps');
}

/** Template exercises → editable logs (targets become the starting "done" values). */
export function logsFromExercises(exs: Exercise[]): ExerciseLog[] {
  return exs.map((e) => ({ name: e.name, notes: e.notes ?? '', sets: (e.sets ?? []).map((x) => ({ ...x })) }));
}

/** Deep copy so edits never share nested set arrays with stored data. */
export function copyLogs(logs: ExerciseLog[]): ExerciseLog[] {
  return logs.map((x) => ({ ...x, sets: x.sets.map((y) => ({ ...y })) }));
}

/** Parse a decimal weight field; blank → null (bodyweight). */
function parseWeight(t: string): number | null {
  const n = parseFloat(t.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.min(9999, Math.round(n * 100) / 100) : null;
}

export function SetsEditor({
  sets,
  onChange,
  units,
  showWeight = true,
}: {
  sets: SetLog[];
  onChange: (next: SetLog[]) => void;
  units: string;
  showWeight?: boolean;
}) {
  const patch = (i: number, p: Partial<SetLog>) => onChange(sets.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // A new set copies the previous one — the usual case is "same again".
  const add = () => onChange([...sets, sets.length ? { ...sets[sets.length - 1] } : { reps: 10, weight: null }]);
  const remove = (i: number) => onChange(sets.filter((_, j) => j !== i));

  return (
    <View style={st.wrap}>
      {sets.length > 0 ? (
        <View style={st.headRow}>
          <Text style={[st.head, st.colSet]}>Set</Text>
          <Text style={[st.head, st.colNum]}>Reps</Text>
          {showWeight ? <Text style={[st.head, st.colNum]}>Weight ({units})</Text> : null}
          <View style={st.colDel} />
        </View>
      ) : null}
      {sets.map((x, i) => (
        <View key={i} style={st.row}>
          <Text style={[st.setNum, st.colSet]}>{i + 1}</Text>
          <TextInput
            style={[st.input, st.colNum]}
            keyboardType="number-pad"
            value={String(x.reps)}
            selectTextOnFocus
            onChangeText={(t) => {
              const n = parseInt(t.replace(/\D/g, ''), 10);
              patch(i, { reps: Number.isFinite(n) ? Math.min(9999, n) : 0 });
            }}
            accessibilityLabel={`Set ${i + 1} reps`}
          />
          {showWeight ? (
            <WeightInput index={i} value={x.weight} onChange={(w) => patch(i, { weight: w })} />
          ) : null}
          <Pressable style={st.colDel} hitSlop={6} onPress={() => remove(i)} accessibilityLabel={`Remove set ${i + 1}`}>
            <Ionicons name="close-circle-outline" size={20} color={C.faint} />
          </Pressable>
        </View>
      ))}
      <Pressable style={st.addSet} onPress={add} hitSlop={4}>
        <Ionicons name="add" size={16} color={C.accent} />
        <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>Add set</Text>
      </Pressable>
    </View>
  );
}

/** Controlled decimal field. Keeps the raw text locally so "62." survives while typing,
 *  but re-syncs whenever the stored value changes underneath it (e.g. a set above was removed). */
function WeightInput({ index, value, onChange }: { index: number; value: number | null; onChange: (w: number | null) => void }) {
  const [text, setText] = useState(value != null ? String(value) : '');
  if (parseWeight(text) !== value) setText(value != null ? String(value) : ''); // render-phase sync, React-approved pattern
  return (
    <TextInput
      style={[st.input, st.colNum]}
      keyboardType="decimal-pad"
      value={text}
      placeholder="BW"
      placeholderTextColor={C.faint}
      selectTextOnFocus
      onChangeText={(t) => {
        setText(t);
        onChange(parseWeight(t));
      }}
      accessibilityLabel={`Set ${index + 1} weight`}
    />
  );
}

const st = StyleSheet.create({
  wrap: { gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  head: { color: C.faint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colSet: { width: 30, textAlign: 'center' },
  colNum: { flex: 1 },
  colDel: { width: 24, alignItems: 'center' },
  setNum: { color: C.dim, fontWeight: '700', fontVariant: ['tabular-nums'] },
  input: {
    backgroundColor: C.cardHi,
    color: C.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    borderRadius: 8,
    paddingVertical: 6,
  },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
});
