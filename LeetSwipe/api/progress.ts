/**
 * Local learning-progress helpers: which questions the user has already seen
 * (so decks don't repeat), and a simple daily streak counter for motivation.
 * All device-local via AsyncStorage — no account required.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY = 'leetswipe.seen';
const STREAK_KEY = 'leetswipe.streak';

// ----------------------------------------------------------------- seen
export async function getSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Record questionIds as seen (bounded to the most recent 2000 to stay small). */
export async function markSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const current = await getSeen();
  const merged = Array.from(new Set([...current, ...ids]));
  const trimmed = merged.slice(-2000);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
}

export async function clearSeen(): Promise<void> {
  await AsyncStorage.removeItem(SEEN_KEY);
}

// ----------------------------------------------------------------- streak
export interface Streak {
  count: number;
  lastDay: string; // YYYY-MM-DD
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Read the current streak without modifying it. */
export async function getStreak(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (!raw) return 0;
    const s = JSON.parse(raw) as Streak;
    // A streak older than yesterday has lapsed.
    return dayDiff(s.lastDay, today()) <= 1 ? s.count : 0;
  } catch {
    return 0;
  }
}

/** Call when the user completes activity today; advances or resets the streak. */
export async function recordActivity(): Promise<number> {
  const t = today();
  let streak: Streak = { count: 0, lastDay: t };
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (raw) streak = JSON.parse(raw) as Streak;
  } catch {
    // start fresh
  }
  if (streak.lastDay === t) return streak.count; // already counted today
  const gap = dayDiff(streak.lastDay, t);
  const count = gap === 1 ? streak.count + 1 : 1; // consecutive day vs reset
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ count, lastDay: t }));
  return count;
}
