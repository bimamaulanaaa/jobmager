import type { FieldDescriptor, FieldMatch } from '@/types/field';
import type { Profile, SavedAnswer } from '@/types/profile';
import { allowedCorpus } from './profile-facts';

export interface ValidationResult {
  matches: FieldMatch[];
  rejections: { fieldId: string; value: string; reason: string }[];
}

/** Lowercase, collapse whitespace, drop edge punctuation. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:*•-]+|[\s.,;:*•-]+$/g, '')
    .trim();
}

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, '');
}

/** Returns YYYY-MM-DD when the string is unambiguously a date, else null. */
function asDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  // Ambiguous between D/M/Y and M/D/Y — only accept when one reading is possible.
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) return `${m[3]}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    if (b > 12 && a <= 12) return `${m[3]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    if (a <= 12 && b <= 12) return `${m[3]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  // Month/year, the shape most application forms use for employment dates.
  m = t.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = t.match(/^([a-z]{3,9})\.?\s+(\d{4})$/i);
  if (m) {
    const idx = months.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx !== -1) return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
  }
  m = t.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const idx = months.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx !== -1) return `${m[3]}-${String(idx + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

const BOOLEANISH = new Set(['yes', 'no', 'true', 'false', 'y', 'n']);

/**
 * The delimited parts of a stored value — the city inside a one-line address,
 * one skill inside a joined list. Splitting a stored value into its parts is
 * allowed; slicing arbitrary characters out of one is not, because the slice
 * is rarely a fact in its own right ("LinkedIn" out of a LinkedIn URL is a
 * plausible answer to "how did you hear about us", and a fabricated one).
 */
function chunksOf(value: string): string[] {
  return value
    .split(/[,;|\n\t]| - /)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

/**
 * Can `value` be traced back to something the user actually supplied?
 *
 * Only containment in the *user's direction* is allowed — the value may be a
 * fragment of a stored value, never a stored value padded with new words. That
 * asymmetry is what stops the model from inventing facts around real ones.
 */
function traceable(value: string, corpus: string[], normCorpus: string[]): boolean {
  const v = norm(value);
  if (!v) return false;

  if (normCorpus.includes(v)) return true;

  // Numbers: "$120,000" and "120000" are the same claim.
  const vDigits = digitsOnly(value);
  if (vDigits.length >= 2 && corpus.some((c) => digitsOnly(c) === vDigits)) return true;

  // Dates: same instant written differently is the same claim.
  const vDate = asDate(value);
  if (vDate && corpus.some((c) => asDate(c) === vDate)) return true;

  // Yes/no restatements of a stored answer.
  if (BOOLEANISH.has(v)) {
    const re = new RegExp(`\\b${v}\\b`);
    if (normCorpus.some((c) => re.test(c))) return true;
  }

  // A whole delimited part of a stored value: the city out of a one-line
  // address, one skill out of a joined list.
  if (corpus.some((c) => chunksOf(c).some((chunk) => norm(chunk) === v))) return true;

  return false;
}

/** A list value passes if every one of its items passes on its own. */
function traceableList(value: string, corpus: string[], normCorpus: string[]): boolean {
  const parts = value
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((p) => traceable(p, corpus, normCorpus));
}

/** Resolves a proposed value against a field's option list. */
function resolveOption(value: string, options: { value: string; label: string }[]): string | null {
  const v = norm(value);
  if (!v) return null;
  const exact =
    options.find((o) => norm(o.value) === v) ?? options.find((o) => norm(o.label) === v);
  if (exact) return exact.value;
  // Sites often render "Yes, I am authorized" for a plain "yes".
  const partial = options.filter((o) => norm(o.label).startsWith(v) || norm(o.label) === v);
  if (partial.length === 1) return partial[0].value;
  return null;
}

/**
 * Rejects anything the AI produced that cannot be traced back to the profile
 * or saved answers. This runs regardless of what the system prompt said — the
 * prompt is a request, this is the enforcement.
 */
export function validateMatches(
  raw: Record<string, unknown>,
  fields: FieldDescriptor[],
  profile: Profile,
  answers: SavedAnswer[],
): ValidationResult {
  const corpus = allowedCorpus(profile, answers).filter(Boolean);
  const normCorpus = corpus.map(norm).filter(Boolean);

  const matches: FieldMatch[] = [];
  const rejections: ValidationResult['rejections'] = [];

  for (const field of fields) {
    const proposed = raw[field.id];

    if (proposed === null || proposed === undefined || proposed === '') {
      matches.push({ fieldId: field.id, value: null });
      continue;
    }
    if (typeof proposed !== 'string') {
      rejections.push({ fieldId: field.id, value: String(proposed), reason: 'not a string' });
      matches.push({ fieldId: field.id, value: null, rejected: 'not a string' });
      continue;
    }

    const value = proposed.trim();

    // Fields with a fixed option set: the value must be one of the options.
    if (field.options && field.options.length) {
      if (field.multiple) {
        const picked = value
          .split(/[,;\n]/)
          .map((p) => resolveOption(p, field.options!))
          .filter((p): p is string => p !== null);
        if (!picked.length) {
          rejections.push({ fieldId: field.id, value, reason: 'no option matched' });
          matches.push({ fieldId: field.id, value: null, rejected: 'no option matched' });
        } else {
          matches.push({ fieldId: field.id, value: picked.join(',') });
        }
        continue;
      }
      const resolved = resolveOption(value, field.options);
      if (resolved === null) {
        rejections.push({ fieldId: field.id, value, reason: 'not one of the offered options' });
        matches.push({ fieldId: field.id, value: null, rejected: 'not one of the offered options' });
      } else {
        matches.push({ fieldId: field.id, value: resolved });
      }
      continue;
    }

    // Free-text field: the value must be traceable to user-supplied data.
    if (traceable(value, corpus, normCorpus) || traceableList(value, corpus, normCorpus)) {
      matches.push({ fieldId: field.id, value });
    } else {
      rejections.push({ fieldId: field.id, value, reason: 'not found in profile or saved answers' });
      matches.push({ fieldId: field.id, value: null, rejected: 'not found in profile or saved answers' });
    }
  }

  return { matches, rejections };
}

export const __testing = { norm, asDate, traceable, resolveOption };
