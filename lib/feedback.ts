// Beep + haptic cues for phase transitions. Loud, distinct, and audible in silent mode.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type Cue = 'work' | 'rest' | 'tick' | 'finish';

const SOURCES: Record<Cue, number> = {
  work: require('../assets/sounds/work.wav'),
  rest: require('../assets/sounds/rest.wav'),
  tick: require('../assets/sounds/tick.wav'),
  finish: require('../assets/sounds/finish.wav'),
};

export function useCues(opts: { sound: boolean; haptics: boolean }) {
  const players = useRef<Partial<Record<Cue, AudioPlayer>>>({});
  const optsRef = useRef(opts);

  // Layout effect, no deps: ref is current before any effect/timer fires after a commit.
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    // Beep even with the ringer switch off; duck (not stop) the user's music/podcast.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false }).catch(
      () => {},
    );
    const created: Partial<Record<Cue, AudioPlayer>> = {};
    (Object.keys(SOURCES) as Cue[]).forEach((k) => {
      try {
        const pl = createAudioPlayer(SOURCES[k]);
        pl.volume = 1;
        created[k] = pl;
      } catch {}
    });
    players.current = created;
    return () => {
      players.current = {};
      Object.values(created).forEach((pl) => {
        try {
          pl?.remove();
        } catch {}
      });
    };
  }, []);

  // Stable identity so callers can put it in effect deps without re-subscribing.
  return useCallback((kind: Cue) => {
    const opts = optsRef.current;
    if (opts.sound) {
      const pl = players.current[kind];
      if (pl) try {
        // Rewind first: playing mid-buffer would replay a truncated beep.
        pl.seekTo(0)
          .then(() => pl.play())
          .catch(() => {
            try {
              pl.play();
            } catch {}
          });
      } catch {}
    }
    if (opts.haptics && Platform.OS !== 'web') {
      if (kind === 'work') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      else if (kind === 'rest') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      else if (kind === 'finish') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);
}
