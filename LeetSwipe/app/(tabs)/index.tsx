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

import { fetchTopics, type Difficulty, type TopicsResponse } from '@/api/get-questions';
import { getStreak } from '@/api/progress';
import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';

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
          {streak > 0 && (
            <View style={styles.streakPill}>
              <Text style={styles.streakText}>🔥 {streak}-day streak</Text>
            </View>
          )}
        </View>
        <Text style={styles.tagline}>Pick a topic and start swiping.</Text>

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

        {/* Topic categories. */}
        <Text style={styles.sectionLabel}>Topics</Text>
        {topics!.categories.map((c) => (
          <Pressable
            key={c.category}
            style={styles.topicCard}
            onPress={() => open({ category: c.category, label: c.category })}>
            <View style={styles.topicMain}>
              <Text style={styles.topicTitle}>{c.category}</Text>
              <Text style={styles.topicMeta}>
                {c.total} question{c.total === 1 ? '' : 's'} · {c.easy}E · {c.medium}M · {c.hard}H
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
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
  streakPill: {
    backgroundColor: '#1c2430',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  streakText: { color: '#ffb454', fontSize: 13, fontWeight: '700' },
  tagline: { color: COLORS.muted, fontSize: 15, marginBottom: 6 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
  },
  topicMain: { flex: 1 },
  topicTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  topicMeta: { color: COLORS.muted, fontSize: 13 },
  chevron: { color: COLORS.muted, fontSize: 26, fontWeight: '300', marginLeft: 12 },
  footer: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  muted: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: 8 },
});
