/**
 * Pattern Match — a round of "which technique does this problem want?"
 *
 * Deliberately stripped down: a statement, four techniques, no code. The whole
 * value is the ten-second reflex, so anything that slows a rep down is cut.
 *
 * The reveal after each answer is where the teaching happens — it names the
 * clue in the statement that pointed to the technique, which is the thing a
 * learner can actually carry to the next problem.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  buildRound,
  buildSpeedRound,
  getMastery,
  recordAttempt,
  type PatternQuestion,
} from '@/api/patterns';
import { awardXp } from '@/api/profile';
import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';
import { Celebration } from '@/components/celebration';

/** Seconds allowed in a speed round. Tight enough to force instinct. */
const SPEED_SECONDS = 60;

export default function PatternMatchScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const speed = params.mode === 'speed';

  const [round, setRound] = useState<PatternQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [burst, setBurst] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SPEED_SECONDS);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      setRound(speed ? buildSpeedRound(20) : buildRound(await getMastery(), 10));
    })();
  }, [speed]);

  // Speed mode is against the clock; the round ends when it runs out.
  useEffect(() => {
    if (!speed || finished || round.length === 0) return;
    if (secondsLeft <= 0) {
      setFinished(true);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [speed, secondsLeft, finished, round.length]);

  const question = round[index];

  const choose = useCallback(
    async (choice: number) => {
      if (picked !== null || !question) return;
      setPicked(choice);
      const right = choice === question.answer;

      if (right) {
        setCorrectCount((n) => n + 1);
        setBurst((n) => (n ?? 0) + 1);
        const award = await awardXp('patternCorrect');
        setXpEarned((x) => x + award.gained);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      } else if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      await recordAttempt(question.category, right);

      // Speed mode moves on immediately — pausing to read defeats the drill.
      if (speed) {
        setTimeout(() => {
          setPicked(null);
          setIndex((i) => (i + 1 < round.length ? i + 1 : i));
        }, 450);
      }
    },
    [picked, question, speed, round.length],
  );

  const next = useCallback(() => {
    setPicked(null);
    setBurst(null);
    if (index + 1 >= round.length) setFinished(true);
    else setIndex((i) => i + 1);
  }, [index, round.length]);

  if (round.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Text style={styles.emptyTitle}>No pattern questions yet</Text>
        <Text style={styles.muted}>Run the patterns generator to add some.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (finished) {
    const answered = speed ? correctCount + (round.length - index) * 0 : round.length;
    const accuracy = Math.round((correctCount / Math.max(1, speed ? index + 1 : answered)) * 100);
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Celebration trigger={correctCount > 0 ? 1 : null} />
        <Text style={styles.bigScore}>{correctCount}</Text>
        <Text style={styles.scoreLabel}>
          correct {speed ? `in ${SPEED_SECONDS}s` : `of ${round.length}`}
        </Text>
        <Text style={styles.accuracy}>{accuracy}% accuracy · +{xpEarned} XP</Text>
        <View style={styles.endActions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              setIndex(0);
              setPicked(null);
              setCorrectCount(0);
              setXpEarned(0);
              setSecondsLeft(SPEED_SECONDS);
              setFinished(false);
              getMastery().then((m) => setRound(speed ? buildSpeedRound(20) : buildRound(m, 10)));
            }}>
            <Text style={styles.primaryBtnText}>Play again</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const answered = picked !== null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        {speed ? (
          <Text style={[styles.timer, secondsLeft <= 10 && styles.timerLow]}>{secondsLeft}s</Text>
        ) : (
          <Text style={styles.progress}>
            {index + 1} / {round.length}
          </Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round((speed ? secondsLeft / SPEED_SECONDS : index / round.length) * 100)}%` as const },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Celebration trigger={burst} />

        <Text style={styles.prompt}>Which technique does this call for?</Text>
        <View style={styles.statementCard}>
          <Text style={styles.statement}>{question.statement}</Text>
        </View>

        {question.options.map((option, i) => {
          const isAnswer = i === question.answer;
          const style = [
            styles.option,
            answered && isAnswer && styles.optionCorrect,
            answered && i === picked && !isAnswer && styles.optionWrong,
          ];
          return (
            <Pressable
              key={option}
              disabled={answered}
              onPress={() => choose(i)}
              accessibilityRole="button"
              style={style}>
              <Text
                style={[
                  styles.optionText,
                  answered && (isAnswer || i === picked) && styles.optionTextOn,
                ]}>
                {option}
              </Text>
            </Pressable>
          );
        })}

        {answered && !speed && (
          <>
            <View style={styles.insightCard}>
              <Text style={styles.insightLabel}>
                {picked === question.answer ? '✓ Right' : '✗ Not this time'}
              </Text>
              <Text style={styles.insightText}>{question.insight}</Text>
              <Text style={styles.sourceNote}>
                From “{question.title}” ·{' '}
                <Text style={{ color: DIFFICULTY_COLOR[question.difficulty] }}>
                  {question.difficulty}
                </Text>
              </Text>
            </View>
            <Pressable onPress={next} style={styles.nextWrap} accessibilityRole="button">
              <LinearGradient
                colors={['#4f9dff', '#3a7fe0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.nextBtn}>
                <Text style={styles.nextText}>
                  {index + 1 >= round.length ? 'See results' : 'Next problem'}
                </Text>
              </LinearGradient>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  back: { color: COLORS.accent, fontSize: 16, fontWeight: '700' },
  progress: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  timer: { color: COLORS.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerLow: { color: COLORS.wrong },
  progressTrack: { height: 3, backgroundColor: COLORS.border, marginHorizontal: 20, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: COLORS.accent, borderRadius: 2 },
  body: { padding: 20, paddingBottom: 40 },
  prompt: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  statementCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  statement: { color: COLORS.text, fontSize: 16, lineHeight: 24 },
  option: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#10151d',
    minHeight: 52,
    justifyContent: 'center',
  },
  optionCorrect: { backgroundColor: COLORS.correct, borderColor: COLORS.correct },
  optionWrong: { backgroundColor: COLORS.wrong, borderColor: COLORS.wrong },
  optionText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  optionTextOn: { color: '#fff', fontWeight: '800' },
  insightCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#101720',
    padding: 16,
  },
  insightLabel: { color: COLORS.text, fontWeight: '800', fontSize: 15, marginBottom: 6 },
  insightText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  sourceNote: { color: '#4d5967', fontSize: 12, marginTop: 10 },
  nextWrap: { marginTop: 14 },
  nextBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  nextText: { color: '#0e1116', fontWeight: '800', fontSize: 15 },
  bigScore: { color: COLORS.text, fontSize: 64, fontWeight: '900' },
  scoreLabel: { color: COLORS.muted, fontSize: 16 },
  accuracy: { color: COLORS.accent, fontSize: 15, fontWeight: '700', marginTop: 6 },
  endActions: { flexDirection: 'row', gap: 12, marginTop: 26 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  muted: { color: COLORS.muted, fontSize: 14, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#0e1116', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
});
