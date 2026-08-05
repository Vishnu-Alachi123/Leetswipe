/**
 * MongoDB connection + collection helpers for the LeetSwipe API.
 *
 * Uses the same Atlas cluster and `GeneratedQuestionsCollection` that the Python
 * generator writes to (see backend_question_generation/quickstart.py). A new
 * `SavedQuestions` collection stores per-user saved questions.
 */
import { MongoClient, Db, Collection } from 'mongodb';

const uri = process.env.MONGODB_KEY;

let client: MongoClient | null = null;
let db: Db | null = null;

export interface MCQ {
  leetQuestionId: number;
  questionId: string;
  title: string;
  topics: string[];
  category: string;
  lists: string[];
  source?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface SavedDoc extends MCQ {
  userId: string;
  savedAt: string; // ISO timestamp
}

/** Returns the connected Db, connecting lazily on first use. Throws if MONGODB_KEY is unset. */
export async function getDb(): Promise<Db> {
  if (db) return db;
  if (!uri) throw new Error('MONGODB_KEY environment variable is not set.');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('LeetQuestionsDB');
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(database: Db): Promise<void> {
  const q = database.collection('GeneratedQuestionsCollection');
  await Promise.all([
    q.createIndex({ category: 1 }),
    q.createIndex({ difficulty: 1 }),
    q.createIndex({ lists: 1 }),
  ]);
  const s = database.collection('SavedQuestions');
  // One saved row per (user, question); lookups are always by userId.
  await s.createIndex({ userId: 1, questionId: 1 }, { unique: true });
  await s.createIndex({ userId: 1, savedAt: -1 });

  const p = database.collection('Profiles');
  await p.createIndex({ userId: 1 }, { unique: true });
  // The leaderboard is a descending-XP scan; without this it sorts in memory.
  await p.createIndex({ xp: -1 });
}

export async function questionsCollection(): Promise<Collection<MCQ>> {
  return (await getDb()).collection<MCQ>('GeneratedQuestionsCollection');
}

/**
 * Algorithm reels for the Learn tab. Shaped by schema.AlgorithmReel; the client
 * treats this as an upgrade over its bundled set, never a requirement.
 */
export interface Reel {
  reelId: string;
  algorithmName: string;
  description: string;
  language: string;
  fullCode: string;
  steps: unknown[];
  difficulty: string;
  category?: string;
}

export async function reelsCollection(): Promise<Collection<Reel>> {
  return (await getDb()).collection<Reel>('GeneratedReelsCollection');
}

/** A signed-in learner's cloud profile: the copy that follows them between devices. */
export interface ProfileDoc {
  userId: string;
  name: string;
  xp: number;
  lastActiveDay: string;
  stats: Record<string, number>;
  email?: string;
  photoUrl?: string;
  updatedAt: string;
}

export async function profilesCollection(): Promise<Collection<ProfileDoc>> {
  return (await getDb()).collection<ProfileDoc>('Profiles');
}

export async function savedCollection(): Promise<Collection<SavedDoc>> {
  return (await getDb()).collection<SavedDoc>('SavedQuestions');
}
