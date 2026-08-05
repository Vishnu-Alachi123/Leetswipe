/**
 * One place that decides which text-to-speech voice the app uses.
 *
 * Devices ship several voices and the platform default is usually the worst of
 * them — the robotic compact voice. Ranking the available voices and asking for
 * the best one is free and makes a bigger difference than any rate/pitch
 * tuning: iPhones carry "enhanced"/"premium" Siri voices, Android and Chrome
 * carry Google's natural voices, all selectable by identifier.
 *
 * (A hosted voice — ElevenLabs, OpenAI TTS — would sound better still, but
 * costs money per word and breaks offline; revisit if retention justifies it.)
 */
import * as Speech from 'expo-speech';

let resolved: Promise<string | undefined> | null = null;

/** Higher score wins. Scores one voice by the quality tells in its metadata. */
function score(voice: Speech.Voice): number {
  const id = `${voice.identifier} ${voice.name}`.toLowerCase();
  const lang = (voice.language || '').toLowerCase();
  let s = 0;
  if (lang.startsWith('en')) s += 4;
  if (lang === 'en-us' || lang === 'en_us') s += 2;
  // Platform quality markers, roughly ordered by how good they sound.
  if (/natural|neural/.test(id)) s += 8;
  if ((voice as { quality?: string }).quality === 'Enhanced') s += 7;
  if (/premium|enhanced/.test(id)) s += 7;
  if (/google/.test(id)) s += 5;
  if (/siri/.test(id)) s += 3;
  // The compact voices are the robotic ones — actively avoid them.
  if (/compact/.test(id)) s -= 6;
  return s;
}

/** The best voice identifier on this device, resolved once and cached. */
export function bestVoice(): Promise<string | undefined> {
  if (!resolved) {
    resolved = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const english = voices.filter((v) => (v.language || '').toLowerCase().startsWith('en'));
        const pool = english.length ? english : voices;
        if (!pool.length) return undefined;
        return [...pool].sort((a, b) => score(b) - score(a))[0].identifier;
      })
      .catch(() => undefined);
  }
  return resolved;
}

export interface SpeakOptions {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
}

/** Speak with the best available voice. Same contract as Speech.speak. */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const voice = await bestVoice();
  Speech.speak(text, {
    voice,
    rate: 0.98,
    pitch: 1.0,
    ...options,
  });
}

export const stop = Speech.stop;
