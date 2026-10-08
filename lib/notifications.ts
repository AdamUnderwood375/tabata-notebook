// LOCAL repeating reminders only (weekday + time). No push tokens, no remote anything.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { WorkoutTemplate } from './types';
import { parseTime } from './timer';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  // Show the banner even if the app is open when it fires.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function runnerUrl(templateId: string) {
  return `/workout/${templateId}?ready=1`;
}

export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return req.granted;
}

/** Stable fingerprint of everything that affects scheduled reminders. */
export function remindersSignature(templates: WorkoutTemplate[]): string {
  return JSON.stringify(
    templates
      .filter((t) => t.schedule && t.schedule.days.length > 0)
      .map((t) => [t.id, t.name, [...t.schedule!.days].sort(), t.schedule!.time]),
  );
}

let queue: Promise<boolean> = Promise.resolve(true);

/**
 * Cancel everything we scheduled and re-create one WEEKLY trigger per (template, weekday).
 * Serialized so rapid edits can't interleave cancel/schedule and create duplicates.
 * iOS caps pending local notifications at 64 → ~9 templates scheduled every day.
 */
/**
 * Resolves true when the desired reminders are in place (or there was nothing to do),
 * false when permission was refused / scheduling failed — the caller may retry later.
 */
export function syncReminders(templates: WorkoutTemplate[]): Promise<boolean> {
  if (!supported) return Promise.resolve(true); // no OS notifications here; nothing pending
  queue = queue
    .catch(() => {})
    .then(async () => {
      const scheduled = templates.filter((t) => t.schedule && t.schedule.days.length > 0);
      // Permission first: if we can't (re-)ask for it we must keep the reminders we already have.
      if (scheduled.length > 0) {
        const perm = await Notifications.getPermissionsAsync();
        if (!perm.granted && !(await ensurePermission())) return false;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (scheduled.length === 0) return true;
      for (const t of scheduled) {
        const { hour, minute } = parseTime(t.schedule!.time);
        for (const day of t.schedule!.days) {
          await Notifications.scheduleNotificationAsync({
            identifier: `tpl-${t.id}-${day}`,
            content: {
              title: t.name,
              body: 'Time to train — tap to open the workout.',
              sound: true,
              data: { url: runnerUrl(t.id), templateId: t.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: day + 1, // expo: 1 = Sunday; ours: 0 = Sunday
              hour,
              minute,
            },
          });
        }
      }
      return true;
    })
    .catch((e) => {
      console.warn('syncReminders failed', e);
      return false;
    });
  return queue;
}
