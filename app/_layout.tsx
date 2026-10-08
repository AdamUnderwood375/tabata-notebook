import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { StoreProvider, useStore } from '@/lib/store';
import { C } from '@/lib/ui';
import '@/lib/notifications'; // registers the foreground notification handler

/** Tapping a reminder (cold start or while running) → open that workout's runner, ready to start. */
function useNotificationRouting(ready: boolean) {
  // A cold-started tap is reported twice (stored response + listener) — route it once.
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;

    const route = (r: Notifications.NotificationResponse) => {
      if (r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const url = r.notification.request.content.data?.url;
      if (typeof url !== 'string' || !url.startsWith('/workout/')) return;
      const key = `${r.notification.request.identifier ?? url}@${r.notification.date}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      router.push(url as never);
    };

    // The tap that launched us is only readable here — the listener misses it.
    void (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!last) return;
        route(last);
        await Notifications.clearLastNotificationResponseAsync();
      } catch {
        // notifications unavailable (web / Expo Go) — nothing to route
      }
    })();

    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  }, [ready]);
}

function Root() {
  const { ready } = useStore();
  useNotificationRouting(ready);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerTitleStyle: { color: C.text },
        contentStyle: { backgroundColor: C.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
      <Stack.Screen name="workout/new" options={{ title: 'Workout', presentation: 'modal' }} />
      <Stack.Screen
        name="workout/[id]"
        options={{ headerShown: false, gestureEnabled: false, presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen name="entry/[id]" options={{ title: 'Entry' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="light" />
      <Root />
    </StoreProvider>
  );
}
