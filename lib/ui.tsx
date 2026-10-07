// Tiny shared UI bits: colors, star row, number stepper. Not a route (lives outside app/).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Stars as StarsT } from './types';

export const C = {
  bg: '#0f1115',
  card: '#1a1d24',
  cardHi: '#232733',
  border: '#2c313d',
  text: '#f2f4f8',
  dim: '#9aa3b2',
  faint: '#5f6878',
  accent: '#ff5a36', // work
  rest: '#2bb3ff',
  between: '#a78bfa',
  prepare: '#ffc53d',
  star: '#ffc53d',
  danger: '#ff4d4f',
};

export function Stars({
  value,
  onChange,
  size = 18,
}: {
  value: StarsT | null;
  onChange?: (v: StarsT | null) => void;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 8 : 2 }}>
      {([1, 2, 3, 4, 5] as StarsT[]).map((n) => {
        const on = value != null && n <= value;
        const icon = (
          <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? C.star : C.faint} />
        );
        if (!onChange) return <View key={n}>{icon}</View>;
        return (
          <Pressable
            key={n}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            // tapping the current value clears it
            onPress={() => onChange(value === n ? null : n)}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Integer field with − / + buttons. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 3600,
  step = 5,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={st.stepper}>
      <Pressable style={st.stepBtn} hitSlop={4} onPress={() => onChange(clamp(value - step))}>
        <Ionicons name="remove" size={16} color={C.text} />
      </Pressable>
      <TextInput
        style={st.stepInput}
        keyboardType="number-pad"
        value={String(value)}
        selectTextOnFocus
        onChangeText={(s) => {
          const n = parseInt(s.replace(/\D/g, ''), 10);
          onChange(clamp(Number.isFinite(n) ? n : min));
        }}
      />
      {suffix ? <Text style={st.suffix}>{suffix}</Text> : null}
      <Pressable style={st.stepBtn} hitSlop={4} onPress={() => onChange(clamp(value + step))}>
        <Ionicons name="add" size={16} color={C.text} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.cardHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    width: 44,
    color: C.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    paddingVertical: 4,
  },
  suffix: { color: C.dim, fontSize: 13, marginLeft: -2, marginRight: 2 },
});

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return r === 0 ? `${m} min` : `${m}m ${r}s`;
}
