import type { ContentRequest, ContentResponse } from '@/types/messages';
import type { AutofillStats } from '@/types/field';
import { scanAll } from './field-scanner';
import { fillFields } from './form-filler';
import { clearHighlights, injectStyles, markEmpty, markFilled, toast } from './highlight';
import { stopWatching, watchEmptyFields } from './save-answer';

/**
 * Injected on demand when the user presses Autofill, in every frame of the tab.
 * Each frame scans and fills independently, which is what makes iframe-embedded
 * application forms (Greenhouse, Lever) work without any special-casing.
 */

declare global {
  interface Window {
    __jobmagerReady?: boolean;
  }
}

async function runAutofill(): Promise<ContentResponse> {
  injectStyles();
  clearHighlights();
  stopWatching();

  const fields = scanAll();
  if (!fields.length) {
    return { ok: false, error: 'No fillable fields found in this frame.', code: 'NO_FIELDS' };
  }

  const response = await chrome.runtime.sendMessage({
    type: 'MATCH_FIELDS',
    fields: fields.map((f) => f.descriptor),
    pageTitle: document.title,
    pageUrl: location.href,
  });

  if (!response?.ok) {
    return {
      ok: false,
      error: response?.error ?? 'The background service did not respond.',
      code: response?.code,
    };
  }

  const { matches, rejections } = response.data as {
    matches: { fieldId: string; value: string | null; rejected?: string }[];
    rejections: { fieldId: string; value: string; reason: string }[];
  };

  const outcomes = fillFields(fields, matches);
  const byId = new Map(fields.map((f) => [f.descriptor.id, f]));

  const stats: AutofillStats = {
    total: fields.length,
    filled: 0,
    empty: 0,
    rejected: rejections.length,
  };

  const empties: { descriptor: (typeof fields)[number]['descriptor']; element: HTMLElement }[] = [];

  for (const outcome of outcomes) {
    const field = byId.get(outcome.fieldId);
    if (!field) continue;
    if (outcome.filled) {
      stats.filled++;
      field.elements.forEach(markFilled);
    } else {
      stats.empty++;
      field.elements.forEach(markEmpty);
      empties.push({ descriptor: field.descriptor, element: field.elements[0] });
    }
  }

  const stored = (await chrome.storage.local.get('jm_settings')) as {
    jm_settings?: { savePrompts?: boolean; highlight?: boolean };
  };
  const savePrompts = stored.jm_settings?.savePrompts !== false;
  const highlight = stored.jm_settings?.highlight !== false;

  if (savePrompts) watchEmptyFields(empties);
  if (!highlight) clearHighlights();

  if (rejections.length) {
    // Visible on the page so a silent drop never looks like a silent success.
    toast(
      `Jobmager left ${rejections.length} field${rejections.length === 1 ? '' : 's'} empty: ` +
        'the AI proposed values that are not in your profile.',
      5000,
    );
  }

  return { ok: true, stats };
}

if (!window.__jobmagerReady) {
  window.__jobmagerReady = true;

  chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true, stats: { total: 0, filled: 0, empty: 0, rejected: 0 } });
      return false;
    }
    if (message?.type === 'CLEAR_HIGHLIGHTS') {
      clearHighlights();
      stopWatching();
      sendResponse({ ok: true, stats: { total: 0, filled: 0, empty: 0, rejected: 0 } });
      return false;
    }
    if (message?.type === 'AUTOFILL') {
      runAutofill()
        .then(sendResponse)
        .catch((err: unknown) =>
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
        );
      return true;
    }
    return false;
  });
}
