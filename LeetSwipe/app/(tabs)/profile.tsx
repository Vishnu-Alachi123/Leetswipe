/**
 * Profile — who you are, how far you've come, and what you're weak at.
 *
 * Three jobs, in order of how often they matter: show the avatar and level
 * (the reason to come back), show the mastery map (what to study next), and
 * hold account settings.
 *
 * The mastery map is the honest centrepiece. Unlike a streak or an XP total,
 * it says something specific and actionable — "you keep missing Two Pointers" —
 * and it is trustworthy because Pattern Match questions carry verified labels.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  allPatterns,
  getMastery,
  masteryFraction,
  MASTERY_TARGET,
  type Mastery,
} from '@/api/patterns';
import {
  AVATAR_TIERS,
  getProfile,
  levelForXp,
  levelProgress,
  resetProfile,
  setName,
  tierForLevel,
  type Profile,
} from '@/api/profile';
import { getStreak } from '@/api/progress';
import {
  fetchLeaderboard,
  isConfigured as googleConfigured,
  sessionToken,
  signInWithIdToken,
  signOut,
  syncDown,
  syncUp,
  useGoogleAuthRequest,
  type LeaderboardEntry,
} from '@/api/auth-google';
import { API_URL } from '@/api/config';
import { COLORS } from '@/constants/colors';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mastery, setMastery] = useState<Mastery>({});
  const [streak, setStreak] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [, response, promptAsync] = useGoogleAuthRequest();
  const apiConfigured = Boolean(API_URL);

  const load = useCallback(async () => {
    const [p, m, s, token] = await Promise.all([
      getProfile(),
      getMastery(),
      getStreak(),
      sessionToken(),
    ]);
    setProfile(p);
    setMastery(m);
    setStreak(s);
    setSignedIn(Boolean(token));
    if (token) {
      // Pull first, then push: the merge keeps whichever device is ahead.
      const merged = await syncDown();
      if (merged) setProfile(merged);
      syncUp();
    }
    setBoard(await fetchLeaderboard(20));
  }, []);

  // The auth flow returns here after the browser redirect.
  useEffect(() => {
    const idToken = (response as { params?: { id_token?: string } } | null)?.params?.id_token;
    if (response?.type === 'success' && idToken) {
      signInWithIdToken(idToken).then((user) => {
        if (user) load();
        else Alert.alert('Sign-in failed', 'Could not verify that Google account.');
      });
    }
  }, [response, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profile) {
    return <SafeAreaView style={styles.screen} />;
  }

  const level = levelForXp(profile.xp);
  const tier = tierForLevel(level);
  const nextTier = AVATAR_TIERS[Math.min(level, AVATAR_TIERS.length - 1)];
  const progress = levelProgress(profile.xp);
  const patterns = allPatterns();
  const mastered = patterns.filter((p) => masteryFraction(mastery[p]) >= 1).length;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {/* Avatar + level ------------------------------------------- */}
        <LinearGradient
          colors={[`${tier.color}22`, COLORS.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.avatarCard, { borderColor: `${tier.color}66` }]}>
          <View style={[styles.avatarRing, { borderColor: tier.color }]}>
            <Text style={styles.avatarEmoji}>{tier.emoji}</Text>
          </View>

          {editing ? (
            <View style={styles.nameEditRow}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                autoFocus
                maxLength={24}
                placeholder="Your name"
                placeholderTextColor={COLORS.muted}
                style={styles.nameInput}
              />
              <Pressable
                style={styles.nameSave}
                onPress={async () => {
                  setProfile(await setName(draftName));
                  setEditing(false);
                }}>
                <Text style={styles.nameSaveText}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setDraftName(profile.name);
                setEditing(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit your name">
              <Text style={styles.name}>
                {profile.name} <Text style={styles.editHint}>✎</Text>
              </Text>
            </Pressable>
          )}

          <Text style={[styles.tierName, { color: tier.color }]}>
            Level {level} · {tier.name}
          </Text>
          <Text style={styles.tierBlurb}>{tier.blurb}</Text>

          <View style={styles.xpTrack}>
            <View
              style={[
                styles.xpFill,
                { width: `${Math.round(progress.fraction * 100)}%` as const, backgroundColor: tier.color },
              ]}
            />
          </View>
          <Text style={styles.xpLabel}>
            {progress.needed > 0
              ? `${progress.current} / ${progress.needed} XP to ${nextTier.name}`
              : `${profile.xp} XP · highest tier reached`}
          </Text>
        </LinearGradient>

        {/* Stats ---------------------------------------------------- */}
        <View style={styles.statRow}>
          <Stat value={profile.xp} label="total XP" />
          <Stat value={streak} label="day streak" />
          <Stat value={`${mastered}/${patterns.length}`} label="patterns" />
        </View>

        {/* Mastery map ---------------------------------------------- */}
        <Text style={styles.sectionLabel}>Pattern mastery</Text>
        <Text style={styles.sectionNote}>
          Fills in as you correctly identify each technique. Empty cells are what to study next.
        </Text>

        {patterns.length === 0 ? (
          <Text style={styles.muted}>No pattern questions bundled yet.</Text>
        ) : (
          <View style={styles.masteryGrid}>
            {patterns.map((pattern) => {
              const record = mastery[pattern];
              const fraction = masteryFraction(record);
              const done = fraction >= 1;
              return (
                <View
                  key={pattern}
                  style={[styles.masteryCell, done && styles.masteryCellDone]}>
                  <View style={styles.masteryBarTrack}>
                    <View
                      style={[
                        styles.masteryBarFill,
                        {
                          width: `${Math.round(fraction * 100)}%` as const,
                          backgroundColor: done ? COLORS.correct : COLORS.accent,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.masteryName} numberOfLines={2}>
                    {pattern}
                  </Text>
                  <Text style={styles.masteryCount}>
                    {done ? '✓ mastered' : `${record?.correct ?? 0}/${MASTERY_TARGET}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          style={styles.practiceBtn}
          onPress={() => router.push('/pattern-match')}
          accessibilityRole="button">
          <Text style={styles.practiceText}>Practise weakest patterns →</Text>
        </Pressable>

        {/* Account -------------------------------------------------- */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.accountCard}>
          <Text style={styles.accountText}>
            {signedIn && profile.email
              ? `Signed in as ${profile.email}`
              : signedIn
                ? 'Signed in on this device'
                : 'Your progress is saved on this device.'}
          </Text>
          <Text style={styles.accountHint}>
            {signedIn
              ? apiConfigured
                ? 'XP and saved questions sync across your devices.'
                : 'Signed in on this device. Add a server URL to sync across devices.'
              : googleConfigured()
                ? 'Sign in to put your name and picture on your profile.'
                : 'Set a display name below. Google sign-in needs a client ID — see GOOGLE_SIGNIN.md.'}
          </Text>

          {signedIn ? (
            <Pressable
              style={styles.googleBtn}
              onPress={async () => {
                await syncUp();
                await signOut();
                load();
              }}>
              <Text style={styles.googleBtnText}>Sign out</Text>
            </Pressable>
          ) : googleConfigured() ? (
            <Pressable style={styles.googleBtn} onPress={() => promptAsync()}>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </Pressable>
          ) : (
            // Sign-in cannot exist without a Google client ID, so offer the
            // thing it would have done: name yourself. Everything else already
            // works signed out.
            <Pressable
              style={styles.googleBtn}
              onPress={() => {
                setDraftName(profile.name === 'Anonymous Coder' ? '' : profile.name);
                setEditing(true);
              }}>
              <Text style={styles.googleBtnText}>Set a display name</Text>
            </Pressable>
          )}
        </View>

        {/* Leaderboard — only meaningful once a server is attached, so it is
            hidden rather than shown empty. */}
        {board.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Leaderboard</Text>
            <View style={styles.boardCard}>
              {board.map((entry) => (
                <View
                  key={`${entry.rank}-${entry.name}`}
                  style={[styles.boardRow, entry.isYou && styles.boardRowYou]}>
                  <Text style={[styles.boardRank, entry.isYou && styles.boardYouText]}>
                    {entry.rank}
                  </Text>
                  <Text
                    style={[styles.boardName, entry.isYou && styles.boardYouText]}
                    numberOfLines={1}>
                    {entry.name}
                    {entry.isYou ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.boardLevel}>Lv {entry.level}</Text>
                  <Text style={[styles.boardXp, entry.isYou && styles.boardYouText]}>
                    {entry.xp}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Pressable
          style={styles.dangerBtn}
          onPress={() =>
            Alert.alert('Reset progress?', 'This clears your XP, level, and mastery on this device.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: async () => {
                  await resetProfile();
                  load();
                },
              },
            ])
          }>
          <Text style={styles.dangerText}>Reset progress</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 20, paddingBottom: 48 },
  avatarCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0e1116',
  },
  avatarEmoji: { fontSize: 46 },
  name: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginTop: 14 },
  editHint: { color: COLORS.muted, fontSize: 14 },
  nameEditRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  nameInput: {
    flex: 1,
    color: COLORS.text,
    backgroundColor: '#0e1116',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
  },
  nameSave: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  nameSaveText: { color: '#0e1116', fontWeight: '800' },
  tierName: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  tierBlurb: { color: COLORS.muted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  xpTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginTop: 16,
    overflow: 'hidden',
  },
  xpFill: { height: 8, borderRadius: 4 },
  xpLabel: { color: COLORS.muted, fontSize: 12, marginTop: 8, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 26,
  },
  sectionNote: { color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  muted: { color: COLORS.muted, fontSize: 14, marginTop: 10 },
  masteryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  masteryCell: {
    width: '48%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  masteryCellDone: { borderColor: '#2fbf7166', backgroundColor: '#14402c33' },
  masteryBarTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  masteryBarFill: { height: 5, borderRadius: 3 },
  masteryName: { color: COLORS.text, fontSize: 12.5, fontWeight: '700', minHeight: 32 },
  masteryCount: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  practiceBtn: {
    marginTop: 14,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  practiceText: { color: '#0e1116', fontWeight: '800', fontSize: 15 },
  accountCard: {
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
  },
  accountText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  accountHint: { color: COLORS.muted, fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  googleBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  googleBtnText: { color: COLORS.accent, fontWeight: '800', fontSize: 14 },
  boardCard: {
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  boardRowYou: { backgroundColor: '#1d3a5f' },
  boardRank: { color: COLORS.muted, fontSize: 13, fontWeight: '800', width: 24 },
  boardName: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  boardLevel: { color: COLORS.muted, fontSize: 12 },
  boardXp: { color: COLORS.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  boardYouText: { color: '#cfe4ff' },
  dangerBtn: {
    marginTop: 22,
    borderWidth: 1,
    borderColor: '#ff5d5d55',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  dangerText: { color: COLORS.wrong, fontWeight: '700', fontSize: 14 },
});
