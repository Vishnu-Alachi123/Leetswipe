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
