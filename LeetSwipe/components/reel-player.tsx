/**
 * One algorithm reel, filling the screen.
 *
 * Layout, top to bottom: title and complexity, the data structure, the code with
 * the executing line lit up, then the explanation and controls. That order is
 * deliberate — the eye lands on the structure changing, and the code below it
 * explains why.
 *
 * Advancing is tap-to-step rather than a timer. An auto-play timer forces a pace
 * on a reader who is still thinking, and an algorithm walkthrough is not a video.
 * Narration is opt-in for the same reason, and speaks the current step on demand.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

import { codeLines, estimatedSeconds, type AlgorithmReel } from '@/api/reels';
import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';
import { VisualizationView } from '@/components/visualization';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// Line metrics are needed in JS to scroll the code pane, so they live here and
// the stylesheet reads them rather than the other way round.
const CODE_LINE_HEIGHT = 21;
const CODE_PANE_HEIGHT = 178;

interface Props {
  reel: AlgorithmReel;
  /** False when this reel is scrolled off-screen, so it stops speaking. */
  active: boolean;
  height: number;
  narrate: boolean;
  onToggleNarrate: () => void;
}

export function ReelPlayer({ reel, active, height, narrate, onToggleNarrate }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = reel.steps[stepIndex];
  const lines = useMemo(() => codeLines(reel), [reel]);
  const highlighted = useMemo(
    () => new Set(step?.highlightLines ?? []),
    [step],
  );
  // Tracks the speech we started, so cleanup never stops someone else's audio.
  const speaking = useRef(false);
  const codeRef = useRef<ScrollView>(null);

  // Keep the executing line on screen. Without this a reel whose code is longer
  // than the pane highlights a line the reader cannot see.
  useEffect(() => {
    const first = step?.highlightLines?.[0];
    if (first == null) return;
    // Aim to sit the line a third of the way down rather than at the very top,
    // so the lines around it stay readable for context.
    const y = Math.max(0, (first - 1) * CODE_LINE_HEIGHT - CODE_PANE_HEIGHT / 3);
    codeRef.current?.scrollTo({ y, animated: true });
  }, [step]);

  const stop = useCallback(() => {
    if (speaking.current) {
      Speech.stop();
      speaking.current = false;
    }
  }, []);

  // Speak the current step. Re-runs when the step changes, when narration is
  // toggled, and when the reel scrolls in or out of view.
  useEffect(() => {
    stop();
    if (!active || !narrate || !step) return;
    speaking.current = true;
    Speech.speak(step.audioScript, {
      rate: 0.98,
      pitch: 1.0,
      onDone: () => {
        speaking.current = false;
      },
      onStopped: () => {
        speaking.current = false;
      },
      onError: () => {
        speaking.current = false;
      },
    });
    return stop;
  }, [active, narrate, step, stop]);

  // Reset to the first step when the reel leaves the screen, so coming back to
  // it starts from the beginning rather than mid-walkthrough.
  useEffect(() => {
    if (!active) setStepIndex(0);
  }, [active]);

  const go = useCallback(
    (delta: number) => {
      setStepIndex((i) => {
        const next = i + delta;
        if (next < 0 || next >= reel.steps.length) return i;
        haptic();
        return next;
      });
    },
    [reel.steps.length],
  );

  const atStart = stepIndex === 0;
  const atEnd = stepIndex === reel.steps.length - 1;

  if (!step) return null;

  return (
    <View style={[styles.screen, { height }]}>
      {/* Header ------------------------------------------------------- */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {reel.algorithmName}
          </Text>
          <View style={styles.badgeRow}>
            <Text style={[styles.badge, { color: DIFFICULTY_COLOR[reel.difficulty] }]}>
              {reel.difficulty}
            </Text>
            {!!reel.timeComplexity && (
              <Text style={styles.badge}>{reel.timeComplexity} time</Text>
            )}
            {!!reel.spaceComplexity && (
              <Text style={styles.badge}>{reel.spaceComplexity} space</Text>
            )}
            <Text style={styles.badge}>~{estimatedSeconds(reel)}s</Text>
          </View>
        </View>
        <Pressable
          onPress={onToggleNarrate}
          hitSlop={10}
          accessibilityRole="switch"
          accessibilityState={{ checked: narrate }}
          accessibilityLabel={narrate ? 'Turn narration off' : 'Turn narration on'}
          style={[styles.audioButton, narrate && styles.audioButtonOn]}>
          <Text style={[styles.audioIcon, narrate && styles.audioIconOn]}>
            {narrate ? '🔊' : '🔇'}
          </Text>
        </Pressable>
      </View>

      {/* Progress ----------------------------------------------------- */}
      <View style={styles.progressRow}>
        {reel.steps.map((s, i) => (
          <View
            key={s.stepNumber}
            style={[
              styles.progressSegment,
              i < stepIndex && styles.progressDone,
              i === stepIndex && styles.progressCurrent,
            ]}
          />
        ))}
      </View>

      {/* Visualisation ------------------------------------------------ */}
      <View style={styles.vizPane}>
        <VisualizationView viz={step.visualization} />
      </View>

      {/* Code --------------------------------------------------------- */}
      <ScrollView
        ref={codeRef}
        style={styles.codePane}
        contentContainerStyle={styles.codeContent}
        showsVerticalScrollIndicator={false}>
        {lines.map((line, i) => {
          const on = highlighted.has(i + 1);
          return (
            <View key={i} style={[styles.codeLine, on && styles.codeLineActive]}>
              <Text style={[styles.gutter, on && styles.gutterActive]}>{i + 1}</Text>
              <Text style={[styles.code, on && styles.codeActive]}>{line || ' '}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Explanation -------------------------------------------------- */}
      <View style={styles.explainPane}>
        <Text style={styles.stepCount}>
          Step {stepIndex + 1} of {reel.steps.length}
        </Text>
        <Text style={styles.explanation}>{step.explanation}</Text>
      </View>

      {/* Controls ----------------------------------------------------- */}
      <View style={styles.controls}>
        <Pressable
          onPress={() => go(-1)}
          disabled={atStart}
          accessibilityRole="button"
          accessibilityLabel="Previous step"
          style={[styles.control, styles.controlSecondary, atStart && styles.controlDisabled]}>
          <Text style={[styles.controlText, atStart && styles.controlTextDisabled]}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => (atEnd ? setStepIndex(0) : go(1))}
          accessibilityRole="button"
          accessibilityLabel={atEnd ? 'Replay from the first step' : 'Next step'}
          style={[styles.control, styles.controlPrimary]}>
          <Text style={styles.controlPrimaryText}>{atEnd ? 'Replay' : 'Next step'}</Text>
        </Pressable>
      </View>

      {atEnd && (
        <Text style={styles.swipeHint}>Swipe up for the next algorithm</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingTop: 8, justifyContent: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  badge: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  audioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  audioButtonOn: { borderColor: COLORS.accent, backgroundColor: '#1d3a5f' },
  audioIcon: { fontSize: 16, opacity: 0.6 },
  audioIconOn: { opacity: 1 },
  progressRow: { flexDirection: 'row', gap: 3, marginTop: 14 },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  progressDone: { backgroundColor: '#2f5a8f' },
  progressCurrent: { backgroundColor: COLORS.accent },
  // The visualisation takes the slack on a tall screen — it is what the reader
  // is meant to be watching, so empty space belongs to it rather than pooling
  // above the buttons.
  vizPane: {
    flex: 1,
    marginTop: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    minHeight: 172,
  },
  codePane: {
    height: CODE_PANE_HEIGHT,
    flexGrow: 0,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  codeContent: { paddingVertical: 10 },
  codeLine: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    height: CODE_LINE_HEIGHT,
    alignItems: 'center',
  },
  codeLineActive: { backgroundColor: '#1d3a5f' },
  gutter: {
    width: 22,
    fontSize: 11,
    color: '#4d5967',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  gutterActive: { color: COLORS.accent, fontWeight: '700' },
  code: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.muted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  codeActive: { color: '#cfe4ff', fontWeight: '600' },
  explainPane: { marginTop: 14, marginBottom: 14, minHeight: 78 },
  stepCount: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  explanation: { marginTop: 6, fontSize: 15, lineHeight: 22, color: COLORS.text },
  controls: { flexDirection: 'row', gap: 10, paddingBottom: 8 },
  control: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  controlSecondary: {
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  controlPrimary: { flex: 1, backgroundColor: COLORS.accent },
  controlDisabled: { opacity: 0.35 },
  controlText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  controlTextDisabled: { color: COLORS.muted },
  controlPrimaryText: { color: '#0e1116', fontWeight: '800', fontSize: 15 },
  swipeHint: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.muted,
    paddingBottom: 6,
  },
});
