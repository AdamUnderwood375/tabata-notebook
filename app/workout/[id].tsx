// The runner. Full screen, tab bar hidden. Wall-clock driven so it never drifts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { newId, useStore } from '@/lib/store';
import { useCues } from '@/lib/feedback';
import { confirm } from '@/lib/confirm';
import {
  buildPhases,
  formatClock,
  nextExerciseIndex,
  nextRoundIndex,
  remainingAfter,
  totalSec,
  type Phase,
} from '@/lib/timer';
import { C, formatDuration } from '@/lib/ui';
import type { Entry } from '@/lib/types';

type Status = 'ready' | 'running' | 'paused' | 'done';

const PHASE_COLOR: Record<Phase['kind'], string> = {
  prepare: C.prepare,
  work: C.accent,
  rest: C.rest,
  between: C.between,
};
const PHASE_LABEL: Record<Phase['kind'], string> = {
  prepare: 'GET READY',
  work: 'WORK',
  rest: 'REST',
  between: 'REST',
};
const KEEP_AWAKE_TAG = 'runner';

export default function Runner() {
  const { id, ready } = useLocalSearchParams<{ id: string; ready?: string }>();
  const { getTemplate, settings, addEntry } = useStore();
  const template = getTemplate(id);
  const phases = useMemo(() => (template ? buildPhases(template) : []), [template?.id]); // freeze for this run
  const cue = useCues({ sound: settings.sound, haptics: settings.haptics });

  const [status, setStatus] = useState<Status>(ready === '1' ? 'ready' : 'running');
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Mutable timing state lives in refs so the interval never sees stale values.
  const endsAt = useRef(0); // ms epoch when current phase ends (running)
  const remainingMs = useRef(0); // when paused
  const startedAt = useRef<string | null>(null);
  const workMs = useRef(0); // active time spent outside 'prepare' (excludes paused time)
  const lastTick = useRef(0);
  const lastSecShown = useRef<number | null>(null);
  const finished = useRef(false);
  const idxRef = useRef(0);
  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  // ---- keep awake ----
  useEffect(() => {
    if (!settings.keepAwake || status === 'done') return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [settings.keepAwake, status === 'done']);

  const enterPhase = useCallback(
    (i: number, at: number) => {
      idxRef.current = i;
      setIdx(i);
      endsAt.current = at + phases[i].durationSec * 1000;
      lastSecShown.current = phases[i].durationSec;
      const k = phases[i].kind;
      cue(k === 'work' ? 'work' : k === 'prepare' ? 'tick' : 'rest');
    },
    [phases, cue],
  );

  const finish = useCallback(
    (completed: boolean) => {
      if (finished.current || !template) return;
      finished.current = true;
      setStatus('done');
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      if (completed) cue('finish');
      const end = new Date();
      const entry: Entry = {
        id: newId(),
        templateId: template.id,
        name: template.name,
        startedAt: startedAt.current ?? end.toISOString(),
        endedAt: end.toISOString(),
        plannedSec: totalSec(template),
        actualSec: Math.round(workMs.current / 1000),
        completed,
        qWhat: '',
        qHowStars: null,
        qHowNotes: '',
      };
      addEntry(entry);
      router.replace({ pathname: '/entry/[id]', params: { id: entry.id, fresh: '1' } });
    },
    [template, addEntry, cue],
  );

  const start = useCallback(() => {
    const t = Date.now();
    startedAt.current = new Date(t).toISOString();
    lastTick.current = t;
    setStatus('running');
    enterPhase(0, t);
  }, [enterPhase]);

  // Auto-start unless opened from a reminder (ready=1 shows a big Start button first).
  useEffect(() => {
    if (phases.length > 0 && status === 'running' && !startedAt.current) start();
  }, [phases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the clock ----
  useEffect(() => {
    if (status !== 'running') return;
    lastTick.current = Date.now();
    const h = setInterval(() => {
      if (!startedAt.current || finished.current) return;
      const t = Date.now();
      if (phases[idxRef.current]?.kind !== 'prepare') workMs.current += t - lastTick.current;
      lastTick.current = t;

      // advance (possibly several phases if we were backgrounded)
      let i = idxRef.current;
      let end = endsAt.current;
      if (t >= end) {
        while (t >= end && i < phases.length - 1) {
          i++;
          end += phases[i].durationSec * 1000;
        }
        if (t >= end) {
          finish(true);
          return;
        }
        enterPhase(i, end - phases[i].durationSec * 1000);
      } else {
        // 3-2-1 ticks at the end of every phase
        const secLeft = Math.ceil((end - t) / 1000);
        if (secLeft !== lastSecShown.current) {
          lastSecShown.current = secLeft;
          if (secLeft <= 3 && secLeft >= 1 && secLeft < phases[i].durationSec) cue('tick');
        }
      }
      setNow(t);
    }, 100);
    return () => clearInterval(h);
  }, [status, phases, enterPhase, finish, cue]);

  // ---- controls ----
  const pause = () => {
    remainingMs.current = Math.max(0, endsAt.current - Date.now());
    setStatus('paused');
  };
  const resume = () => {
    const t = Date.now();
    endsAt.current = t + remainingMs.current;
    lastTick.current = t;
    setNow(t);
    setStatus('running');
  };
  const jumpTo = (j: number) => {
    if (j < 0) return finish(true);
    const t = Date.now();
    enterPhase(j, t);
    if (statusRef.current === 'paused') remainingMs.current = phases[j].durationSec * 1000;
    setNow(t);
  };
  const exit = async () => {
    if (status === 'ready' || !startedAt.current) return router.back();
    const neverWorked = workMs.current < 1000;
    const wasRunning = statusRef.current === 'running';
    if (wasRunning) pause();
    const ok = await confirm(
      'End workout?',
      neverWorked ? 'Nothing done yet — this won’t be saved.' : 'It’ll be saved to your notebook as a partial workout.',
      'End',
      true,
    );
    if (!ok) {
      if (wasRunning) resume();
      return;
    }
    if (neverWorked) {
      finished.current = true;
      router.back();
    } else finish(false);
  };

  // ---- render ----
  if (!template || phases.length === 0) {
    return (
      <SafeAreaView style={[s.screen, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={s.title}>{template ? 'This workout has no exercises' : 'Workout not found'}</Text>
        <Pressable style={s.bigBtn} onPress={() => router.back()}>
          <Text style={s.bigBtnText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (status === 'ready') {
    return (
      <SafeAreaView style={[s.screen, { justifyContent: 'space-between' }]}>
        <TopBar onExit={() => router.back()} />
        <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 24 }}>
          <Text style={s.title}>{template.name}</Text>
          <Text style={s.dim}>
            {template.exercises.length} exercise{template.exercises.length === 1 ? '' : 's'} ·{' '}
            {formatDuration(totalSec(template))}
          </Text>
          <View style={{ marginTop: 10, gap: 4 }}>
            {template.exercises.map((e, i) => (
              <Text key={i} style={s.dim}>
                {e.name} — {e.rounds}× {e.workSec}s / {e.restSec}s
              </Text>
            ))}
          </View>
        </View>
        <Pressable style={[s.startBtn]} onPress={start} accessibilityLabel="Start workout">
          <Ionicons name="play" size={40} color="#fff" />
          <Text style={s.startText}>START</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const phase = phases[idx];
  const color = PHASE_COLOR[phase.kind];
  const paused = status === 'paused';
  const leftMs = paused ? remainingMs.current : Math.max(0, endsAt.current - now);
  const progress = 1 - leftMs / (phase.durationSec * 1000);
  const exercise = template.exercises[phase.exerciseIndex];
  const nextPhase = phases[idx + 1];
  const nextWork = phases.slice(idx + 1).find((p) => p.kind === 'work');
  const nextLabel = !nextPhase
    ? 'Last one — finish strong'
    : nextPhase.kind === 'work'
      ? `${template.exercises[nextPhase.exerciseIndex].name} · round ${nextPhase.round}/${nextPhase.totalRounds}`
      : `Rest ${nextPhase.durationSec}s${nextWork ? ` → ${template.exercises[nextWork.exerciseIndex].name}` : ''}`;
  const totalLeft = leftMs / 1000 + remainingAfter(phases, idx);

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: paused ? C.bg : tint(color) }]}>
      <TopBar onExit={exit} right={`${formatClock(totalLeft)} left`} />

      <View style={s.center}>
        <Text style={[s.phase, { color }]}>{paused ? 'PAUSED' : PHASE_LABEL[phase.kind]}</Text>
        <Text style={s.exName} numberOfLines={2} adjustsFontSizeToFit>
          {exercise?.name}
        </Text>
        <Text style={s.round}>
          {phase.kind === 'prepare'
            ? `${template.exercises.length > 1 ? `Exercise 1/${template.exercises.length} · ` : ''}${phase.totalRounds} rounds`
            : `Round ${phase.round}/${phase.totalRounds}${
                template.exercises.length > 1 ? `  ·  Exercise ${phase.exerciseIndex + 1}/${template.exercises.length}` : ''
              }`}
        </Text>

        <Ring progress={progress} color={color}>
          <Text style={s.clock} adjustsFontSizeToFit numberOfLines={1}>
            {phase.kind === 'prepare' ? Math.ceil(leftMs / 1000) : formatClock(Math.ceil(leftMs / 1000))}
          </Text>
        </Ring>

        <Text style={s.next} numberOfLines={2}>
          <Text style={{ color: C.faint }}>NEXT  </Text>
          {nextLabel}
        </Text>
      </View>

      <View style={s.controls}>
        <Ctrl icon="play-skip-forward-outline" label="Skip round" onPress={() => jumpTo(nextRoundIndex(phases, idx))} />
        <Pressable
          style={[s.playBtn, { backgroundColor: color }]}
          onPress={paused ? resume : pause}
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={42} color="#fff" />
        </Pressable>
        {/* on the last round/exercise, skipping finishes the workout */}
        <Ctrl icon="play-forward-outline" label="Skip exercise" onPress={() => jumpTo(nextExerciseIndex(phases, idx))} />
      </View>
    </SafeAreaView>
  );
}

function tint(hex: string) {
  // very dark wash of the phase colour so the whole screen reads at a glance
  return hex + '22';
}

function TopBar({ onExit, right }: { onExit: () => void; right?: string }) {
  return (
    <View style={s.topBar}>
      <Pressable onPress={onExit} hitSlop={12} style={s.exitBtn} accessibilityLabel="Exit workout">
        <Ionicons name="close" size={26} color={C.text} />
      </Pressable>
      {right ? <Text style={s.topRight}>{right}</Text> : null}
    </View>
  );
}

function Ctrl({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[s.ctrl, disabled && { opacity: 0.3 }]} onPress={onPress} disabled={disabled} hitSlop={8}>
      <Ionicons name={icon} size={30} color={C.text} />
      <Text style={s.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

/** Progress ring from two clipped, rotating half-rings. No SVG dependency. */
function Ring({ progress, color, children }: { progress: number; color: string; children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.78, height * 0.42, 380);
  const w = Math.max(10, size * 0.06);
  const deg = Math.max(0, Math.min(1, progress)) * 360;
  const half = size / 2;
  const circle = { width: size, height: size, borderRadius: half, borderWidth: w, position: 'absolute' as const };
  const arc = { borderTopColor: color, borderRightColor: color, borderBottomColor: 'transparent', borderLeftColor: 'transparent' };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', marginVertical: 16 }}>
      <View style={[circle, { borderColor: '#ffffff14' }]} />
      {/* right window: 0° → 180° */}
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={[circle, arc, { left: -half, transform: [{ rotate: `${225 + Math.min(deg, 180)}deg` }] }]} />
      </View>
      {/* left window: 180° → 360° */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={[circle, arc, { left: 0, transform: [{ rotate: `${45 + Math.max(0, deg - 180)}deg` }] }]} />
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 48 },
  exitBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  topRight: { color: C.dim, fontSize: 15, fontVariant: ['tabular-nums'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  phase: { fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  exName: { color: C.text, fontSize: 34, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  round: { color: C.dim, fontSize: 18, fontWeight: '600', marginTop: 4, fontVariant: ['tabular-nums'] },
  clock: { color: C.text, fontSize: 88, fontWeight: '800', fontVariant: ['tabular-nums'], paddingHorizontal: 30 },
  next: { color: C.text, fontSize: 17, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingBottom: 24, paddingTop: 8 },
  ctrl: { alignItems: 'center', gap: 4, width: 96 },
  ctrlLabel: { color: C.dim, fontSize: 12 },
  playBtn: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  dim: { color: C.dim, fontSize: 16, textAlign: 'center' },
  bigBtn: { backgroundColor: C.cardHi, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  bigBtnText: { color: C.text, fontSize: 17, fontWeight: '600' },
  startBtn: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  startText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
});
