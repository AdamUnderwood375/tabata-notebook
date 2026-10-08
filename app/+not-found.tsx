// expo-router fallback for unmatched routes (e.g. an old reminder link).
import { StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { C } from '@/lib/ui';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={s.screen}>
        <Text style={s.title}>Nothing here</Text>
        <Text style={s.text}>That workout or entry doesn&apos;t exist — it may have been deleted.</Text>
        <Link href="/" style={s.btn}>
          Back to workouts
        </Link>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  title: { color: C.text, fontSize: 24, fontWeight: '800' },
  text: { color: C.dim, fontSize: 15, textAlign: 'center' },
  btn: {
    marginTop: 12,
    backgroundColor: C.accent,
    color: '#fff',
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
});