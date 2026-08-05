/**
 * A topic's difficulty mix, as one stacked bar.
 *
 * Replaces "18E · 22M · 5H", which asks the reader to decode three
 * abbreviations and then do the arithmetic themselves. The bar answers the
 * question they actually have — "is this topic mostly easy or mostly hard?" —
 * at a glance, and the counts stay available underneath for anyone who wants
 * the exact numbers.
 */
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';

interface Props {
  easy: number;
  medium: number;
  hard: number;
  /** Show "18 easy · 22 medium · 5 hard" beneath the bar. */
  showCounts?: boolean;
}

export function DifficultyBar({ easy, medium, hard, showCounts = true }: Props) {
  const total = easy + medium + hard;
  if (total === 0) return null;

  // Any non-zero band keeps a visible sliver, so "3 hard out of 300" doesn't
  // round away to nothing and read as "no hard questions here".
  const segments = [
    { n: easy, color: DIFFICULTY_COLOR.Easy, label: 'easy' },
    { n: medium, color: DIFFICULTY_COLOR.Medium, label: 'medium' },
    { n: hard, color: DIFFICULTY_COLOR.Hard, label: 'hard' },
  ].filter((s) => s.n > 0);

  return (
    <View>
      <View
        style={styles.track}
        accessibilityRole="image"
        accessibilityLabel={segments.map((s) => `${s.n} ${s.label}`).join(', ')}>
        {segments.map((s) => (
          <View
            key={s.label}
            style={{
              flexGrow: s.n,
              flexBasis: 3,
              backgroundColor: s.color,
            }}
          />
        ))}
      </View>
      {showCounts && (
        <View style={styles.counts}>
          {segments.map((s) => (
            <View key={s.label} style={styles.countItem}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={styles.countText}>
                {s.n} {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: COLORS.border,
    gap: 2,
  },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  countText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
});
