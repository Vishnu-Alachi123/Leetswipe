/**
 * Algorithm reels — the Learn tab's data layer.
 *
 * Reels are step-by-step walkthroughs of one algorithm: a few lines of code per
 * step, the state of the data structure after it runs, and a narration script.
 * They are produced by ../../backend_question_generation/seed_reels.py (curated)
 * and generate_reels.py (LLM), and shaped by schema.AlgorithmReel.
 *
 * Like the question deck, reels ship bundled so the tab works offline, with the
 * API used only as an upgrade when one is configured.
 */
import bundled from '../assets/data/reels.json';
import { API_URL } from './config';
import type { Difficulty } from './get-questions';

/** Which renderer draws a step's data structure. */
export type VizKind =
  | 'array'
  | 'matrix'
  | 'tree'
  | 'graph'
  | 'stack'
  | 'queue'
  | 'linkedlist'
  | 'table'
  | 'none';

/** How a cell or node is drawn. `active` is what the current line touches. */
export type VizStatus = 'normal' | 'active' | 'visited' | 'eliminated' | 'found';

export interface VizCell {
  value: string | number;
  status?: VizStatus;
  /** Pointer name shown beneath the cell, e.g. "lo", "mid". */
  label?: string;
}

export interface VizNode {
  id: string;
  value: string | number;
  status?: VizStatus;
}

export interface VizEdge {
  from: string;
  to: string;
  status?: VizStatus;
}

export interface Visualization {
  kind: VizKind;
  /** Renderer payload. Shape depends on `kind` — see the renderer's guards. */
  state: {
    cells?: VizCell[];
    nodes?: VizNode[];
    edges?: VizEdge[];
    columns?: string[];
    rows?: (string | number)[][];
    highlight?: number;
  };
  caption?: string;
}

export interface ReelStep {
  stepNumber: number;
  code: string;
  /** 1-based lines of `fullCode` this step executes. */
  highlightLines?: number[];
  explanation: string;
  /** Narration text, read aloud by expo-speech. */
  audioScript: string;
  visualization: Visualization;
}

export interface AlgorithmReel {
  reelId: string;
  algorithmName: string;
  description: string;
  hook?: string;
  language: 'python' | 'javascript';
  fullCode: string;
  steps: ReelStep[];
  difficulty: Difficulty;
  topics?: string[];
  category?: string;
  lists?: string[];
  sourceSlug?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  durationSeconds?: number;
  source?: string;
}

interface ReelSet {
  reels: AlgorithmReel[];
}

/** Guards against a malformed payload emptying the tab. */
function isValidReel(r: any): r is AlgorithmReel {
  return (
    r &&
    typeof r.reelId === 'string' &&
    typeof r.fullCode === 'string' &&
    Array.isArray(r.steps) &&
    r.steps.length > 0 &&
    r.steps.every((s: any) => s && typeof s.code === 'string' && s.visualization)
  );
}

function normalize(set: Partial<ReelSet> | undefined): AlgorithmReel[] {
  return (set?.reels ?? []).filter(isValidReel);
}

/** The bundled reels, available synchronously and offline. */
export const bundledReels: AlgorithmReel[] = normalize(bundled as ReelSet);

export interface ReelFilter {
  category?: string;
  difficulty?: Difficulty;
}

function matches(reel: AlgorithmReel, filter: ReelFilter): boolean {
  if (filter.category && reel.category !== filter.category) return false;
  if (filter.difficulty && reel.difficulty !== filter.difficulty) return false;
  return true;
}

/** Fetch reels, preferring the API and always falling back to the bundle. */
export async function fetchReels(filter: ReelFilter = {}): Promise<AlgorithmReel[]> {
  if (API_URL) {
    try {
      const params = new URLSearchParams();
      if (filter.category) params.set('category', filter.category);
      if (filter.difficulty) params.set('difficulty', filter.difficulty);
      const query = params.toString();
      const res = await fetch(`${API_URL}/reels${query ? `?${query}` : ''}`);
      if (res.ok) {
        const reels = normalize((await res.json()) as ReelSet);
        if (reels.length > 0) return reels;
      }
    } catch (err) {
      console.warn('LeetSwipe: remote reels unavailable, using bundled set.', err);
    }
  }
  return bundledReels.filter((r) => matches(r, filter));
}

/** Distinct categories present in the bundled reels, for the filter row. */
export function reelCategories(reels: AlgorithmReel[] = bundledReels): string[] {
  return [...new Set(reels.map((r) => r.category).filter(Boolean) as string[])].sort();
}

/** Split `fullCode` into lines once, so the player can highlight by index. */
export function codeLines(reel: AlgorithmReel): string[] {
  return reel.fullCode.split('\n');
}

/** Total narration length, used for the duration badge. */
export function estimatedSeconds(reel: AlgorithmReel): number {
  if (reel.durationSeconds) return reel.durationSeconds;
  const words = reel.steps.reduce((n, s) => n + s.audioScript.split(/\s+/).length, 0);
  return Math.max(15, Math.round(words / 2.6));
}
