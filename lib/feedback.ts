// Beep + haptic cues for phase transitions. Loud, distinct, audible in silent mode,
// and — while a workout is running — audible with the app backgrounded or the phone locked.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type Cue = 'work' | 'rest' | 'tick' | 'finish';

const SOURCES: Record<Cue, number> = {
  work: require('../assets/sounds/work.wav'),
  rest: require('../assets/sounds/rest.wav'),
  tick: require('../assets/sounds/tick.wav'),
  finish: require('../assets/sounds/finish.wav'),
};
const SILENCE = require('../assets/sounds/silence.wav');

/**
 * One global audio mode for the whole app:
 * - playsInSilentMode: beep even with the ring/silent switch on silent (also required for background audio).
 * - shouldPlayInBackground: don't pause our players when the app is backgrounded / the screen locks.
 * - mixWithOthers: play *over* Spotify etc. without pausing it or turning it down. (duckOthers would keep
 *   the music ducked for the entire workout, because the keep-alive loop holds our session open.)
 */
let modeSet: Promise<void> | null = null;
function ensureAudioMode() {
  if (!modeSet) {
    modeSet = setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {
      modeSet = null; // retry next time
    });
  }
  return modeSet;
}

// Players are torn down a little after unmount so a cue fired right before navigating away
// (e.g. the finish chime → entry screen) isn't cut off mid-sound.
const RELEASE_DELAY_MS = 2500;
function releaseLater(players: (AudioPlayer | undefined)[]) {
  setTimeout(() => {
    players.forEach((pl) => {
      try {
        pl?.remove();
      } catch {}
    });
  }, RELEASE_DELAY_MS);
}

export function useCues(opts: { sound: boolean; haptics: boolean }) {
  const players = useRef<Partial<Record<Cue, AudioPlayer>>>({});
  const optsRef = useRef(opts);

  // Layout effect, no deps: ref is current before any effect/timer fires after a commit.
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    void ensureAudioMode();
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
      releaseLater(Object.values(created));
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
    // iOS ignores haptics while backgrounded; harmless to call.
    if (opts.haptics && Platform.OS !== 'web') {
      if (kind === 'work') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      else if (kind === 'rest') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      else if (kind === 'finish') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);
}

/**
 * Keeps the app alive in the background while `active` by looping a silent track.
 *
 * iOS suspends an app (freezing its JS timers, so no beeps) as soon as it stops playing audio,
 * even with the `audio` background mode. A continuous, mixable silent loop keeps the session —
 * and therefore our interval clock — running with the screen locked, without touching other
 * apps' audio. Stopped whenever the workout isn't running so we don't drain battery.
 */
export function useBackgroundAudio(active: boolean) {
  const player = useRef<AudioPlayer | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void ensureAudioMode();
    let pl: AudioPlayer | null = null;
    try {
      pl = createAudioPlayer(SILENCE);
      pl.loop = true;
      pl.volume = 1; // the samples are digital silence; volume 0 risks iOS treating us as not playing
    } catch {}
    player.current = pl;
    return () => {
      player.current = null;
      if (!pl) return;
      // Keep the session alive a moment longer so the finish chime can play out in the background.
      setTimeout(() => {
        try {
          pl.pause();
          pl.remove();
        } catch {}
      }, RELEASE_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    const pl = player.current;
    if (!pl) return;
    if (active) {
      void ensureAudioMode().then(() => {
        try {
          if (activeRef.current && player.current === pl && !pl.playing) pl.play();
        } catch {}
      });
      return;
    }
    // Paused / done: stop the loop (after any in-flight beep) so iOS can suspend us and save battery.
    const h = setTimeout(() => {
      try {
        if (!activeRef.current && pl.playing) pl.pause();
      } catch {}
    }, RELEASE_DELAY_MS);
    return () => clearTimeout(h);
  }, [active]);

  // Watchdog: a phone call / Siri / another app's interruption can stop the loop. Restart it.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const kick = () => {
      const pl = player.current;
      if (!pl || !activeRef.current) return;
      try {
        if (!pl.playing) pl.play();
      } catch {}
    };
    const h = setInterval(kick, 2000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && kick());
    return () => {
      clearInterval(h);
      sub.remove();
    };
  }, []);
}
