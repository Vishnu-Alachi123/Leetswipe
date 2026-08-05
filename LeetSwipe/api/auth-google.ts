/**
 * Google sign-in, and the cloud copy of your progress.
 *
 * Signing in is entirely optional. Everything in the app works signed out and
 * offline — the account exists so XP, level, and saved questions follow you to
 * a new device, not because the app needs a server to function. That ordering
 * matters: an app that demands an account before it does anything loses people
 * at the door.
 *
 * Configuration lives in environment variables, so this file ships inert until
 * real client IDs are supplied (see GOOGLE_SIGNIN.md):
 *
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
 *   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
 *
 * `isConfigured()` reports whether they are present; the profile screen uses it
 * to show a working button or an explanatory note rather than a button that
 * fails when tapped.
 */
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL } from './config';
import { getProfile, saveProfile, type Profile } from './profile';

// Required so the browser tab closes and returns control after the redirect.
WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'leetswipe.googleToken';

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

function clientId(): string | undefined {
  const web = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const ios = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const android = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  if (Platform.OS === 'ios') return ios || web;
  if (Platform.OS === 'android') return android || web;
  return web;
}

/** True when client IDs are configured, so the UI can offer sign-in honestly. */
export function isConfigured(): boolean {
  return Boolean(clientId());
}

export interface GoogleUser {
  googleId: string;
  email: string;
  name: string;
  photoUrl?: string;
}

/**
 * The request object for the sign-in flow.
 *
 * Exposed as a hook because expo-auth-session needs component lifecycle to
 * handle the redirect. The profile screen calls it and gets back a `promptAsync`
 * to run on button press.
 */
export function useGoogleAuthRequest() {
  const id = clientId();
  return AuthSession.useAuthRequest(
    {
      clientId: id ?? 'unconfigured',
      scopes: ['openid', 'profile', 'email'],
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'leetswipe' }),
      responseType: AuthSession.ResponseType.IdToken,
      // Google requires a nonce for the implicit id_token flow.
      extraParams: { nonce: String(Math.random()).slice(2) },
    },
    DISCOVERY,
  );
}

/**
 * Read the display fields out of a Google id_token, client-side.
 *
 * Used only when no server is configured, to fill in a name and picture for a
 * profile that lives on this device. It is emphatically **not** authentication:
 * an unverified token proves nothing, so this must never gate access to
 * anything or be trusted by a server. Sync and the leaderboard deliberately go
 * through `/auth/google`, which verifies the signature properly.
 */
function decodeIdToken(idToken: string): GoogleUser | null {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(padded)
              .split('')
              .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
              .join(''),
          )
        : Buffer.from(padded, 'base64').toString('utf8');
    const claims = JSON.parse(json) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (!claims.sub) return null;
    return {
      googleId: claims.sub,
      email: claims.email ?? '',
      name: claims.name ?? claims.email?.split('@')[0] ?? 'Coder',
      photoUrl: claims.picture,
    };
  } catch {
    return null;
  }
}

/** Store a Google identity on this device, with no server involved. */
async function signInLocally(idToken: string): Promise<GoogleUser | null> {
  const user = decodeIdToken(idToken);
  if (!user) return null;
  const profile = await getProfile();
  profile.googleId = user.googleId;
  profile.email = user.email;
  profile.photoUrl = user.photoUrl;
  if (profile.name === 'Anonymous Coder' && user.name) profile.name = user.name;
  await saveProfile(profile);
  // A marker so the UI can show "signed in" without a server session.
  await AsyncStorage.setItem(TOKEN_KEY, `local:${user.googleId}`);
  return user;
}

/**
 * Exchange a Google id_token for a LeetSwipe session.
 *
 * With a server configured the token is verified there (see server/src/auth.ts)
 * — never trust an id_token that has only been parsed on the client, because
 * anything the client decodes, a client can forge.
 *
 * With no server, falls back to a device-local profile so sign-in still does
 * something useful: your name and picture appear, and progress stays on the
 * device. Cross-device sync and the leaderboard need the server.
 */
export async function signInWithIdToken(idToken: string): Promise<GoogleUser | null> {
  if (!API_URL) return signInLocally(idToken);
  try {
    const res = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token: string; user: GoogleUser };
    await AsyncStorage.setItem(TOKEN_KEY, data.token);

    const profile = await getProfile();
    profile.googleId = data.user.googleId;
    profile.email = data.user.email;
    profile.photoUrl = data.user.photoUrl;
    // Keep a name the user already chose; only adopt Google's on first sign-in.
    if (profile.name === 'Anonymous Coder' && data.user.name) profile.name = data.user.name;
    await saveProfile(profile);

    await syncUp();
    return data.user;
  } catch {
    return null;
  }
}

export async function sessionToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  const profile = await getProfile();
  delete profile.googleId;
  delete profile.email;
  delete profile.photoUrl;
  // Progress stays on the device — signing out is not "delete my work".
  await saveProfile(profile);
}

/** Push this device's profile to the cloud. Silent no-op when signed out. */
export async function syncUp(): Promise<boolean> {
  const token = await sessionToken();
  if (!token || !API_URL) return false;
  try {
    const profile = await getProfile();
    const res = await fetch(`${API_URL}/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(profile),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pull the cloud profile and merge it with this device's.
 *
 * Merge rather than overwrite, taking the higher XP and per-stat maximum: a
 * device that was offline for a week has real progress on it, and a
 * last-write-wins sync would silently delete it.
 */
export async function syncDown(): Promise<Profile | null> {
  const token = await sessionToken();
  if (!token || !API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/sync`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const remote = (await res.json()) as { profile?: Partial<Profile> };
    if (!remote.profile) return null;

    const local = await getProfile();
    const merged: Profile = {
      ...local,
      ...remote.profile,
      name: local.name !== 'Anonymous Coder' ? local.name : remote.profile.name ?? local.name,
      xp: Math.max(local.xp, remote.profile.xp ?? 0),
      stats: {
        mcqCorrect: Math.max(local.stats.mcqCorrect, remote.profile.stats?.mcqCorrect ?? 0),
        patternCorrect: Math.max(local.stats.patternCorrect, remote.profile.stats?.patternCorrect ?? 0),
        counterexampleCorrect: Math.max(
          local.stats.counterexampleCorrect,
          remote.profile.stats?.counterexampleCorrect ?? 0,
        ),
        reelsCompleted: Math.max(local.stats.reelsCompleted, remote.profile.stats?.reelsCompleted ?? 0),
        challengesSolved: Math.max(local.stats.challengesSolved, remote.profile.stats?.challengesSolved ?? 0),
      },
    };
    await saveProfile(merged);
    return merged;
  } catch {
    return null;
  }
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  level: number;
  photoUrl?: string;
  /** True for the signed-in user's own row. */
  isYou?: boolean;
}

/** Top players by XP. Returns an empty list when signed out or offline. */
export async function fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  if (!API_URL) return [];
  try {
    const token = await sessionToken();
    const res = await fetch(`${API_URL}/leaderboard?limit=${limit}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: LeaderboardEntry[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}
