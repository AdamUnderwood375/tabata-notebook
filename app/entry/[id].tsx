// Entry detail: the reflection questions. Autosaves; editable forever.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useStore } from '@/lib/store';
import { confirm } from '@/lib/confirm';
import { C, Stars, formatDuration } from '@/lib/ui';
import type { Entry } from '@/lib/types';

type Draft = Pick<Entry, 'qWhat' | 'qHowStars' | 'qHowNotes'>;

export default function EntryScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { getEntry, getTemplate, updateEntry, deleteEntry } = useStore();
  const entry = getEntry(id);
  const template = entry ? getTemplate(entry.templateId) : undefined;

  const [draft, setDraft] = useState<Draft>(() => ({
    qWhat: entry?.qWhat ?? '',
    qHowStars: entry?.qHowStars ?? null,
    qHowNotes: entry?.qHowNotes ?? '',
  }));
  const [saved, setSaved] = useState(true);

  // ---- autosave: debounce while typing, flush on leave ----
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      updateEntry(id, pending.current);
      pending.current = null;
      setSaved(true);
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const change = (p: Partial<Draft>, immediate = false) => {
    setDraft((d) => {
      const next = { ...d, ...p };
      pending.current = next;
      return next;
    });
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), immediate ? 0 : 500);
  };

  if (!entry) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Entry' }} />
        <Text style={{ color: C.dim }}>This entry no longer exists.</Text>
      </View>
    );
  }

  const started = new Date(entry.startedAt);
  const isFresh = fresh === '1';

  const repeat = () => {
    flush();
    router.replace(`/workout/${entry.templateId}`);
  };
  const remove = async () => {
    if (await confirm('Delete entry?', 'This removes it from your notebook.', 'Delete', true)) {
      pending.current = null;
      deleteEntry(entry.id);
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: isFresh ? (entry.completed ? 'Nice work' : 'Logged') : 'Entry',
          headerBackTitle: 'Notebook',
          headerRight: () => (
            <Text style={{ color: C.faint, fontSize: 13, marginRight: 8 }}>{saved ? 'Saved' : 'Saving…'}</Text>
          ),
        }}
      />
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.summary}>
          <Text style={s.title}>{entry.name}</Text>
          <Text style={s.meta}>
            {started.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
            {started.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={s.pills}>
            <Pill icon="time-outline" text={formatDuration(entry.actualSec)} />
            {entry.completed ? (
              <Pill icon="checkmark-circle" text="Completed" color="#3ccf7a" />
            ) : (
              <Pill
                icon="alert-circle-outline"
                text={`Stopped early · ${Math.round((100 * entry.actualSec) / Math.max(1, entry.plannedSec))}%`}
                color={C.prepare}
              />
            )}
          </View>
        </View>

        {isFresh && template ? (
          <Pressable style={s.repeatBtn} onPress={repeat} accessibilityLabel="Repeat this workout">
            <Ionicons name="repeat" size={22} color="#fff" />
            <Text style={s.repeatText}>Repeat “{template.name}”</Text>
          </Pressable>
        ) : null}

        <View style={s.q}>
          <Text style={s.qLabel}>What did you do?</Text>
          <TextInput
            style={[s.input, { minHeight: 70 }]}
            multiline
            value={draft.qWhat}
            onChangeText={(v) => change({ qWhat: v })}
            onBlur={flush}
            placeholder="Exercises, weights, reps, variations…"
            placeholderTextColor={C.faint}
            textAlignVertical="top"
          />
        </View>

        <View style={s.q}>
          <Text style={s.qLabel}>How was it?</Text>
          <Stars value={draft.qHowStars} onChange={(v) => change({ qHowStars: v }, true)} size={36} />
          <TextInput
            style={[s.input, { minHeight: 110, marginTop: 6 }]}
            multiline
            value={draft.qHowNotes}
            onChangeText={(v) => change({ qHowNotes: v })}
            onBlur={flush}
            placeholder="Energy, form, anything to remember next time…"
            placeholderTextColor={C.faint}
            textAlignVertical="top"
          />
        </View>

        {isFresh ? (
          <Pressable style={s.doneBtn} onPress={() => (flush(), router.back())}>
            <Text style={s.doneText}>Done</Text>
          </Pressable>
        ) : null}

        <Pressable style={s.deleteBtn} onPress={remove}>
          <Ionicons name="trash-outline" size={16} color={C.danger} />
          <Text style={{ color: C.danger }}>Delete entry</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Pill({ icon, text, color = C.dim }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  return (
    <View style={s.pill}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color, fontSize: 13, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  summary: { gap: 6 },
  title: { color: C.text, fontSize: 26, fontWeight: '800' },
  meta: { color: C.dim, fontSize: 14 },
  pills: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  repeatText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  q: { gap: 8 },
  qLabel: { color: C.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: C.card,
    color: C.text,
    fontSize: 16,
    lineHeight: 22,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  doneBtn: { backgroundColor: C.cardHi, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  doneText: { color: C.text, fontSize: 17, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, marginTop: 10 },
});
