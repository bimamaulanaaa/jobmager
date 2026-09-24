import type { FieldDescriptor, FieldMatch } from '@/types/field';
import type { Profile, SavedAnswer } from '@/types/profile';
import { getProvider, ProviderError } from '@/providers';
import type { ProviderId } from '@/types/settings';
import { buildMatchPrompt, buildMatchSchema, MATCH_SYSTEM_PROMPT } from './prompt';
import { parseJsonLoose } from './json';
import { validateMatches } from './validator';

export interface MatchResult {
  matches: FieldMatch[];
  rejections: { fieldId: string; value: string; reason: string }[];
}

/**
 * One request for the whole form: the model sees every field at once, which is
 * what lets it disambiguate (e.g. two "Name" inputs that are first/last).
 */
export async function matchFields(args: {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  profile: Profile;
  answers: SavedAnswer[];
  fields: FieldDescriptor[];
  pageTitle: string;
  pageUrl: string;
}): Promise<MatchResult> {
  if (!args.fields.length) return { matches: [], rejections: [] };

  const provider = getProvider(args.providerId);
  const raw = await provider.complete({
    apiKey: args.apiKey,
    model: args.model,
    system: MATCH_SYSTEM_PROMPT,
    user: buildMatchPrompt(args),
    schema: buildMatchSchema(args.fields),
    schemaName: 'fill_form_fields',
    maxTokens: Math.min(8192, 512 + args.fields.length * 80),
  });

  let parsed: Record<string, unknown>;
  try {
    const body = parseJsonLoose<Record<string, unknown>>(raw);
    // Accept both { fields: {...} } and a bare { fieldId: value } object.
    const inner = (body as { fields?: unknown }).fields;
    parsed = (inner && typeof inner === 'object' ? inner : body) as Record<string, unknown>;
  } catch (err) {
    throw new ProviderError(
      `Could not read the AI response as JSON: ${(err as Error).message}`,
      'PARSE',
    );
  }

  return validateMatches(parsed, args.fields, args.profile, args.answers);
}
