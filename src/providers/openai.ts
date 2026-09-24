import { httpError, ProviderError, type AIProvider, type CompletionRequest } from './types';

const API = 'https://api.openai.com/v1/chat/completions';

export const openaiProvider: AIProvider = {
  id: 'openai',
  label: 'OpenAI',
  keyHint: 'sk-...',
  keyUrl: 'https://platform.openai.com/api-keys',
  models: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini (recommended)' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (fastest)' },
  ],

  async validateKey(apiKey, model) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (!res.ok) throw await httpError(res, 'OpenAI');
  },

  async complete(req: CompletionRequest) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: 0,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: req.schemaName,
            strict: false,
            schema: req.schema,
          },
        },
      }),
    });
    if (!res.ok) throw await httpError(res, 'OpenAI');
    const body = await res.json();
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new ProviderError('OpenAI returned no message content.', 'PARSE');
    }
    return text;
  },
};
