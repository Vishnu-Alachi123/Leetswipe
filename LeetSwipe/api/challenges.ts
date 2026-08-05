/**
 * Code challenges — write-the-function problems, graded on device.
 *
 * Bundled like the deck and the reels, so the whole feature works offline. See
 * ./code-runner.ts for why grading is local rather than a hosted sandbox.
 */
import bundled from '../assets/data/challenges.json';
import type { TestCase } from './code-runner';
import type { Difficulty } from './get-questions';

export interface Challenge {
  challengeId: string;
  title: string;
  difficulty: Difficulty;
  category: string;
  lists?: string[];
  sourceSlug?: string;
  /** The function the tests call. Must be defined by the learner's code. */
  functionName: string;
  timeEstimate: number;
  problemStatement: string;
  starterCode: string;
  solution: string;
  testCases: TestCase[];
  /** Three, escalating from a nudge to a near-solution. */
  hints: string[];
  explanation: string;
  timeComplexity?: string;
  spaceComplexity?: string;
}

interface ChallengeSet {
  challenges: Challenge[];
}

function isValid(c: any): c is Challenge {
  return (
    c &&
    typeof c.challengeId === 'string' &&
    typeof c.functionName === 'string' &&
    typeof c.starterCode === 'string' &&
    Array.isArray(c.testCases) &&
    c.testCases.length > 0
  );
}

export const challenges: Challenge[] = ((bundled as ChallengeSet).challenges ?? []).filter(isValid);

export function challengeById(id: string): Challenge | undefined {
  return challenges.find((c) => c.challengeId === id);
}

export function challengesForCategory(category?: string): Challenge[] {
  if (!category) return challenges;
  return challenges.filter((c) => c.category === category);
}
