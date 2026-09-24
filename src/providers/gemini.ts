import { httpError, ProviderError, type AIProvider, type CompletionRequest } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  keyHint: 'AIza...',
  keyUrl: 'https://aistudio.google.com/app/apikey',
  models: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],

  async validateKey(apiKey, model) {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 8 },
      }),
    });
    if (!res.ok) throw await httpError(res, 'Gemini');
  },

  async complete(req: CompletionRequest) {
    const res = await fetch(`${BASE}/${req.model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: req.maxTokens ?? 4096,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) throw await httpError(res, 'Gemini');
    const body = await res.json();
    const text = body.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('');
    if (!text) throw new ProviderError('Gemini returned no content.', 'PARSE');
    return text;
  },
};
