import { httpError, ProviderError, type AIProvider, type CompletionRequest } from './types';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

/** Required for direct fetch from an extension/browser context. */
const BROWSER_HEADERS = {
  'anthropic-version': VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
  'content-type': 'application/json',
};

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  keyHint: 'sk-ant-...',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  models: [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (recommended)' },
    { id: 'claude-opus-5', label: 'Claude Opus 5 (most capable)' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
  ],

  async validateKey(apiKey, model) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'x-api-key': apiKey },
      body: JSON.stringify({
        model,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (!res.ok) throw await httpError(res, 'Anthropic');
  },

  async complete(req: CompletionRequest) {
    // Forced tool use is Anthropic's structured-output path.
    const res = await fetch(API, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'x-api-key': req.apiKey },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        tools: [
          {
            name: req.schemaName,
            description: 'Return the result using this schema.',
            input_schema: req.schema,
          },
        ],
        tool_choice: { type: 'tool', name: req.schemaName },
      }),
    });
    if (!res.ok) throw await httpError(res, 'Anthropic');
    const body = await res.json();
    const toolUse = (body.content ?? []).find(
      (b: { type: string }) => b.type === 'tool_use',
    );
    if (!toolUse) {
      const text = (body.content ?? []).find((b: { type: string }) => b.type === 'text')?.text;
      if (text) return text;
      throw new ProviderError('Anthropic returned no structured output.', 'PARSE');
    }
    return JSON.stringify(toolUse.input);
  },
};
