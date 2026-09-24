import { DEFAULT_SETTINGS, type Settings } from '@/types/settings';
import type { Profile, SavedAnswer } from '@/types/profile';

const KEYS = {
  settings: 'jm_settings',
  profiles: 'jm_profiles',
  answers: 'jm_answers',
} as const;

async function get<T>(key: string, fallback: T): Promise<T> {
  const bag = await chrome.storage.local.get(key);
  const value = bag[key];
  return value === undefined ? fallback : (value as T);
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/* ------------------------------- settings ------------------------------- */

export async function getSettings(): Promise<Settings> {
  const stored = await get<Partial<Settings>>(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await set(KEYS.settings, next);
  return next;
}

/* ------------------------------- profiles ------------------------------- */

export async function getProfiles(): Promise<Profile[]> {
  return get<Profile[]>(KEYS.profiles, []);
}

export async function getActiveProfile(): Promise<Profile | null> {
  const [settings, profiles] = await Promise.all([getSettings(), getProfiles()]);
  if (!profiles.length) return null;
  return profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0];
}

export async function upsertProfile(profile: Profile): Promise<Profile[]> {
  const profiles = await getProfiles();
  const index = profiles.findIndex((p) => p.id === profile.id);
  const next = { ...profile, updatedAt: Date.now() };
  if (index === -1) profiles.push(next);
  else profiles[index] = next;
  await set(KEYS.profiles, profiles);
  // First profile created becomes the active one.
  const settings = await getSettings();
  if (!settings.activeProfileId) await saveSettings({ activeProfileId: next.id });
  return profiles;
}

export async function deleteProfile(id: string): Promise<Profile[]> {
  const profiles = (await getProfiles()).filter((p) => p.id !== id);
  await set(KEYS.profiles, profiles);
  const settings = await getSettings();
  if (settings.activeProfileId === id) {
    await saveSettings({ activeProfileId: profiles[0]?.id ?? null });
  }
  return profiles;
}

/* ----------------------------- saved answers ---------------------------- */

export async function getAnswers(): Promise<SavedAnswer[]> {
  return get<SavedAnswer[]>(KEYS.answers, []);
}

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').replace(/[*:?]+$/g, '').trim();
}

/** Upserts by normalized question so repeat applications update in place. */
export async function saveAnswer(
  input: { question: string; answer: string; origin?: string },
): Promise<SavedAnswer[]> {
  const answers = await getAnswers();
  const key = normalizeQuestion(input.question);
  const existing = answers.find((a) => normalizeQuestion(a.question) === key);
  if (existing) {
    existing.answer = input.answer;
    existing.updatedAt = Date.now();
    existing.useCount += 1;
  } else {
    answers.push({
      id: crypto.randomUUID(),
      question: input.question.trim(),
      answer: input.answer,
      origin: input.origin ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      useCount: 1,
    });
  }
  await set(KEYS.answers, answers);
  return answers;
}

export async function updateAnswer(answer: SavedAnswer): Promise<SavedAnswer[]> {
  const answers = await getAnswers();
  const index = answers.findIndex((a) => a.id === answer.id);
  if (index !== -1) answers[index] = { ...answer, updatedAt: Date.now() };
  await set(KEYS.answers, answers);
  return answers;
}

export async function deleteAnswer(id: string): Promise<SavedAnswer[]> {
  const answers = (await getAnswers()).filter((a) => a.id !== id);
  await set(KEYS.answers, answers);
  return answers;
}

export async function exportAll(): Promise<Record<string, unknown>> {
  const [settings, profiles, answers] = await Promise.all([
    getSettings(), getProfiles(), getAnswers(),
  ]);
  // The API key is deliberately stripped from exports.
  return { settings: { ...settings, apiKey: '' }, profiles, answers, exportedAt: Date.now() };
}
