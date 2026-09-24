/** Tolerant JSON extraction: models occasionally wrap output in prose or fences. */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  const attempts: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('The AI response was not valid JSON.');
}
