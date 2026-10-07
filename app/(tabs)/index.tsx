import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, router } from 'expo-router';
import { useStore } from '@/lib/store';
import { relativeDay, scheduleLabel, totalSec } from '@/lib/timer';
import { C, formatDuration } from '@/lib/ui';
import { confirm } from '@/lib/confirm';
import type { WorkoutTemplate } from '@/lib/types';

export default function WorkoutList() {
  const { templates, duplicateTemplate, deleteTemplate } = useStore();
  const [menuFor, setMenuFor] = useState<WorkoutTemplate | null>(null);

  const closeThen = (fn: () => void) => () => {
    setMenuFor(null);
    fn();
  };

  return (
    <View style={s.screen}>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/workout/new')}
              style={s.newBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="New workout"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.newBtnText}>New</Text>
            </Pressable>
          ),
        }}
      />

      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="timer-outline" size={48} color={C.faint} />
            <Text style={s.emptyTitle}>No workouts yet</Text>
            <Text style={s.emptyText}>Make a template once, then repeat it in one tap.</Text>
            <Pressable style={s.emptyBtn} onPress={() => router.push('/workout/new')}>
              <Text style={s.emptyBtnText}>Create a workout</Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          templates.length > 0 ? <Text style={s.hint}>Tap to start · long-press for edit / duplicate / delete</Text> : null
        }
        renderItem={({ item: t }) => {
          const badge = scheduleLabel(t.schedule);
          return (
            <Pressable
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.cardHi }]}
              onPress={() => router.push(`/workout/${t.id}`)}
              onLongPress={() => setMenuFor(t)}
              delayLongPress={350}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.name} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={s.meta}>
                  {t.exercises.length} exercise{t.exercises.length === 1 ? '' : 's'} · {formatDuration(totalSec(t))}
                </Text>
                <View style={s.badges}>
                  {badge ? (
                    <View style={s.badge}>
                      <Ionicons name="alarm-outline" size={12} color={C.prepare} />
                      <Text style={[s.badgeText, { color: C.prepare }]}>{badge}</Text>
                    </View>
                  ) : null}
                  <Text style={s.last}>Last done: {relativeDay(t.lastDoneAt)}</Text>
                </View>
              </View>
              <Pressable hitSlop={10} onPress={() => setMenuFor(t)} accessibilityLabel={`${t.name} options`}>
                <Ionicons name="ellipsis-horizontal" size={20} color={C.dim} />
              </Pressable>
              <Ionicons name="play-circle" size={36} color={C.accent} />
            </Pressable>
          );
        }}
      />

      {/* long-press action sheet (works on web too, unlike ActionSheetIOS) */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={s.backdrop} onPress={() => setMenuFor(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle} numberOfLines={1}>
              {menuFor?.name}
            </Text>
            <SheetItem
              icon="create-outline"
              label="Edit"
              onPress={closeThen(() => menuFor && router.push({ pathname: '/workout/new', params: { id: menuFor.id } }))}
            />
            <SheetItem
              icon="copy-outline"
              label="Duplicate"
              onPress={closeThen(() => menuFor && duplicateTemplate(menuFor.id))}
            />
            <SheetItem
              icon="trash-outline"
              label="Delete"
              danger
              onPress={closeThen(async () => {
                if (!menuFor) return;
                const ok = await confirm(
                  'Delete workout?',
                  `"${menuFor.name}" and its reminders will be removed. Notebook entries are kept.`,
                  'Delete',
                  true,
                );
                if (ok) deleteTemplate(menuFor.id);
              })}
            />
            <SheetItem icon="close" label="Cancel" onPress={() => setMenuFor(null)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function SheetItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? C.danger : C.text;
  return (
    <Pressable style={({ pressed }) => [s.sheetItem, pressed && { backgroundColor: C.cardHi }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[s.sheetLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 16,
  },
  newBtnText: { color: '#fff', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  name: { color: C.text, fontSize: 18, fontWeight: '700' },
  meta: { color: C.dim, fontSize: 14 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2b2615',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  last: { color: C.faint, fontSize: 12 },
  hint: { color: C.faint, textAlign: 'center', fontSize: 12, marginTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 80 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: C.dim, textAlign: 'center' },
  emptyBtn: { marginTop: 12, backgroundColor: C.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 8, paddingBottom: 32 },
  sheetTitle: { color: C.dim, textAlign: 'center', padding: 10, fontSize: 13 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 10 },
  sheetLabel: { fontSize: 17 },
});
