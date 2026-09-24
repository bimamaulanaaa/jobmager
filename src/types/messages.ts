import type { FieldDescriptor, AutofillStats } from './field';
import type { Profile, SavedAnswer } from './profile';
import type { ProviderId } from './settings';

/** popup / options / content -> background service worker */
export type BackgroundRequest =
  | { type: 'VALIDATE_KEY'; providerId: ProviderId; model: string; apiKey: string }
  | {
      type: 'MATCH_FIELDS';
      fields: FieldDescriptor[];
      pageTitle: string;
      pageUrl: string;
    }
  | { type: 'PARSE_RESUME'; text: string };

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'NO_KEY' | 'BAD_KEY' | 'NO_PROFILE' | 'PARSE' | 'NETWORK' };

/** popup -> content script */
export type ContentRequest =
  | { type: 'PING' }
  | { type: 'AUTOFILL' }
  | { type: 'CLEAR_HIGHLIGHTS' };

export type ContentResponse =
  | { ok: true; stats: AutofillStats }
  | { ok: false; error: string; code?: string };

/** content script -> background (answer capture) */
export interface SaveAnswerMessage {
  type: 'SAVE_ANSWER';
  question: string;
  answer: string;
  origin: string;
}

export type { FieldDescriptor, AutofillStats, Profile, SavedAnswer };
