import { getActiveProfile, getAnswers, getSettings, saveAnswer } from '@/storage';
import { getProvider, ProviderError } from '@/providers';
import { matchFields } from '@/core/ai-matcher';
import { parseJsonLoose } from '@/core/json';
import { buildResumePrompt, RESUME_SCHEMA, RESUME_SYSTEM_PROMPT } from '@/core/prompt';
import type { BackgroundRequest, BackgroundResponse, SaveAnswerMessage } from '@/types/messages';

/**
 * Every provider call happens here. The API key never enters a page's context,
 * and requests originate from the extension rather than the job site.
 */

type AnyRequest = BackgroundRequest | SaveAnswerMessage;
type ErrorCode = NonNullable<Extract<BackgroundResponse, { ok: false }>['code']>;

function fail(error: string, code?: ErrorCode): BackgroundResponse {
  return { ok: false, error, code };
}

function describeError(err: unknown): BackgroundResponse {
  if (err instanceof ProviderError) {
    if (err.code === 'BAD_KEY') return fail(err.message, 'BAD_KEY');
    if (err.code === 'PARSE') return fail(err.message, 'PARSE');
    return fail(err.message, 'NETWORK');
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return fail('Could not reach the AI provider. Check your connection.', 'NETWORK');
  }
  return fail(message);
}

async function handleValidateKey(req: Extract<BackgroundRequest, { type: 'VALIDATE_KEY' }>) {
  if (!req.apiKey.trim()) return fail('Enter an API key first.', 'NO_KEY');
  await getProvider(req.providerId).validateKey(req.apiKey.trim(), req.model);
  return { ok: true, data: { valid: true } } satisfies BackgroundResponse;
}

async function handleMatchFields(req: Extract<BackgroundRequest, { type: 'MATCH_FIELDS' }>) {
  const settings = await getSettings();
  if (!settings.apiKey.trim()) {
    return fail('No API key set. Open Jobmager settings and add one.', 'NO_KEY');
  }
  const profile = await getActiveProfile();
  if (!profile) {
    return fail('No profile yet. Open Jobmager settings and create one.', 'NO_PROFILE');
  }
  const answers = await getAnswers();

  const result = await matchFields({
    providerId: settings.providerId,
    model: settings.model,
    apiKey: settings.apiKey.trim(),
    profile,
    answers,
    fields: req.fields,
    pageTitle: req.pageTitle,
    pageUrl: req.pageUrl,
  });

  return { ok: true, data: result } satisfies BackgroundResponse;
}

async function handleParseResume(req: Extract<BackgroundRequest, { type: 'PARSE_RESUME' }>) {
  const settings = await getSettings();
  if (!settings.apiKey.trim()) {
    return fail('No API key set. Add one under Settings before parsing a resume.', 'NO_KEY');
  }
  const provider = getProvider(settings.providerId);
  const raw = await provider.complete({
    apiKey: settings.apiKey.trim(),
    model: settings.model,
    system: RESUME_SYSTEM_PROMPT,
    user: buildResumePrompt(req.text),
    schema: RESUME_SCHEMA,
    schemaName: 'extract_resume',
    maxTokens: 8192,
  });
  const draft = parseJsonLoose<Record<string, unknown>>(raw);
  return { ok: true, data: draft } satisfies BackgroundResponse;
}

chrome.runtime.onMessage.addListener((message: AnyRequest, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'VALIDATE_KEY':
          sendResponse(await handleValidateKey(message));
          break;
        case 'MATCH_FIELDS':
          sendResponse(await handleMatchFields(message));
          break;
        case 'PARSE_RESUME':
          sendResponse(await handleParseResume(message));
          break;
        case 'SAVE_ANSWER': {
          const origin = message.origin || (sender.url ? new URL(sender.url).hostname : '');
          await saveAnswer({ question: message.question, answer: message.answer, origin });
          sendResponse({ ok: true, data: { saved: true } } satisfies BackgroundResponse);
          break;
        }
        default:
          sendResponse(fail(`Unknown message: ${(message as { type: string }).type}`));
      }
    } catch (err) {
      sendResponse(describeError(err));
    }
  })();
  // Keeps the message channel open for the async work above.
  return true;
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return;
  const settings = await getSettings();
  if (!settings.onboarded) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') });
  }
});
