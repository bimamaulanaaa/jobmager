import type { ProviderId } from '@/types/settings';

export interface ModelOption {
  id: string;
  label: string;
}

export interface CompletionRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** JSON Schema the provider should conform its output to. */
  schema: Record<string, unknown>;
  /** Name given to the structured output (tool name / schema name). */
  schemaName: string;
  maxTokens?: number;
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  models: ModelOption[];
  keyHint: string;
  keyUrl: string;
  /** Cheapest possible call that proves the key works. */
  validateKey(apiKey: string, model: string): Promise<void>;
  /** Returns raw JSON text; callers parse and validate it. */
  complete(req: CompletionRequest): Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'BAD_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'PARSE' | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Maps an HTTP failure onto a message worth showing a human. */
export async function httpError(res: Response, provider: string): Promise<ProviderError> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? JSON.stringify(body).slice(0, 300);
  } catch {
    detail = (await res.text().catch(() => '')).slice(0, 300);
  }
  if (res.status === 401 || res.status === 403) {
    return new ProviderError(`${provider} rejected the API key (${res.status}). ${detail}`, 'BAD_KEY');
  }
  if (res.status === 429) {
    return new ProviderError(`${provider} rate limit hit. ${detail}`, 'RATE_LIMIT');
  }
  return new ProviderError(`${provider} error ${res.status}: ${detail}`, 'UNKNOWN');
}
