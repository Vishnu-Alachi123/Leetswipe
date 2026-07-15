/**
 * Runtime configuration for the LeetSwipe app.
 *
 * EXPO_PUBLIC_API_URL points at the LeetSwipe API (see ../../server). When unset,
 * the app runs fully offline against the bundled sample deck and stores saved
 * questions only on the device.
 *
 * EXPO_PUBLIC_QUESTIONS_URL is kept for backward compatibility: if only it is set
 * we derive the API base from it.
 */
function deriveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const legacy = process.env.EXPO_PUBLIC_QUESTIONS_URL;
  if (legacy) return legacy.replace(/\/questions\/?$/, '').replace(/\/$/, '');
  return '';
}

export const API_URL = deriveApiUrl();
