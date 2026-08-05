/**
 * A code challenge: read the problem, write the function, run the tests.
 *
 * Grading happens on device (see api/code-runner.ts), so Run is instant and
 * works offline. That is what makes it reasonable to let someone hammer the
 * button — there is no per-run cost and no round trip.
 *
 * Hints are revealed one at a time rather than all at once. A learner who can
 * see hint three has no reason to read hint one, and hint one is the one that
 * actually teaches.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { challengeById, challenges } from '@/api/challenges';
import { runTests, type RunOutcome } from '@/api/code-runner';
import { awardXp } from '@/api/profile';
import { COLORS, DIFFICULTY_COLOR } from '@/constants/colors';
import { Celebration } from '@/components/celebration';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * Render `backtick spans` as inline code.
 *
 * Problem statements are written in light markdown because that is how they
 * read in the source data; without this the learner sees literal backticks
 * around every variable name.
 */
function Statement({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <Text style={styles.statement}>
      {parts.map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <Text key={i} style={styles.inlineCode}>
            {part.slice(1, -1)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const challenge = useMemo(
    () => (params.id ? challengeById(params.id) : challenges[0]) ?? challenges[0],
    [params.id],
  );

  const [code, setCode] = useState(challenge?.starterCode ?? '');
  const [result, setResult] = useState<RunOutcome | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [solved, setSolved] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [burst, setBurst] = useState<number | null>(null);

  const run = useCallback(() => {
    if (!challenge) return;
    const outcome = runTests(code, challenge.functionName, challenge.testCases);
    setResult(outcome);
    if (outcome.passed) {
      // Only the first pass earns — re-running a solved challenge is free.
      if (!solved) awardXp('challengeSolved');
      setSolved(true);
      setBurst((n) => (n ?? 0) + 1);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } else if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [challenge, code, solved]);

  const reset = useCallback(() => {
    setCode(challenge?.starterCode ?? '');
    setResult(null);
    setSolved(false);
    setShowSolution(false);
  }, [challenge]);

  if (!challenge) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Text style={styles.emptyTitle}>No challenges available</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const passedCount = result?.cases.filter((c) => c.passed).length ?? 0;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerMeta}>~{challenge.timeEstimate} min</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Celebration trigger={burst} />

          <View style={styles.titleRow}>
            <Text style={styles.title}>{challenge.title}</Text>
            <Text style={[styles.difficulty, { color: DIFFICULTY_COLOR[challenge.difficulty] }]}>
              {challenge.difficulty}
            </Text>
          </View>
          <Statement text={challenge.problemStatement} />

          {/* Editor -------------------------------------------------- */}
          <Text style={styles.sectionLabel}>Your solution</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            // Smart quotes turn " into “ and break the code silently, which is
            // a miserable thing to debug on a phone.
            keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
            style={styles.editor}
            accessibilityLabel="Code editor"
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.control, styles.runBtn]}
              onPress={run}
              accessibilityRole="button">
              <Text style={styles.runBtnText}>Run tests</Text>
            </Pressable>
            <Pressable
              style={[styles.control, styles.secondaryBtn]}
              onPress={reset}
              accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>Reset</Text>
            </Pressable>
          </View>

          {/* Results ------------------------------------------------- */}
          {result && (
            <View style={styles.results}>
              {result.error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorTitle}>Your code didn&apos;t run</Text>
                  <Text style={styles.errorText}>{result.error}</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.resultHeader, solved && styles.resultHeaderPass]}>
                    {solved
                      ? `All ${result.cases.length} tests passed`
                      : `${passedCount} of ${result.cases.length} tests passed`}
                    <Text style={styles.timing}> · {result.durationMs}ms</Text>
                  </Text>
                  {result.cases.map((c, i) => (
                    <View key={i} style={[styles.caseRow, c.passed ? styles.casePass : styles.caseFail]}>
                      <Text style={styles.caseIcon}>{c.passed ? '✓' : '✗'}</Text>
                      <View style={styles.caseBody}>
                        <Text style={styles.caseInput} numberOfLines={2}>
                          {challenge.functionName}({c.input})
                        </Text>
                        {!c.passed && (
                          <>
                            <Text style={styles.caseDetail}>
                              expected {c.expected} · got {c.actual}
                            </Text>
                            {!!c.error && <Text style={styles.caseError}>{c.error}</Text>}
                            {!!c.note && <Text style={styles.caseNote}>this case checks: {c.note}</Text>}
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Hints --------------------------------------------------- */}
          {!solved && (
            <View style={styles.hints}>
              {challenge.hints.slice(0, hintsShown).map((hint, i) => (
                <View key={i} style={styles.hintBox}>
                  <Text style={styles.hintLabel}>Hint {i + 1}</Text>
                  <Text style={styles.hintText}>{hint}</Text>
                </View>
              ))}
              {hintsShown < challenge.hints.length && (
                <Pressable
                  style={styles.hintButton}
                  onPress={() => setHintsShown((n) => n + 1)}
                  accessibilityRole="button">
                  <Text style={styles.hintButtonText}>
                    {hintsShown === 0
                      ? 'Show a hint'
                      : `Show hint ${hintsShown + 1} of ${challenge.hints.length}`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Solution — only once solved or all hints are spent, so it is
              never the path of least resistance. */}
          {(solved || hintsShown >= challenge.hints.length) && (
            <View style={styles.solutionWrap}>
              {!showSolution ? (
                <Pressable
                  style={styles.hintButton}
                  onPress={() => setShowSolution(true)}
                  accessibilityRole="button">
                  <Text style={styles.hintButtonText}>
                    {solved ? 'Compare with the reference solution' : 'Show the solution'}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Reference solution</Text>
                  <Text style={styles.solutionCode}>{challenge.solution}</Text>
                  <View style={styles.explainBox}>
                    <Text style={styles.explainText}>{challenge.explanation}</Text>
                    {!!challenge.timeComplexity && (
                      <Text style={styles.complexity}>
                        {challenge.timeComplexity} time · {challenge.spaceComplexity} space
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  back: { color: COLORS.accent, fontSize: 16, fontWeight: '700' },
  headerMeta: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  body: { paddingHorizontal: 18, paddingBottom: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { flex: 1, color: COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  difficulty: { fontSize: 13, fontWeight: '700' },
  statement: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  inlineCode: { color: '#cfe4ff', fontFamily: MONO, fontSize: 13.5 },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  editor: {
    minHeight: 190,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  control: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  runBtn: { flex: 1, backgroundColor: COLORS.accent },
  runBtnText: { color: '#0e1116', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#0e1116', fontWeight: '800' },
  results: { marginTop: 18, gap: 8 },
  resultHeader: { color: COLORS.wrong, fontSize: 15, fontWeight: '800' },
  resultHeaderPass: { color: COLORS.correct },
  timing: { color: COLORS.muted, fontWeight: '600', fontSize: 12 },
  caseRow: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    backgroundColor: COLORS.card,
  },
  casePass: { borderColor: '#2fbf7144' },
  caseFail: { borderColor: '#ff5d5d55' },
  caseIcon: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  caseBody: { flex: 1 },
  caseInput: { color: COLORS.text, fontFamily: MONO, fontSize: 12 },
  caseDetail: { color: COLORS.muted, fontSize: 12, marginTop: 4, fontFamily: MONO },
  caseError: { color: COLORS.wrong, fontSize: 12, marginTop: 4 },
  caseNote: { color: COLORS.muted, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  errorBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ff5d5d55',
    backgroundColor: '#1e1416',
    padding: 14,
  },
  errorTitle: { color: COLORS.wrong, fontWeight: '800', fontSize: 14 },
  errorText: { color: COLORS.muted, fontSize: 13, marginTop: 6, fontFamily: MONO },
  hints: { marginTop: 20, gap: 10 },
  hintBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
  },
  hintLabel: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  hintText: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  hintButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  hintButtonText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
  solutionWrap: { marginTop: 18 },
  solutionCode: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    color: '#cfe4ff',
    fontFamily: MONO,
    fontSize: 12.5,
    lineHeight: 19,
  },
  explainBox: { marginTop: 12 },
  explainText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  complexity: { color: COLORS.accent, fontSize: 13, fontWeight: '700', marginTop: 8 },
});
