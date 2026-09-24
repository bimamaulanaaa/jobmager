import type { ProviderId } from '@/types/settings';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { geminiProvider } from './gemini';
import type { AIProvider } from './types';

export const PROVIDERS: Record<ProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
};

export const PROVIDER_LIST: AIProvider[] = [
  anthropicProvider,
  openaiProvider,
  geminiProvider,
];

export function getProvider(id: ProviderId): AIProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export * from './types';
