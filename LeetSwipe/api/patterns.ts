/**
 * Pattern Match — read a problem, name the technique.
 *
 * Data comes from ../../backend_question_generation/generate_patterns.py, whose
 * answer key is the curated NeetCode category map rather than model output, so
 * the labels here are trustworthy in a way generated ones are not.
 *
 * Mastery is tracked per technique: this is the one place in the app where
 * "how good am I at X" has a defensible answer, because the questions are
 * uniform and the labels are verified.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import bundled from '../assets/data/patterns.json';
import type { Difficulty } from './get-questions';

const MASTERY_KEY = 'leetswipe.mastery';

/** Correct answers needed before a technique counts as mastered. */
export const MASTERY_TARGET = 8;

export interface PatternQuestion {
  questionId: string;
  sourceSlug: string;
  title: string;
  /** The disguised problem statement — never names the technique. */
  statement: string;
  options: string[];
  answer: number;
  category: string;
  difficulty: Difficulty;
  /** Shown after answering: the technique and the clue that pointed to it. */
  insight: string;
  source?: string;
}

interface PatternSet {
  questions: PatternQuestion[];
}

function isValid(q: any): q is PatternQuestion {
  return (
    q &&
    typeof q.statement === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    typeof q.answer === 'number' &&
    q.answer >= 0 &&
    q.answer <= 3 &&
    typeof q.category === 'string'
  );
}

export const patternQuestions: PatternQuestion[] = (
  (bundled as PatternSet).questions ?? []
).filter(isValid);

/** Every technique that appears in the set, for the mastery map. */
export function allPatterns(): string[] {
  return [...new Set(patternQuestions.map((q) => q.category))].sort();
}

export interface MasteryRecord {
  /** Correct answers for this technique. */
  correct: number;
  /** Total attempts, so accuracy can be shown. */
  attempts: number;
}

export type Mastery = Record<string, MasteryRecord>;

export async function getMastery(): Promise<Mastery> {
  try {
    const raw = await AsyncStorage.getItem(MASTERY_KEY);
    return raw ? (JSON.parse(raw) as Mastery) : {};
  } catch {
    return {};
  }
}

export async function recordAttempt(pattern: string, correct: boolean): Promise<Mastery> {
  const mastery = await getMastery();
  const record = mastery[pattern] ?? { correct: 0, attempts: 0 };
  record.attempts += 1;
  if (correct) record.correct += 1;
  mastery[pattern] = record;
  try {
    await AsyncStorage.setItem(MASTERY_KEY, JSON.stringify(mastery));
  } catch {
    // Losing one attempt's record is not worth interrupting the session.
  }
  return mastery;
}

export function masteryFraction(record?: MasteryRecord): number {
  if (!record) return 0;
  return Math.min(1, record.correct / MASTERY_TARGET);
}

/**
 * A round of questions, weakest techniques first.
 *
 * Serving what you are worst at is the whole point — a random shuffle would
 * spend most of its questions on techniques you already have.
 */
export function buildRound(mastery: Mastery, size = 10): PatternQuestion[] {
  const weight = (q: PatternQuestion) => {
    const record = mastery[q.category];
    // Unseen techniques first, then least-mastered.
    if (!record) return 0;
    return masteryFraction(record) + Math.random() * 0.15;
  };
  return [...patternQuestions].sort((a, b) => weight(a) - weight(b)).slice(0, size);
}

/** Shuffled round for a timed run, where variety matters more than targeting. */
export function buildSpeedRound(size = 12): PatternQuestion[] {
  const pool = [...patternQuestions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}
