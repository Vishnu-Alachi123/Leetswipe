/**
 * LeetSwipe API.
 *
 * Endpoints:
 *   GET  /health                          liveness
 *   GET  /topics                          categories + counts + difficulty breakdown
 *   GET  /questions?category=&difficulty=&list=&limit=&exclude=
 *                                         randomized filtered deck
 *   GET  /reels?category=&difficulty=      algorithm walkthroughs (Learn tab)
 *   POST /auth/anon                       issue an anonymous JWT
 *   POST /auth/google                     sign in with a Google id_token
 *   GET/PUT /sync                         the caller's cloud profile (XP, stats)
 *   GET  /leaderboard?limit=              top learners by XP
 *   GET  /saved                           list the caller's saved questions
 *   POST /saved                           save a question (body: MCQ)
 *   DELETE /saved/:questionId             unsave
 *
 * The client never touches MongoDB directly — it goes through this API.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import {
  questionsCollection,
  reelsCollection,
  savedCollection,
  profilesCollection,
  MCQ,
  SavedDoc,
  ProfileDoc,
} from './db';
import {
  issueAnonToken,
  issueGoogleToken,
  requireAuth,
  verifyGoogleToken,
  AuthedRequest,
} from './auth';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const PROJECTION = { _id: 0 } as const;

app.get('/health', (_req, res) => res.json({ ok: true }));

/** Distinct categories with total + per-difficulty counts, plus curated lists. */
app.get('/topics', async (_req, res) => {
  try {
    const coll = await questionsCollection();
    const byCategory = await coll
      .aggregate([
        {
          $group: {
            _id: '$category',
            total: { $sum: 1 },
            easy: { $sum: { $cond: [{ $eq: ['$difficulty', 'Easy'] }, 1, 0] } },
            medium: { $sum: { $cond: [{ $eq: ['$difficulty', 'Medium'] }, 1, 0] } },
            hard: { $sum: { $cond: [{ $eq: ['$difficulty', 'Hard'] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ])
      .toArray();

    const lists = await coll.distinct('lists');
    const total = byCategory.reduce((n, c) => n + c.total, 0);
    res.json({
      total,
      lists: lists.filter(Boolean),
      categories: byCategory.map((c) => ({
        category: c._id ?? 'Uncategorized',
        total: c.total,
        easy: c.easy,
        medium: c.medium,
        hard: c.hard,
      })),
    });
  } catch (err) {
    console.error('GET /topics failed:', err);
    res.status(500).json({ error: 'Failed to load topics.' });
  }
});

/** Filtered, randomized deck. */
app.get('/questions', async (req, res) => {
  try {
    const { category, difficulty, list } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '30'), 10) || 30, 1), 100);
    const exclude = String(req.query.exclude ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const match: Record<string, unknown> = {};
    if (category) match.category = category;
    if (difficulty) match.difficulty = difficulty;
    if (list) match.lists = list;
    if (exclude.length) match.questionId = { $nin: exclude };

    const coll = await questionsCollection();
    const questions = await coll
      .aggregate<MCQ>([{ $match: match }, { $sample: { size: limit } }, { $project: PROJECTION }])
      .toArray();

    res.json({ questions });
  } catch (err) {
    console.error('GET /questions failed:', err);
    res.status(500).json({ error: 'Failed to load questions.' });
  }
});

/** Algorithm reels for the Learn tab, optionally filtered by category. */
app.get('/reels', async (req, res) => {
  try {
    const { category, difficulty } = req.query as Record<string, string | undefined>;
    const match: Record<string, unknown> = {};
    if (category) match.category = category;
    if (difficulty) match.difficulty = difficulty;

    const coll = await reelsCollection();
    const reels = await coll.find(match, { projection: PROJECTION }).toArray();
    res.json({ reels });
  } catch (err) {
    console.error('GET /reels failed:', err);
    res.status(500).json({ error: 'Failed to load reels.' });
  }
});

/** Anonymous sign-in — one call per device. */
app.post('/auth/anon', (_req, res) => {
  res.json(issueAnonToken());
});

/** Sign in with a Google id_token, verified server-side. */
app.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) {
      res.status(400).json({ error: 'idToken is required.' });
      return;
    }
    const user = await verifyGoogleToken(idToken);
    if (!user) {
      res.status(401).json({ error: 'Could not verify that Google token.' });
      return;
    }
    res.json({ token: issueGoogleToken(user), user });
  } catch (err) {
    console.error('POST /auth/google failed:', err);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

/** The caller's cloud profile. */
app.get('/sync', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const coll = await profilesCollection();
    const profile = await coll.findOne({ userId: req.userId! }, { projection: { _id: 0, userId: 0 } });
    res.json({ profile });
  } catch (err) {
    console.error('GET /sync failed:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

/**
 * Push a device's profile up.
 *
 * XP only ever moves forward: a device that was offline holds real progress,
 * and taking the maximum stops a stale client from erasing a newer one. It also
 * makes the endpoint safe to retry.
 */
app.put('/sync', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const incoming = req.body as Partial<ProfileDoc>;
    const coll = await profilesCollection();
    const existing = await coll.findOne({ userId: req.userId! });

    const merged: ProfileDoc = {
      userId: req.userId!,
      name: String(incoming.name ?? existing?.name ?? 'Anonymous Coder').slice(0, 24),
      xp: Math.max(Number(incoming.xp ?? 0), existing?.xp ?? 0),
      lastActiveDay: String(incoming.lastActiveDay ?? existing?.lastActiveDay ?? ''),
      stats: { ...(existing?.stats ?? {}), ...(incoming.stats ?? {}) },
      email: incoming.email ?? existing?.email,
      photoUrl: incoming.photoUrl ?? existing?.photoUrl,
      updatedAt: new Date().toISOString(),
    };

    await coll.replaceOne({ userId: merged.userId }, merged, { upsert: true });
    res.json({ ok: true, profile: merged });
  } catch (err) {
    console.error('PUT /sync failed:', err);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
});

/**
 * Top learners by XP.
 *
 * Public, but only names and totals are exposed — never emails. The caller's
 * own row is marked so the client can highlight it without a second request.
 */
app.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);

    // Optional auth: signed-out callers still get the board, just unmarked.
    let callerId: string | undefined;
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Bearer ')) {
      try {
        callerId = (jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-insecure-secret-change-me') as { userId?: string }).userId;
      } catch {
        // An expired token just means an unmarked board.
      }
    }

    const coll = await profilesCollection();
    const rows = await coll
      .find({ xp: { $gt: 0 } }, { projection: { _id: 0, userId: 1, name: 1, xp: 1, photoUrl: 1 } })
      .sort({ xp: -1 })
      .limit(limit)
      .toArray();

    res.json({
      entries: rows.map((row, i) => ({
        rank: i + 1,
        name: row.name,
        xp: row.xp,
        level: levelForXp(row.xp),
        photoUrl: row.photoUrl,
        isYou: callerId != null && row.userId === callerId,
      })),
    });
  } catch (err) {
    console.error('GET /leaderboard failed:', err);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

/**
 * Level from XP.
 *
 * Duplicated from the app's api/profile.ts rather than shared, because the
 * server and the app are separate packages with no build-time link. The curve
 * must match; a test asserts a few known points.
 */
function levelForXp(xp: number): number {
  const TIERS = 15;
  const xpForLevel = (l: number) => (l <= 1 ? 0 : Math.round(60 * Math.pow(l - 1, 1.6)));
  let level = 1;
  while (level < TIERS && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

/** The caller's saved questions. */
app.get('/saved', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const coll = await savedCollection();
    const saved = await coll
      .find({ userId: req.userId! }, { projection: { _id: 0, userId: 0 } })
      .sort({ savedAt: -1 })
      .toArray();
    res.json({ saved });
  } catch (err) {
    console.error('GET /saved failed:', err);
    res.status(500).json({ error: 'Failed to load saved questions.' });
  }
});

/** Save a question for the caller. Idempotent on (userId, questionId). */
app.post('/saved', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const q = req.body as Partial<MCQ>;
    if (!q || typeof q.questionId !== 'string' || !Array.isArray(q.options)) {
      res.status(400).json({ error: 'Invalid question payload.' });
      return;
    }
    const doc: SavedDoc = {
      userId: req.userId!,
      savedAt: new Date().toISOString(),
      leetQuestionId: q.leetQuestionId ?? 0,
      questionId: q.questionId,
      title: q.title ?? '',
      topics: q.topics ?? [],
      category: q.category ?? 'Algorithms',
      lists: q.lists ?? [],
      difficulty: q.difficulty ?? 'Medium',
      question: q.question ?? '',
      options: q.options,
      answer: q.answer ?? 0,
      explanation: q.explanation ?? '',
    };
    const coll = await savedCollection();
    await coll.replaceOne(
      { userId: doc.userId, questionId: doc.questionId },
      doc,
      { upsert: true },
    );
    res.json({ ok: true, savedAt: doc.savedAt });
  } catch (err) {
    console.error('POST /saved failed:', err);
    res.status(500).json({ error: 'Failed to save question.' });
  }
});

/** Unsave. */
app.delete('/saved/:questionId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const coll = await savedCollection();
    await coll.deleteOne({ userId: req.userId!, questionId: req.params.questionId });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /saved failed:', err);
    res.status(500).json({ error: 'Failed to unsave question.' });
  }
});

const PORT = parseInt(process.env.PORT || '4000', 10);
app.listen(PORT, () => {
  console.log(`LeetSwipe API listening on :${PORT}`);
});

export default app;
