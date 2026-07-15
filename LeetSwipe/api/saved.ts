/**
 * Saved-questions store — local-first, synced to the API when configured.
 *
 * Saves are written to AsyncStorage immediately (optimistic + offline) and
 * mirrored to the API (`POST/DELETE /saved`) so they persist across devices when
 * signed in. On load, the API list (when reachable) is the source of truth and is
 * cached locally; otherwise the local cache is used.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';
import { authHeader } from './auth';
import type { Question } from './get-questions';

const SAVED_KEY = 'leetswipe.saved';

export interface SavedQuestion extends Question {
  savedAt: string;
}

async function readLocal(): Promise<SavedQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedQuestion[]) : [];
  } catch {
    return [];
  }
}

async function writeLocal(list: SavedQuestion[]): Promise<void> {
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

/** All saved questions, newest first. Prefers the API list when reachable. */
export async function getSaved(): Promise<SavedQuestion[]> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/saved`, { headers: await authHeader() });
      if (res.ok) {
        const { saved } = (await res.json()) as { saved: SavedQuestion[] };
        await writeLocal(saved);
        return saved;
      }
    } catch {
      // fall through to local cache
    }
  }
  return readLocal();
}

/** Save a question. Idempotent on questionId. Returns the updated local list. */
export async function saveQuestion(q: Question): Promise<SavedQuestion[]> {
  const list = await readLocal();
  if (!list.some((s) => s.questionId === q.questionId)) {
    list.unshift({ ...q, savedAt: new Date().toISOString() });
    await writeLocal(list);
  }
  if (API_URL) {
    try {
      await fetch(`${API_URL}/saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(q),
      });
    } catch {
      // best-effort; local copy already written
    }
  }
  return list;
}

/** Remove a saved question. Returns the updated local list. */
export async function unsaveQuestion(questionId: string): Promise<SavedQuestion[]> {
  const list = (await readLocal()).filter((s) => s.questionId !== questionId);
  await writeLocal(list);
  if (API_URL) {
    try {
      await fetch(`${API_URL}/saved/${encodeURIComponent(questionId)}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });
    } catch {
      // best-effort
    }
  }
  return list;
}
