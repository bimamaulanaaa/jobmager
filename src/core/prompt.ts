import type { FieldDescriptor } from '@/types/field';
import type { Profile, SavedAnswer } from '@/types/profile';
import { profileFacts } from './profile-facts';

export const MATCH_SYSTEM_PROMPT = `You map a user's stored job-application data onto the fields of a web form.

You are a MATCHER, not a writer. You never compose, infer, summarise, translate,
paraphrase, or complete anything. You only decide which stored value — if any —
belongs in which field.

HARD RULES (violating any of these is a failure, even if the answer looks helpful):
1. Every value you output must already exist, character for character, in the
   USER DATA block: a profile fact, a custom field, or a saved answer.
   Re-formatting is allowed ONLY for:
     - dates (2019-05-01 -> 05/01/2019)
     - numbers (120000 -> 120,000)
     - splitting a stored value into its parts (a one-line address -> city)
     - joining a stored list (skills -> "Go, Python, SQL")
   Nothing else. If you would have to write a new word to fill a field, output null.
2. If there is no clear, confident match for a field, output null. A null is a
   correct answer. A plausible guess is a wrong answer.
3. Never invent: employment dates, salaries, reasons for leaving, cover letters,
   "why do you want to work here", availability, references, or any explanation.
   These fields get null unless a saved answer covers them verbatim.
4. For a field with an "options" list, output EXACTLY one of the given option
   values (copy the string), or null. Never output text outside that list.
   Only pick an option when the user's data clearly supports it.
5. Do not fill a field just because it is required. Requiredness is not evidence.
6. If two stored values could both fit a field, pick the one whose label matches
   the field's label most directly. If neither is a clear fit, output null.
7. Leave a field null when it asks for something the user did not store, even if
   you could derive it from general knowledge (e.g. do not derive a country from
   a city, or a full name from an email address).

OUTPUT: a JSON object whose keys are the given field ids and whose values are
strings or null. Include every field id exactly once. No commentary.`;

export const RESUME_SYSTEM_PROMPT = `You extract structured data from the plain text of a resume.

HARD RULES:
1. Copy values from the resume text. Do not invent, embellish, translate or
   complete anything. If the resume does not state something, use "" (empty) or
   omit the entry.
2. Never guess an email, phone number, date, GPA, employer or degree. Missing is
   correct; invented is a failure.
3. Keep dates in the form the resume used, or YYYY-MM if it is unambiguous.
4. skills: only list skills the resume names explicitly. Do not add adjacent or
   implied technologies.
5. Descriptions: copy or lightly condense the resume's own bullet points. Do not
   add achievements, metrics, or claims that are not written down.

OUTPUT: JSON matching the given schema. No commentary.`;

function compactField(field: FieldDescriptor) {
  const out: Record<string, unknown> = { id: field.id, kind: field.kind };
  if (field.inputType && field.inputType !== 'text') out.inputType = field.inputType;
  if (field.label) out.label = field.label;
  if (field.ariaLabel && field.ariaLabel !== field.label) out.ariaLabel = field.ariaLabel;
  if (field.placeholder) out.placeholder = field.placeholder;
  if (field.name) out.name = field.name;
  if (field.domId && field.domId !== field.name) out.domId = field.domId;
  if (field.nearbyText) out.nearbyText = field.nearbyText;
  if (field.required) out.required = true;
  if (field.maxLength && field.maxLength < 1000) out.maxLength = field.maxLength;
  if (field.multiple) out.multiple = true;
  if (field.options?.length) {
    out.options = field.options.map((o) => (o.label === o.value ? o.value : `${o.value} :: ${o.label}`));
  }
  return out;
}

export function buildMatchPrompt(args: {
  profile: Profile;
  answers: SavedAnswer[];
  fields: FieldDescriptor[];
  pageTitle: string;
  pageUrl: string;
}): string {
  const facts = profileFacts(args.profile).map((f) => ({
    label: f.label,
    value: f.value,
  }));

  const saved = args.answers.map((a) => ({ question: a.question, answer: a.answer }));

  return [
    '# USER DATA (the ONLY values you may output)',
    '',
    '## Profile facts',
    JSON.stringify(facts, null, 1),
    '',
    '## Saved answers from previous applications',
    saved.length ? JSON.stringify(saved, null, 1) : '(none)',
    '',
    '# PAGE',
    JSON.stringify({ title: args.pageTitle, url: args.pageUrl }),
    '',
    '# FORM FIELDS',
    JSON.stringify(args.fields.map(compactField), null, 1),
    '',
    `Return one entry for each of the ${args.fields.length} field ids above.`,
    'Any field you cannot fill from USER DATA must be null.',
  ].join('\n');
}

/** Explicit per-field schema so every provider can enforce the shape natively. */
export function buildMatchSchema(fields: FieldDescriptor[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    properties[field.id] = {
      type: ['string', 'null'],
      description: field.label || field.name || field.placeholder || field.id,
    };
  }
  return {
    type: 'object',
    properties: {
      fields: {
        type: 'object',
        description: 'Map of field id to the stored value that belongs there, or null.',
        properties,
        required: fields.map((f) => f.id),
        additionalProperties: false,
      },
    },
    required: ['fields'],
    additionalProperties: false,
  };
}

export function buildResumePrompt(text: string): string {
  const clipped = text.length > 60_000 ? `${text.slice(0, 60_000)}\n...[truncated]` : text;
  return ['# RESUME TEXT', '', clipped].join('\n');
}

export const RESUME_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    personal: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        middleName: { type: 'string' },
        lastName: { type: 'string' },
        preferredName: { type: 'string' },
        pronouns: { type: 'string' },
        dateOfBirth: { type: 'string' },
        nationality: { type: 'string' },
      },
      required: ['firstName', 'lastName'],
    },
    contact: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        phone: { type: 'string' },
        alternateEmail: { type: 'string' },
      },
    },
    address: {
      type: 'object',
      properties: {
        line1: { type: 'string' },
        line2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          title: { type: 'string' },
          location: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          current: { type: 'boolean' },
          description: { type: 'string' },
        },
        required: ['company', 'title'],
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          school: { type: 'string' },
          degree: { type: 'string' },
          fieldOfStudy: { type: 'string' },
          location: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          gpa: { type: 'string' },
        },
        required: ['school'],
      },
    },
    skills: { type: 'array', items: { type: 'string' } },
    links: {
      type: 'object',
      properties: {
        linkedin: { type: 'string' },
        github: { type: 'string' },
        portfolio: { type: 'string' },
        website: { type: 'string' },
        twitter: { type: 'string' },
      },
    },
  },
  required: ['personal', 'contact', 'experience', 'education', 'skills'],
};
