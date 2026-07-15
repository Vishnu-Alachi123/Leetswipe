/**
 * Anonymous auth bootstrap.
 *
 * Fetches (once) a JWT for this device from the API's /auth/anon endpoint and
 * caches it in AsyncStorage so saved-question requests are authenticated. When
 * no API is configured the token is simply absent and the app runs in local-only
 * mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

const TOKEN_KEY = 'leetswipe.authToken';

let cached: string | null | undefined;
let inFlight: Promise<string | null> | null = null;

/** Return a bearer token, minting and persisting one on first use. Null if no API. */
export async function getToken(): Promise<string | null> {
  if (!API_URL) return null;
  if (cached !== undefined) return cached;

  const stored = await AsyncStorage.getItem(TOKEN_KEY);
  if (stored) {
    cached = stored;
    return stored;
  }

  // De-dupe concurrent callers so we only mint one anonymous account.
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/anon`, { method: 'POST' });
        if (!res.ok) return null;
        const { token } = (await res.json()) as { token: string };
        await AsyncStorage.setItem(TOKEN_KEY, token);
        cached = token;
        return token;
      } catch {
        return null;
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
}

/** Authorization header for API calls, or empty when unauthenticated. */
export async function authHeader(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
