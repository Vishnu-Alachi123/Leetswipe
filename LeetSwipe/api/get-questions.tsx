/**
 * Question data layer for the LeetSwipe app.
 *
 * The swipe UI consumes MCQs shaped exactly like the backend generator's
 * `schema.MCQ` (see ../../backend_question_generation/schema.py). By default we
 * load a bundled sample deck so the app runs with no network or keys. To serve
 * live, generated questions, set EXPO_PUBLIC_QUESTIONS_URL to an endpoint that
 * returns `{ "questions": MCQ[] }` (for example a small API in front of the
 * MongoDB `GeneratedQuestionsCollection`).
 *
 * Note: MongoDB must never be queried directly from the client — the driver is
 * Node-only and would leak credentials. Put it behind an HTTP endpoint instead.
 */

// Bundled fallback deck. Metro bundles JSON imports directly.
import sample from '../assets/data/questions.json';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Question {
  leetQuestionId: number;
  questionId: string;
  title: string;
  topics: string[];
  difficulty: Difficulty;
  question: string;
  /** Exactly four choices. */
  options: string[];
  /** Index (0-3) of the correct option. */
  answer: number;
  explanation: string;
}

interface QuestionSet {
  questions: Question[];
}

const REMOTE_URL = process.env.EXPO_PUBLIC_QUESTIONS_URL;

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

function normalize(set: Partial<QuestionSet> | undefined): Question[] {
  const list = set?.questions ?? [];
  return list.filter(isValidQuestion);
}

/**
 * Fetch the deck. Tries the remote endpoint when configured, and always falls
 * back to the bundled sample deck so the UI is never empty.
 */
export async function fetchQuestions(): Promise<Question[]> {
  if (REMOTE_URL) {
    try {
      const res = await fetch(REMOTE_URL);
      if (res.ok) {
        const data = (await res.json()) as QuestionSet;
        const questions = normalize(data);
        if (questions.length > 0) return questions;
      }
    } catch (err) {
      console.warn('LeetSwipe: remote questions unavailable, using bundled deck.', err);
    }
  }
  return normalize(sample as QuestionSet);
}

/** The bundled deck, exposed synchronously for previews and tests. */
export const sampleQuestions: Question[] = normalize(sample as QuestionSet);
