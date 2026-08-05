/**
 * Minimal anonymous-first auth for LeetSwipe.
 *
 * The app calls POST /auth/anon once per device to get a JWT carrying a stable
 * random userId, then sends it as `Authorization: Bearer <token>` on saved-list
 * requests. No passwords this round — an email/password upgrade can layer on
 * later without changing the token shape. App-Store friendly: zero signup
 * friction while still isolating each user's saved questions.
 */
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const TOKEN_TTL = '365d';

export interface AuthedRequest extends Request {
  userId?: string;
}

/** Issue a token for a fresh anonymous user. */
export function issueAnonToken(): { token: string; userId: string } {
  const userId = `anon_${randomUUID()}`;
  const token = jwt.sign({ userId }, SECRET, { expiresIn: TOKEN_TTL });
  return { token, userId };
}

export interface GoogleUser {
  googleId: string;
  email: string;
  name: string;
  photoUrl?: string;
}

/**
 * Verify a Google id_token and issue our own session token.
 *
 * The verification must happen here, not on the client. An id_token decoded in
 * the app proves nothing — anything a client can decode, a client can forge, so
 * trusting a client-parsed token would let anyone claim any account. The
 * library checks Google's signature, the audience, and the expiry.
 *
 * Accepts any of the configured client IDs as audience, because iOS, Android,
 * and web each get their own from Google.
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUser | null> {
  const audiences = [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean) as string[];

  if (audiences.length === 0) {
    console.warn('Google sign-in attempted but no GOOGLE_*_CLIENT_ID is configured.');
    return null;
  }

  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return null;
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0],
      photoUrl: payload.picture,
    };
  } catch (err) {
    console.error('Google token verification failed:', err);
    return null;
  }
}

/** Session token for a verified Google user. */
export function issueGoogleToken(user: GoogleUser): string {
  return jwt.sign({ userId: `google_${user.googleId}` }, SECRET, { expiresIn: TOKEN_TTL });
}

/** Express middleware: require a valid bearer token, attach req.userId. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }
  try {
    const payload = jwt.verify(token, SECRET) as { userId?: string };
    if (!payload.userId) {
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
