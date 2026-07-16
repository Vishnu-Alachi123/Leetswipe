import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { getSaved, unsaveQuestion, type SavedQuestion } from '@/api/saved';
import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';

type SortKey = 'recent' | 'difficulty' | 'category' | 'title';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently saved' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'category', label: 'Category' },
  { key: 'title', label: 'Title (A–Z)' },
];

const DIFF_ORDER: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };

export default function SavedScreen() {
  const [saved, setSaved] = useState<SavedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('recent');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      getSaved().then((list) => {
        if (active) {
          setSaved(list);
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const categories = useMemo(
    () => Array.from(new Set(saved.map((q) => q.category))).sort(),
    [saved],
  );

  const visible = useMemo(() => {
    let out = [...saved];
    if (filterCategory) out = out.filter((q) => q.category === filterCategory);
    if (filterDifficulty) out = out.filter((q) => q.difficulty === filterDifficulty);
    switch (sort) {
      case 'difficulty':
        out.sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1));
        break;
      case 'category':
        out.sort((a, b) => a.category.localeCompare(b.category));
        break;
      case 'title':
        out.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'recent':
      default:
        out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    }
    return out;
  }, [saved, sort, filterCategory, filterDifficulty]);

  const remove = async (id: string) => {
    setSaved(await unsaveQuestion(id));
    if (expanded === id) setExpanded(null);
  };

  const activeFilters = (filterCategory ? 1 : 0) + (filterDifficulty ? 1 : 0);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>Saved</Text>
        <Pressable style={styles.sortBtn} onPress={() => setMenuOpen(true)} hitSlop={10}>
          <Text style={styles.sortBtnText}>
            ⇅ Sort{activeFilters ? ` · ${activeFilters}` : ''}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : saved.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No saved questions yet</Text>
          <Text style={styles.muted}>Swipe right (or tap Save ♥) on a card to keep it here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.count}>
            {visible.length} of {saved.length} saved
          </Text>
          {visible.map((q) => {
            const isOpen = expanded === q.questionId;
            return (
              <Pressable
                key={q.questionId}
                style={styles.card}
                onPress={() => setExpanded(isOpen ? null : q.questionId)}>
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.pill,
                      { borderColor: DIFFICULTY_COLOR[q.difficulty] ?? COLORS.muted },
                    ]}>
                    <Text
                      style={[
                        styles.pillText,
                        { color: DIFFICULTY_COLOR[q.difficulty] ?? COLORS.muted },
                      ]}>
                      {q.difficulty}
                    </Text>
                  </View>
                  <Text style={styles.category}>{q.category}</Text>
                </View>
                <Text style={styles.cardTitle}>{q.title}</Text>

                {isOpen && (
                  <View style={styles.detail}>
                    <Text style={styles.question}>{q.question}</Text>
                    {q.options.map((opt, i) => (
                      <View
                        key={i}
                        style={[styles.option, i === q.answer && styles.optionCorrect]}>
                        <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
                        <Text style={[styles.optionText, i === q.answer && { color: '#fff' }]}>
                          {opt}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.explain}>
                      <Text style={styles.explainText}>{q.explanation}</Text>
                    </View>
                    <Pressable style={styles.removeBtn} onPress={() => remove(q.questionId)}>
                      <Text style={styles.removeText}>Remove from saved</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          })}
          {visible.length === 0 && (
            <Text style={styles.muted}>No saved questions match the current filters.</Text>
          )}
        </ScrollView>
      )}

      {/* Sort & filter sheet. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Sort by</Text>
            {SORTS.map((s) => (
              <Pressable key={s.key} style={styles.sheetRow} onPress={() => setSort(s.key)}>
                <Text style={styles.sheetRowText}>{s.label}</Text>
                {sort === s.key && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}

            <Text style={styles.sheetTitle}>Filter difficulty</Text>
            <View style={styles.filterWrap}>
              <FilterChip
                label="All"
                active={filterDifficulty === null}
                onPress={() => setFilterDifficulty(null)}
              />
              {['Easy', 'Medium', 'Hard'].map((d) => (
                <FilterChip
                  key={d}
                  label={d}
                  active={filterDifficulty === d}
                  onPress={() => setFilterDifficulty((cur) => (cur === d ? null : d))}
                />
              ))}
            </View>

            {categories.length > 1 && (
              <>
                <Text style={styles.sheetTitle}>Filter category</Text>
                <View style={styles.filterWrap}>
                  <FilterChip
                    label="All"
                    active={filterCategory === null}
                    onPress={() => setFilterCategory(null)}
                  />
                  {categories.map((c) => (
                    <FilterChip
                      key={c}
                      label={c}
                      active={filterCategory === c}
                      onPress={() => setFilterCategory((cur) => (cur === c ? null : c))}
                    />
                  ))}
                </View>
              </>
            )}

            <Pressable style={styles.doneBtn} onPress={() => setMenuOpen(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.fchip, active && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}>
      <Text style={[styles.fchipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  brand: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  sortBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
  },
  sortBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  muted: { color: COLORS.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  count: { color: COLORS.muted, fontSize: 13, marginBottom: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  category: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  detail: { marginTop: 14, gap: 8 },
  question: { color: COLORS.text, fontSize: 15, lineHeight: 22, marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#10151d',
  },
  optionCorrect: { backgroundColor: COLORS.correct, borderColor: COLORS.correct },
  optionLetter: { color: COLORS.accent, fontWeight: '800', fontSize: 14, width: 16 },
  optionText: { color: COLORS.text, fontSize: 14, flex: 1, lineHeight: 20 },
  explain: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#101720',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  explainText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  removeBtn: { paddingVertical: 10, alignItems: 'center' },
  removeText: { color: COLORS.skip, fontWeight: '700', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    gap: 6,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  sheetTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  sheetRowText: { color: COLORS.text, fontSize: 16 },
  check: { color: COLORS.accent, fontSize: 16, fontWeight: '800' },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fchip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: COLORS.bg,
  },
  fchipText: { color: COLORS.text, fontWeight: '600', fontSize: 13 },
  doneBtn: {
    marginTop: 20,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
