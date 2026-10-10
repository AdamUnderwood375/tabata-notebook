import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useStore } from '@/lib/store';
import { syncReminders } from '@/lib/notifications';
import { confirm } from '@/lib/confirm';
import { C, Stepper } from '@/lib/ui';

export default function SettingsScreen() {
  const { settings, updateSettings, exportJson, wipeAll, templates, entries } = useStore();

  const doExport = async () => {
    const json = exportJson();
    const filename = `cutting-notebook-${new Date().toISOString().slice(0, 10)}.json`;
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // iOS share sheet: Save to Files, AirDrop, Mail, Notes…
    await Share.share({ message: json, title: filename }).catch(() => {});
  };

  const doWipe = async () => {
    const ok = await confirm(
      'Wipe all data?',
      `Deletes ${templates.length} workout(s), ${entries.length} notebook entr${entries.length === 1 ? 'y' : 'ies'}, all reminders and settings. This can't be undone — export first if unsure.`,
      'Wipe everything',
      true,
    );
    if (!ok) return;
    await wipeAll();
    await syncReminders([]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 48 }}>
      <Section title="Defaults for new exercises">
        <Row label="Work">
          <Stepper value={settings.defaultWorkSec} onChange={(v) => updateSettings({ defaultWorkSec: v })} min={1} step={5} suffix="s" />
        </Row>
        <Row label="Rest">
          <Stepper value={settings.defaultRestSec} onChange={(v) => updateSettings({ defaultRestSec: v })} min={0} step={5} suffix="s" />
        </Row>
        <Row label="Rounds" last>
          <Stepper value={settings.defaultRounds} onChange={(v) => updateSettings({ defaultRounds: v })} min={1} max={99} step={1} />
        </Row>
      </Section>

      <Section title="During a workout">
        <Row label="Keep screen awake">
          <Toggle value={settings.keepAwake} onChange={(v) => updateSettings({ keepAwake: v })} />
        </Row>
        <Row label="Sound">
          <Toggle value={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
        </Row>
        <Row label="Haptics" last>
          <Toggle value={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} />
        </Row>
      </Section>

      <Section title="Units">
        <Row label="Weight" last>
          <View style={s.seg}>
            {(['kg', 'lb'] as const).map((u) => (
              <Pressable key={u} style={[s.segItem, settings.units === u && s.segOn]} onPress={() => updateSettings({ units: u })}>
                <Text style={[s.segText, settings.units === u && { color: '#fff' }]}>{u}</Text>
              </Pressable>
            ))}
          </View>
        </Row>
      </Section>

      <Section title="Data">
        <Pressable style={s.action} onPress={doExport}>
          <Ionicons name="share-outline" size={20} color={C.text} />
          <Text style={s.actionText}>Export JSON</Text>
        </Pressable>
        <View style={s.sep} />
        <Pressable style={s.action} onPress={doWipe}>
          <Ionicons name="trash-outline" size={20} color={C.danger} />
          <Text style={[s.actionText, { color: C.danger }]}>Wipe data</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <>
      <View style={s.row}>
        <Text style={s.label}>{label}</Text>
        {children}
      </View>
      {last ? null : <View style={s.sep} />}
    </>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent }} />;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  sectionTitle: { color: C.dim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginLeft: 4 },
  card: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50 },
  label: { color: C.text, fontSize: 16 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  seg: { flexDirection: 'row', backgroundColor: C.cardHi, borderRadius: 8, padding: 2 },
  segItem: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  segOn: { backgroundColor: C.accent },
  segText: { color: C.dim, fontWeight: '700' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  actionText: { color: C.text, fontSize: 16 },
});
