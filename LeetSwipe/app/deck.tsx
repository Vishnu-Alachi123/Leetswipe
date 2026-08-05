import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchQuestions, type Difficulty, type Question } from '@/api/get-questions';
import { saveQuestion } from '@/api/saved';
import { getSeen, markSeen, recordActivity } from '@/api/progress';
import * as Speech from '@/api/voice';

import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';
import { Celebration } from '@/components/celebration';
import { VisualizationView } from '@/components/visualization';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;
const SWIPE_OUT_DURATION = 220;

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export default function DeckScreen() {
  const params = useLocalSearchParams<{
    category?: string;
    difficulty?: string;
    list?: string;
    label?: string;
  }>();
  const baseLabel = params.label || params.category || params.list || 'All questions';
  // Name the active difficulty in the header, so the filter being applied is
  // visible rather than taken on faith.
  const filterLabel = params.difficulty ? `${baseLabel} · ${params.difficulty}` : baseLabel;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [savedList, setSavedList] = useState<Question[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  // Bumped on each correct answer; the Celebration keys its burst off the value.
  const [burst, setBurst] = useState<number | null>(null);
  const celebrate = useCallback(() => setBurst((n) => (n ?? 0) + 1), []);
  // Read explanations aloud after answering. Off by default — audio that
  // starts unasked in a quiet room is how apps get uninstalled.
  const [narrate, setNarrate] = useState(false);
  // Small phones need tighter spacing, otherwise a card carrying a diagram
  // pushes the fourth answer option below the fold.
  const { height: windowHeight } = useWindowDimensions();
  const short = windowHeight < 700;
  // On a small screen a card carrying a diagram genuinely cannot fit, so the
  // card scrolls. Scrolling is useless if it isn't discoverable — track whether
  // there is more below and fade the card's bottom edge to say so.
  const [moreBelow, setMoreBelow] = useState(false);
  const cardScroll = useRef({ contentH: 0, viewH: 0 });
  const updateOverflow = useCallback(() => {
    const { contentH, viewH } = cardScroll.current;
    setMoreBelow(contentH > viewH + 8);
  }, []);

  const speak = useCallback(
    (correct: boolean, explanation: string) => {
      if (!narrate) return;
      Speech.stop();
      // A short verdict first, so the audio is useful even if the listener
      // stops it before the full explanation.
      const lead = correct ? 'Correct. ' : 'Not quite. ';
      Speech.speak(lead + explanation);
    },
    [narrate],
  );

  // Leaving the deck must never leave a voice talking over the next screen.
  useEffect(() => () => { Speech.stop(); }, []);

  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const seen = await getSeen();
      const qs = await fetchQuestions({
        category: params.category,
        difficulty: params.difficulty as Difficulty | undefined,
        list: params.list,
        exclude: seen,
        limit: 30,
      });
      if (mounted) {
        setQuestions(qs);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.category, params.difficulty, params.list]);

  const current = questions[index];

  const advance = useCallback(
    (direction: 'left' | 'right') => {
      if (current) {
        markSeen([current.questionId]);
        if (direction === 'right') {
          saveQuestion(current);
          setSavedCount((n) => n + 1);
          setSavedList((prev) => [...prev, current]);
        }
      }
      position.setValue({ x: 0, y: 0 });
      setSelected(null);
      // Clear the burst so it cannot linger over the next card, and cut any
      // narration mid-sentence — it belongs to the card that just left.
      setBurst(null);
      Speech.stop();
      setIndex((i) => i + 1);
    },
    [current, position],
  );

  const forceSwipe = useCallback(
    (direction: 'left' | 'right') => {
      haptic();
      const x = direction === 'right' ? SCREEN_WIDTH * 1.3 : -SCREEN_WIDTH * 1.3;
      Animated.timing(position, {
        toValue: { x, y: 0 },
        duration: SWIPE_OUT_DURATION,
        useNativeDriver: false,
      }).start(() => advance(direction));
    },
    [advance, position],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) forceSwipe('right');
        else if (g.dx < -SWIPE_THRESHOLD) forceSwipe('left');
        else
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
      },
    }),
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
    outputRange: ['-18deg', '0deg', '18deg'],
  });
  const saveOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const skipOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Record a day of activity once the user finishes the deck.
  useEffect(() => {
    if (!loading && questions.length > 0 && index >= questions.length) {
      recordActivity();
    }
  }, [loading, index, questions.length]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.muted}>Loading questions…</Text>
      </SafeAreaView>
    );
  }

  // Empty state — no questions matched this filter (all seen or none exist).
  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.endWrap}>
          <Text style={styles.title}>All caught up ✅</Text>
          <Text style={styles.muted}>
            No new questions for “{filterLabel}” right now. Try another topic or review your saved
            questions.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Pick another topic</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // End of deck — summary + saved list.
  if (index >= questions.length) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.endWrap} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Deck complete 🎉</Text>
          <Text style={styles.muted}>
            You reviewed {questions.length} question{questions.length === 1 ? '' : 's'} and saved{' '}
            {savedCount}.
          </Text>
          {savedList.length > 0 && <Text style={styles.savedHeader}>Saved to revisit</Text>}
          {savedList.map((q) => (
            <View key={q.questionId} style={styles.savedCard}>
              <Text style={styles.savedTitle}>{q.title}</Text>
              <Text style={styles.muted}>{q.topics.join(' · ')}</Text>
            </View>
          ))}
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Back to topics</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const next = questions[index + 1];
  const answered = selected !== null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          {/* The filter name folds into the back row when its own line is cut. */}
          <Text style={styles.back} numberOfLines={1}>
            ‹ {short ? filterLabel : 'Topics'}
          </Text>
        </Pressable>
        <View style={styles.headerRight}>
          <Text style={styles.progress}>
            {index + 1} / {questions.length} · ♥ {savedCount}
          </Text>
          <Pressable
            onPress={() => {
              setNarrate((n) => {
                if (n) Speech.stop();
                return !n;
              });
            }}
            hitSlop={10}
            accessibilityRole="switch"
            accessibilityState={{ checked: narrate }}
            accessibilityLabel={narrate ? 'Turn spoken explanations off' : 'Turn spoken explanations on'}
            style={[styles.narrateBtn, narrate && styles.narrateBtnOn]}>
            <Text style={styles.narrateIcon}>{narrate ? '🔊' : '🔇'}</Text>
          </Pressable>
        </View>
      </View>
      {!short && (
        <Text style={styles.filterLabel} numberOfLines={1}>
          {filterLabel}
        </Text>
      )}

      <View style={styles.deck}>
        {next && (
          <View style={[styles.card, styles.cardBehind]}>
            <Text style={styles.cardTitle}>{next.title}</Text>
          </View>
        )}
        <Celebration trigger={burst} />

        <Animated.View
          style={[
            styles.card,
            short && styles.cardShort,
            { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
          ]}
          {...panResponder.panHandlers}>
          <Animated.View style={[styles.stamp, styles.saveStamp, { opacity: saveOpacity }]}>
            <Text style={[styles.stampText, { color: COLORS.save }]}>SAVE</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.skipStamp, { opacity: skipOpacity }]}>
            <Text style={[styles.stampText, { color: COLORS.skip }]}>SKIP</Text>
          </Animated.View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onLayout={(e) => {
              cardScroll.current.viewH = e.nativeEvent.layout.height;
              updateOverflow();
            }}
            onContentSizeChange={(_, h) => {
              cardScroll.current.contentH = h;
              updateOverflow();
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              setMoreBelow(contentOffset.y + layoutMeasurement.height < contentSize.height - 8);
            }}>
            <View style={styles.metaRow}>
              <View
                style={[
                  styles.pill,
                  { borderColor: DIFFICULTY_COLOR[current.difficulty] ?? COLORS.muted },
                ]}>
                <Text
                  style={[
                    styles.pillText,
                    { color: DIFFICULTY_COLOR[current.difficulty] ?? COLORS.muted },
                  ]}>
                  {current.difficulty}
                </Text>
              </View>
              <Text style={styles.muted}>{current.topics.join(' · ')}</Text>
            </View>

            <Text style={[styles.cardTitle, short && styles.cardTitleShort]}>{current.title}</Text>
            <Text style={[styles.question, short && styles.questionShort]}>{current.question}</Text>

            {/* Data-driven diagram, drawn by the same renderer the Learn tab
                uses — one component library serves every question format. */}
            {current.visual?.kind && current.visual.state && (
              <View style={styles.visualWrap}>
                {/* Compact: in the deck the diagram supports the question, and
                    a full-height one pushed the answer options below the fold
                    on shorter phones. */}
                <VisualizationView viz={current.visual} compact />
              </View>
            )}

            {current.options.map((opt, i) => {
              const isCorrect = i === current.answer;
              // Base first, so the answered states below keep the compact
              // spacing instead of replacing it.
              const optBase = short ? { ...styles.option, ...styles.optionShort } : styles.option;
              let optStyle = optBase;
              let labelStyle = styles.optionText;
              if (answered && isCorrect) {
                optStyle = { ...optBase, ...styles.optionCorrect };
                labelStyle = { ...styles.optionText, color: '#fff' };
              } else if (answered && i === selected && !isCorrect) {
                optStyle = { ...optBase, ...styles.optionWrong };
                labelStyle = { ...styles.optionText, color: '#fff' };
              }
              return (
                <Pressable
                  key={i}
                  disabled={answered}
                  onPress={() => {
                    setSelected(i);
                    speak(isCorrect, current.explanation);
                    if (isCorrect) {
                      celebrate();
                      // A heavier tap for a right answer, so the feedback is
                      // felt as well as seen.
                      if (Platform.OS !== 'web') {
                        Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Success,
                        ).catch(() => {});
                      }
                    } else {
                      haptic();
                    }
                  }}
                  style={optStyle}>
                  <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
                  <Text style={labelStyle}>{opt}</Text>
                </Pressable>
              );
            })}

            {answered && (
              <View style={styles.explain}>
                <Text style={styles.explainHeader}>
                  {selected === current.answer ? '✓ Correct' : '✗ Not quite'}
                </Text>
                <Text style={styles.explainText}>{current.explanation}</Text>
              </View>
            )}
          </ScrollView>

          {/* Fade the bottom edge while content remains below, so a clipped
              answer option reads as "scroll for more" rather than "missing". */}
          {moreBelow && (
            <LinearGradient
              pointerEvents="none"
              colors={['#171c2400', COLORS.card]}
              style={styles.scrollFade}>
              <Text style={styles.scrollFadeHint}>▾ more</Text>
            </LinearGradient>
          )}
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, { borderColor: COLORS.skip }]}
          onPress={() => forceSwipe('left')}>
          <Text style={[styles.actionText, { color: COLORS.skip }]}>Skip ✕</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { borderColor: COLORS.save }]}
          onPress={() => forceSwipe('right')}>
          <Text style={[styles.actionText, { color: COLORS.save }]}>Save ♥</Text>
        </Pressable>
      </View>
      {/* On short screens every row counts; the gestures are discoverable from
          the buttons themselves. */}
      {!short && (
        <Text style={styles.hint}>Tap an answer to check it · swipe or use the buttons to move on</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  header: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: { color: COLORS.accent, fontSize: 15, fontWeight: '700' },
  filterLabel: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 4,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  progress: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  narrateBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrateBtnOn: { borderColor: COLORS.accent, backgroundColor: '#1d3a5f' },
  narrateIcon: { fontSize: 13 },
  visualWrap: {
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: '#10151d',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deck: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: {
    position: 'absolute',
    width: '100%',
    maxWidth: 460,
    // Height follows the content up to this ceiling. A fixed height left a
    // short question sitting above a large empty panel.
    maxHeight: '92%',
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
  },
  scrollFade: {
    position: 'absolute',
    left: 1,
    right: 1,
    bottom: 1,
    height: 46,
    borderBottomLeftRadius: 21,
    borderBottomRightRadius: 21,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  scrollFadeHint: { color: COLORS.accent, fontSize: 11, fontWeight: '700' },
  cardShort: { padding: 16 },
  cardTitleShort: { fontSize: 18, marginBottom: 6 },
  questionShort: { fontSize: 15, lineHeight: 21, marginBottom: 10 },
  // padding stays at 11 so each row is still a comfortable ~43px tap target;
  // the savings come from the gaps between them.
  optionShort: { padding: 11, marginBottom: 5, gap: 10 },
  cardBehind: { backgroundColor: COLORS.cardBehind, transform: [{ scale: 0.95 }, { translateY: 14 }] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: 10, letterSpacing: -0.3 },
  question: { color: COLORS.text, fontSize: 16, lineHeight: 23, marginBottom: 14 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#10151d',
  },
  optionCorrect: { backgroundColor: COLORS.correct, borderColor: COLORS.correct },
  optionWrong: { backgroundColor: COLORS.wrong, borderColor: COLORS.wrong },
  optionLetter: { color: COLORS.accent, fontWeight: '800', fontSize: 15, width: 18 },
  optionText: { color: COLORS.text, fontSize: 15, flex: 1, lineHeight: 21 },
  explain: {
    marginTop: 6,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#101720',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  explainHeader: { color: COLORS.text, fontWeight: '800', fontSize: 15, marginBottom: 6 },
  explainText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  stamp: {
    position: 'absolute',
    top: 26,
    zIndex: 10,
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  saveStamp: { right: 24, borderColor: COLORS.save, transform: [{ rotate: '18deg' }] },
  skipStamp: { left: 24, borderColor: COLORS.skip, transform: [{ rotate: '-18deg' }] },
  stampText: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  actions: { flexDirection: 'row', gap: 14, paddingHorizontal: 20, width: '100%', maxWidth: 460 },
  actionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  actionText: { fontSize: 16, fontWeight: '800' },
  hint: { color: COLORS.muted, fontSize: 12, paddingVertical: 10, textAlign: 'center', paddingHorizontal: 20 },
  muted: { color: COLORS.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  endWrap: { padding: 24, alignItems: 'center', gap: 10 },
  savedHeader: { color: COLORS.text, fontWeight: '800', fontSize: 16, marginTop: 18, alignSelf: 'flex-start' },
  savedCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  savedTitle: { color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
