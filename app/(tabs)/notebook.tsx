import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useStore } from '@/lib/store';
import { C, Stars, formatDuration } from '@/lib/ui';
import type { Entry } from '@/lib/types';

export default function Notebook() {
  const { entries } = useStore();

  // entries are kept newest-first in the store; group by calendar month
  const sections = useMemo(() => {
    const out: { title: string; key: string; data: Entry[] }[] = [];
    for (const e of entries) {
      const d = new Date(e.startedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let sec = out[out.length - 1];
      if (!sec || sec.key !== key) {
        sec = { key, title: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), data: [] };
        out.push(sec);
      }
      sec.data.push(e);
    }
    return out;
  }, [entries]);

  const open = (id: string) => router.push(`/entry/${id}`);

  return (
    <SectionList
      style={s.screen}
      sections={sections}
      keyExtractor={(e) => e.id}
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
      ListEmptyComponent={
        <View style={s.empty}>
          <Ionicons name="book-outline" size={48} color={C.faint} />
          <Text style={s.emptyTitle}>Nothing logged yet</Text>
          <Text style={s.emptyText}>Finish (or bail on) a workout and it lands here automatically.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={s.month}>{section.title}</Text>}
      renderItem={({ item: e }) => {
        const d = new Date(e.startedAt);
        return (
          <Pressable style={({ pressed }) => [s.row, pressed && { backgroundColor: C.cardHi }]} onPress={() => open(e.id)}>
            <View style={s.dateCol}>
              <Text style={s.dow}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
              <Text style={s.dom}>{d.getDate()}</Text>
              <Text style={s.tod}>{d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <View style={s.headLine}>
                <Text style={s.name} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={s.dur}>
                  {formatDuration(e.actualSec)}
                  {e.completed ? '' : ' · partial'}
                </Text>
              </View>
              <Stars value={e.qHowStars} size={15} />
              <Answer label="Did" text={e.qWhat} />
              <Answer label="Notes" text={e.qHowNotes} />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

/** Inline answer; a dash when unanswered (the whole row is tappable to fill it in). */
function Answer({ label, text }: { label: string; text: string }) {
  const t = text.trim();
  return (
    <Text style={s.answer} numberOfLines={2}>
      <Text style={s.answerLabel}>{label}: </Text>
      {t ? t : <Text style={{ color: C.faint }}>—</Text>}
    </Text>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  month: {
    color: C.dim,
    backgroundColor: C.bg,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: C.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 12,
  },
  dateCol: { width: 52, alignItems: 'center' },
  dow: { color: C.dim, fontSize: 12, textTransform: 'uppercase' },
  dom: { color: C.text, fontSize: 24, fontWeight: '800' },
  tod: { color: C.faint, fontSize: 11 },
  headLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  name: { color: C.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  dur: { color: C.dim, fontSize: 13, fontVariant: ['tabular-nums'] },
  answer: { color: C.text, fontSize: 14, lineHeight: 19 },
  answerLabel: { color: C.dim },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: C.dim, textAlign: 'center' },
});
