/**
 * Learn — a vertical feed of algorithm walkthroughs.
 *
 * One reel per screen, paged like a short-video feed. Only the reel in view is
 * "active", which is what stops the others narrating over each other.
 *
 * The narration preference is owned here rather than inside the player so it
 * survives scrolling between reels — turning audio on once should keep it on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import * as Speech from '@/api/voice';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchReels, reelCategories, type AlgorithmReel } from '@/api/reels';
import { COLORS } from '@/constants/colors';
import { ReelPlayer } from '@/components/reel-player';

// A page must be exactly the list's height for paging to land cleanly, so the
// player is told the height rather than measuring it itself.
const PAGE_HEIGHT = Dimensions.get('window').height;

export default function LearnScreen() {
  const [reels, setReels] = useState<AlgorithmReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [narrate, setNarrate] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [listHeight, setListHeight] = useState(PAGE_HEIGHT);
  const listRef = useRef<FlatList<AlgorithmReel>>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const data = await fetchReels(category ? { category } : {});
      if (!mounted) return;
      setReels(data);
      setActiveIndex(0);
      setLoading(false);
      // A filter change must not leave the feed scrolled into the old list.
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    })();
    return () => {
      mounted = false;
    };
  }, [category]);

  // Leaving the tab must silence narration — otherwise it keeps talking over
  // the deck on the next screen.
  useFocusEffect(
    useCallback(() => {
      return () => {
        Speech.stop();
      };
    }, []),
  );

  useEffect(() => () => { Speech.stop(); }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
    },
  ).current;

  // A reel counts as in view only once it mostly fills the screen, so the
  // handover between pages is unambiguous.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const categories = reelCategories();

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.muted}>Loading walkthroughs…</Text>
      </SafeAreaView>
    );
  }

  if (reels.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Text style={styles.emptyTitle}>No walkthroughs here yet</Text>
        <Text style={styles.muted}>Try another topic.</Text>
        <Pressable style={styles.resetButton} onPress={() => setCategory(null)}>
          <Text style={styles.resetText}>Show all</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.filterBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[null, ...categories]}
          keyExtractor={(c) => c ?? 'all'}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const on = category === item;
            return (
              <Pressable
                onPress={() => setCategory(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {item ?? 'All'}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View
        style={styles.feed}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
        <FlatList
          ref={listRef}
          data={reels}
          keyExtractor={(r) => r.reelId}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={listHeight}
          snapToAlignment="start"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: listHeight,
            offset: listHeight * index,
            index,
          })}
          // Keeping neighbours mounted makes paging feel instant; anything
          // further away is torn down so narration state cannot leak.
          windowSize={3}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            <ReelPlayer
              reel={item}
              active={index === activeIndex}
              height={listHeight}
              narrate={narrate}
              onToggleNarrate={() => setNarrate((n) => !n)}
            />
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: COLORS.muted, fontSize: 14 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  resetButton: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
  },
  resetText: { color: '#0e1116', fontWeight: '700' },
  filterBar: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filterRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipOn: { borderColor: COLORS.accent, backgroundColor: '#1d3a5f' },
  chipText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#cfe4ff' },
  feed: { flex: 1 },
});
