import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchTopics, type Difficulty, type TopicsResponse } from '@/api/get-questions';
import { getStreak } from '@/api/progress';
import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';
import { DifficultyBar } from '@/components/difficulty-bar';
import { challenges } from '@/api/challenges';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

const LIST_LABELS: Record<string, string> = {
  neetcode150: 'NeetCode 150',
};

export default function PickerScreen() {
  const [topics, setTopics] = useState<TopicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [t, s] = await Promise.all([fetchTopics(), getStreak()]);
        if (active) {
          setTopics(t);
          setStreak(s);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const open = (extra: { category?: string; list?: string; label: string }) => {
    router.push({
      pathname: '/deck',
      params: {
        ...extra,
        ...(difficulty ? { difficulty } : {}),
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.muted}>Loading topics…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>
            Leet<Text style={{ color: COLORS.accent }}>Swipe</Text>
          </Text>
        </View>

        {/* The streak is shown even at zero. Hiding it until day two means the
            people most likely to churn — first-timers — never learn the app
            tracks one, so there is nothing to protect on day two. */}
        <LinearGradient
          colors={streak > 0 ? ['#2a1c10', '#231d16'] : [COLORS.card, COLORS.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.streakCard, streak > 0 && styles.streakCardActive]}>
          <Text style={styles.streakEmoji}>{streak > 0 ? '🔥' : '👋'}</Text>
          <View style={styles.streakBody}>
            <Text style={styles.streakTitle}>
              {streak > 0
                ? `${streak}-day streak`
                : 'Start your streak'}
            </Text>
            <Text style={styles.streakSub}>
              {streak > 0
                ? 'Answer one question today to keep it alive.'
                : 'Answer a question today and come back tomorrow.'}
            </Text>
          </View>
        </LinearGradient>

        {/* Difficulty filter — applies to whatever you open next. */}
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <View style={styles.diffRow}>
          <Chip label="All" active={difficulty === null} onPress={() => setDifficulty(null)} />
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              label={d}
              color={DIFFICULTY_COLOR[d]}
              active={difficulty === d}
              onPress={() => setDifficulty((cur) => (cur === d ? null : d))}
            />
          ))}
        </View>

        {/* Curated lists. */}
        {topics!.lists.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Curated lists</Text>
            {topics!.lists.map((list) => (
              <Pressable
                key={list}
                style={styles.listCard}
                onPress={() => open({ list, label: LIST_LABELS[list] ?? list })}>
                <Text style={styles.listTitle}>{LIST_LABELS[list] ?? list}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </>
        )}

        {/* Code challenges — a different mode from the swipe deck, so it gets
            its own entry point rather than hiding inside a topic. */}
        {challenges.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Write code</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.challengeRow}>
              {challenges.map((c) => (
                <Pressable
                  key={c.challengeId}
                  style={({ pressed }) => [styles.challengeCard, pressed && styles.topicCardPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.title} code challenge, ${c.difficulty}`}
                  onPress={() => router.push({ pathname: '/challenge', params: { id: c.challengeId } })}>
                  <Text style={styles.challengeTitle} numberOfLines={2}>
                    {c.title}
                  </Text>
                  <View style={styles.challengeMeta}>
                    <Text style={[styles.challengeDiff, { color: DIFFICULTY_COLOR[c.difficulty] }]}>
                      {c.difficulty}
                    </Text>
                    <Text style={styles.challengeTime}>~{c.timeEstimate}m</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Topic categories. */}
        <Text style={styles.sectionLabel}>Topics</Text>
        {topics!.categories.map((c) => (
          <Pressable
            key={c.category}
            accessibilityRole="button"
            accessibilityLabel={`${c.category}, ${c.total} questions`}
            style={({ pressed }) => [styles.topicCard, pressed && styles.topicCardPressed]}
            onPress={() => open({ category: c.category, label: c.category })}>
            <View style={styles.topicHeader}>
              <Text style={styles.topicTitle} numberOfLines={1}>
                {c.category}
              </Text>
              <Text style={styles.topicCount}>{c.total}</Text>
            </View>
            <DifficultyBar easy={c.easy} medium={c.medium} hard={c.hard} />
          </Pressable>
        ))}

        <Text style={styles.footer}>
          {topics!.total} questions available{difficulty ? ` · filtering ${difficulty}` : ''}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  const tint = color ?? COLORS.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: tint, borderColor: tint },
      ]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  wrap: { padding: 20, gap: 10, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  brand: { color: COLORS.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  streakCardActive: { borderColor: '#ffb45455', backgroundColor: '#231d16' },
  streakEmoji: { fontSize: 26 },
  streakBody: { flex: 1 },
  streakTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  streakSub: { color: COLORS.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 14,
  },
  diffRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
  },
  chipText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16202e',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 16,
    padding: 18,
  },
  listTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  topicCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
  },
  topicCardPressed: { borderColor: COLORS.accent, backgroundColor: '#1a222e' },
  challengeRow: { gap: 10, paddingVertical: 2, paddingRight: 4 },
  challengeCard: {
    width: 150,
    minHeight: 92,
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  challengeTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  challengeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  challengeDiff: { fontSize: 12, fontWeight: '700' },
  challengeTime: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  topicTitle: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '700' },
  topicCount: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chevron: { color: COLORS.muted, fontSize: 26, fontWeight: '300', marginLeft: 12 },
  footer: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  muted: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: 8 },
});
