/**
 * Question data layer for the LeetSwipe app.
 *
 * The swipe UI consumes MCQs shaped like the backend generator's `schema.MCQ`
 * (see ../../backend_question_generation/schema.py). Questions are served by the
 * LeetSwipe API (see ../../server), which the app reaches via EXPO_PUBLIC_API_URL.
 * When no API is configured (or it is unreachable) we fall back to a bundled
 * sample deck so the app always runs with zero setup.
 *
 * MongoDB is never queried directly from the client — it lives behind the API.
 */

// Bundled fallback deck. Metro bundles JSON imports directly.
import sample from '../assets/data/questions.json';
import { API_URL } from './config';
import type { Visualization } from './reels';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Question {
  leetQuestionId: number;
  questionId: string;
  title: string;
  topics: string[];
  category: string;
  lists: string[];
  source?: string;
  difficulty: Difficulty;
  question: string;
  /** Exactly four choices. */
  options: string[];
  /** Index (0-3) of the correct option. */
  answer: number;
  explanation: string;
  /**
   * Optional diagram shown above the options — the same shape the Learn tab's
   * renderer draws, so one component library serves every question format.
   */
  visual?: Visualization | null;
}

export interface TopicSummary {
  category: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

export interface TopicsResponse {
  total: number;
  lists: string[];
  categories: TopicSummary[];
}

export interface QuestionFilter {
  category?: string;
  difficulty?: Difficulty;
  list?: string;
  limit?: number;
  /** questionIds to exclude (already seen). */
  exclude?: string[];
}

interface QuestionSet {
  questions: Question[];
}

/** Basic shape guard so a malformed payload can't crash the deck. */
function isValidQuestion(q: any): q is Question {
  return (
    q &&
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    typeof q.answer === 'number' &&
    q.answer >= 0 &&
    q.answer <= 3
  );
}

/** Fill in tag fields that older bundled data may lack. */
function withDefaults(q: any): Question {
  return {
    ...q,
    category: q.category ?? q.topics?.[0] ?? 'Algorithms',
    lists: q.lists ?? [],
  };
}

function normalize(set: Partial<QuestionSet> | undefined): Question[] {
  const list = set?.questions ?? [];
  return list.filter(isValidQuestion).map(withDefaults);
}

/** The bundled deck, exposed synchronously for previews and offline fallback. */
export const sampleQuestions: Question[] = normalize(sample as QuestionSet);

/** Client-side filtering of the bundled deck, mirroring the API's query params. */
function filterSample(filter: QuestionFilter = {}): Question[] {
  const excl = new Set(filter.exclude ?? []);
  let out = sampleQuestions.filter((q) => !excl.has(q.questionId));
  if (filter.category) out = out.filter((q) => q.category === filter.category);
  if (filter.difficulty) out = out.filter((q) => q.difficulty === filter.difficulty);
  if (filter.list) out = out.filter((q) => q.lists.includes(filter.list!));
  return out;
}

function buildQuery(filter: QuestionFilter): string {
  const p = new URLSearchParams();
  if (filter.category) p.set('category', filter.category);
  if (filter.difficulty) p.set('difficulty', filter.difficulty);
  if (filter.list) p.set('list', filter.list);
  if (filter.limit) p.set('limit', String(filter.limit));
  if (filter.exclude?.length) p.set('exclude', filter.exclude.join(','));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Fetch a filtered deck. Tries the API when configured, and always falls back to
 * the (locally filtered) bundled sample deck so the UI is never empty.
 */
export async function fetchQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/questions${buildQuery(filter)}`);
      if (res.ok) {
        const data = (await res.json()) as QuestionSet;
        const questions = normalize(data);
        if (questions.length > 0) return questions;
      }
    } catch (err) {
      console.warn('LeetSwipe: remote questions unavailable, using bundled deck.', err);
    }
  }
  return filterSample(filter);
}

/** Topic/category summary for the picker. Falls back to summarizing the bundled deck. */
export async function fetchTopics(): Promise<TopicsResponse> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/topics`);
      if (res.ok) {
        const data = (await res.json()) as TopicsResponse;
        if (data?.categories?.length) return data;
      }
    } catch (err) {
      console.warn('LeetSwipe: remote topics unavailable, using bundled deck.', err);
    }
  }
  return summarizeSample();
}

function summarizeSample(): TopicsResponse {
  const map = new Map<string, TopicSummary>();
  const lists = new Set<string>();
  for (const q of sampleQuestions) {
    q.lists.forEach((l) => lists.add(l));
    const s = map.get(q.category) ?? { category: q.category, total: 0, easy: 0, medium: 0, hard: 0 };
    s.total += 1;
    if (q.difficulty === 'Easy') s.easy += 1;
    else if (q.difficulty === 'Medium') s.medium += 1;
    else if (q.difficulty === 'Hard') s.hard += 1;
    map.set(q.category, s);
  }
  return {
    total: sampleQuestions.length,
    lists: [...lists],
    categories: [...map.values()].sort((a, b) => b.total - a.total),
  };
}
