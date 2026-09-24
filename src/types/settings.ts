export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface Settings {
  providerId: ProviderId;
  model: string;
  /** Stored in chrome.storage.local and never sent anywhere but the provider. */
  apiKey: string;
  activeProfileId: string | null;
  onboarded: boolean;
  /** Offer "Save this answer?" after the user types into an unfilled field. */
  savePrompts: boolean;
  /** Keep the green/yellow outlines on screen after autofill. */
  highlight: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  providerId: 'anthropic',
  model: 'claude-sonnet-5',
  apiKey: '',
  activeProfileId: null,
  onboarded: false,
  savePrompts: true,
  highlight: true,
};
