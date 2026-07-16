/**
 * LeetSwipe API.
 *
 * Endpoints:
 *   GET  /health                          liveness
 *   GET  /topics                          categories + counts + difficulty breakdown
 *   GET  /questions?category=&difficulty=&list=&limit=&exclude=
 *                                         randomized filtered deck
 *   POST /auth/anon                       issue an anonymous JWT
 *   GET  /saved                           list the caller's saved questions
 *   POST /saved                           save a question (body: MCQ)
 *   DELETE /saved/:questionId             unsave
 *
 * The client never touches MongoDB directly — it goes through this API.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { questionsCollection, savedCollection, MCQ, SavedDoc } from './db';
import { issueAnonToken, requireAuth, AuthedRequest } from './auth';

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

/** Anonymous sign-in — one call per device. */
app.post('/auth/anon', (_req, res) => {
  res.json(issueAnonToken());
});

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
