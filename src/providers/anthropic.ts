import { httpError, ProviderError, type AIProvider, type CompletionRequest } from './types';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

/** Required for direct fetch from an extension/browser context. */
/**
 * Field matching is mechanical, so it does not need deep reasoning — low effort
 * cuts cost and latency on a call that runs on every form. Haiku 4.5 rejects
 * the parameter, so it is only sent to models that accept it.
 */
function effortFor(model: string): Record<string, unknown> {
  return /haiku/.test(model) ? {} : { output_config: { effort: 'low' } };
}

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
    { id: 'claude-opus-5', label: 'Claude Opus 5 (recommended)' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest, cheapest)' },
  ],

  async validateKey(apiKey, model) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'x-api-key': apiKey },
      body: JSON.stringify({
        // Thinking is on by default on current models, so a 4-token ceiling is
        // too tight to come back cleanly. This only has to prove the key works.
        model,
        max_tokens: 16,
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
        ...effortFor(req.model),
        // Thinking is deliberately left on. With it disabled, current models
        // sometimes write a tool call into visible text instead of emitting a
        // tool_use block — which would silently return nothing here.
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
