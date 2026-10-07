import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { StoreProvider, useStore } from '@/lib/store';
import { C } from '@/lib/ui';
import '@/lib/notifications'; // registers the foreground notification handler

/** Tapping a reminder (cold start or while running) → open that workout's runner, ready to start. */
function useNotificationRouting(ready: boolean) {
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const go = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      go(last.notification);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) go(r.notification);
      Notifications.clearLastNotificationResponse();
    });
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
