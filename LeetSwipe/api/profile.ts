/**
 * The learner's identity, XP, and level.
 *
 * Local-first: everything works signed out and offline, stored on the device.
 * Signing in (see ./auth-google.ts) attaches a cloud copy so progress follows
 * you between devices — but nothing here requires it.
 *
 * XP is awarded for *demonstrating understanding*, never for volume. Swiping
 * past a hundred cards earns nothing; answering one correctly earns. That
 * distinction is the whole reason to have XP at all — reward the behaviour you
 * want repeated, which is thinking, not scrolling.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'leetswipe.profile';

/** What each action is worth. Harder thinking pays more. */
export const XP = {
  /** A multiple-choice question answered correctly. */
  mcqCorrect: 10,
  /** Naming the technique a problem calls for — the core skill. */
  patternCorrect: 15,
  /** Finding the input that breaks a subtly wrong solution. */
  counterexampleCorrect: 25,
  /** Watching an algorithm walkthrough to the end. */
  reelCompleted: 20,
  /** Passing every test on a code challenge. */
  challengeSolved: 50,
  /** First activity of the day, on top of whatever earned it. */
  dailyBonus: 15,
} as const;

/**
 * Avatar evolution: a single bit growing into a whole system.
 *
 * Modelled on Khan Academy's avatars, but themed on what the app teaches —
 * each tier is a real structure, in roughly the order a programmer meets them,
 * so the ladder itself is a small piece of the curriculum.
 */
export interface AvatarTier {
  level: number;
  name: string;
  emoji: string;
  color: string;
  blurb: string;
}

export const AVATAR_TIERS: AvatarTier[] = [
  { level: 1, name: 'Bit', emoji: '🔹', color: '#4f9dff', blurb: 'One value. Everything starts here.' },
  { level: 2, name: 'Byte', emoji: '🧩', color: '#4f9dff', blurb: 'Eight bits, and suddenly you can spell.' },
  { level: 3, name: 'Variable', emoji: '📦', color: '#4ecdc4', blurb: 'A name you can point at.' },
  { level: 4, name: 'Array', emoji: '🗃️', color: '#4ecdc4', blurb: 'Order, and an index to find it by.' },
  { level: 5, name: 'Linked List', emoji: '🔗', color: '#2fbf71', blurb: 'Each one knows the next.' },
  { level: 6, name: 'Stack', emoji: '📚', color: '#2fbf71', blurb: 'Last in, first out. Recursion lives here.' },
  { level: 7, name: 'Queue', emoji: '🎟️', color: '#8fd14f', blurb: 'First in, first out. Breadth-first lives here.' },
  { level: 8, name: 'Hash Map', emoji: '🗝️', color: '#ffd93d', blurb: 'Constant time, if you pick a good key.' },
  { level: 9, name: 'Tree', emoji: '🌳', color: '#ffb454', blurb: 'Branching, and logarithms as a reward.' },
  { level: 10, name: 'Heap', emoji: '⛰️', color: '#ffb454', blurb: 'Always know the smallest thing.' },
  { level: 11, name: 'Trie', emoji: '🌲', color: '#ff8fa3', blurb: 'A tree that spells.' },
  { level: 12, name: 'Graph', emoji: '🕸️', color: '#ff8fa3', blurb: 'Everything is connected to something.' },
  { level: 13, name: 'Optimiser', emoji: '⚡', color: '#b78bff', blurb: 'You see the faster path first.' },
  { level: 14, name: 'Compiler', emoji: '🛠️', color: '#b78bff', blurb: 'You read code the way it runs.' },
  { level: 15, name: 'Architect', emoji: '🏛️', color: '#ff6b6b', blurb: 'You design the thing others implement.' },
];

/**
 * XP needed to *reach* each level.
 *
 * Quadratic-ish: early levels arrive fast enough to show the system works,
 * later ones slow down enough that reaching Architect means something.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(60 * Math.pow(level - 1, 1.6));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < AVATAR_TIERS.length && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

export function tierForLevel(level: number): AvatarTier {
  return AVATAR_TIERS[Math.min(level, AVATAR_TIERS.length) - 1];
}

/** Progress through the current level, 0-1, for the XP bar. */
export function levelProgress(xp: number): { current: number; needed: number; fraction: number } {
  const level = levelForXp(xp);
  if (level >= AVATAR_TIERS.length) return { current: 0, needed: 0, fraction: 1 };
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const current = xp - floor;
  const needed = ceiling - floor;
  return { current, needed, fraction: Math.max(0, Math.min(1, current / needed)) };
}

export interface Profile {
  /** Display name. Defaults to a friendly anonymous handle. */
  name: string;
  xp: number;
  /** ISO date of the last day XP was earned, for the daily bonus. */
  lastActiveDay: string;
  /** Lifetime counters, shown on the profile screen. */
  stats: {
    mcqCorrect: number;
    patternCorrect: number;
    counterexampleCorrect: number;
    reelsCompleted: number;
    challengesSolved: number;
  };
  /** Set once signed in, so the cloud copy can be matched to this device. */
  googleId?: string;
  email?: string;
  photoUrl?: string;
}

const EMPTY: Profile = {
  name: 'Anonymous Coder',
  xp: 0,
  lastActiveDay: '',
  stats: {
    mcqCorrect: 0,
    patternCorrect: 0,
    counterexampleCorrect: 0,
    reelsCompleted: 0,
    challengesSolved: 0,
  },
};

export async function getProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY, stats: { ...EMPTY.stats } };
    const parsed = JSON.parse(raw) as Partial<Profile>;
    // Merge over the defaults so a profile written by an older build — before
    // a stat existed — still loads instead of rendering undefined counters.
    return {
      ...EMPTY,
      ...parsed,
      stats: { ...EMPTY.stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return { ...EMPTY, stats: { ...EMPTY.stats } };
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A failed write costs this session's XP, which is not worth crashing over.
  }
}

export type XpReason = keyof typeof XP;

export interface XpAward {
  gained: number;
  /** True when this award crossed a level boundary, so the UI can celebrate. */
  leveledUp: boolean;
  newLevel: number;
  profile: Profile;
}

const STAT_FOR: Partial<Record<XpReason, keyof Profile['stats']>> = {
  mcqCorrect: 'mcqCorrect',
  patternCorrect: 'patternCorrect',
  counterexampleCorrect: 'counterexampleCorrect',
  reelCompleted: 'reelsCompleted',
  challengeSolved: 'challengesSolved',
};

/**
 * Award XP for something the learner got right.
 *
 * Adds the daily bonus automatically on the first award of a new day, so the
 * caller never has to think about it.
 */
export async function awardXp(reason: XpReason): Promise<XpAward> {
  const profile = await getProfile();
  const before = levelForXp(profile.xp);

  let gained = XP[reason];
  const today = new Date().toISOString().slice(0, 10);
  if (profile.lastActiveDay !== today) {
    gained += XP.dailyBonus;
    profile.lastActiveDay = today;
  }

  profile.xp += gained;
  const stat = STAT_FOR[reason];
  if (stat) profile.stats[stat] += 1;

  await saveProfile(profile);
  const after = levelForXp(profile.xp);
  return { gained, leveledUp: after > before, newLevel: after, profile };
}

export async function setName(name: string): Promise<Profile> {
  const profile = await getProfile();
  profile.name = name.trim().slice(0, 24) || EMPTY.name;
  await saveProfile(profile);
  return profile;
}

/** Wipe local progress. Used by the profile screen's reset. */
export async function resetProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
}
