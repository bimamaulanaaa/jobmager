import { describe, expect, it, vi, beforeEach } from 'vitest';
import { matchFields } from '../ai-matcher';
import { emptyProfile, type Profile } from '@/types/profile';
import type { FieldDescriptor } from '@/types/field';
import { PROVIDERS } from '@/providers';

/**
 * Exercises the whole matcher path — prompt build, provider call, JSON parse,
 * validation — against a stubbed provider. This is the path that otherwise
 * only runs when a real API key is present.
 */

function profileFixture(): Profile {
  const p = emptyProfile('Main');
  p.personal.firstName = 'Bima';
  p.personal.lastName = 'Maulana';
  p.contact.email = 'bima@example.com';
  p.skills = ['Go', 'Python'];
  return p;
}

const fields: FieldDescriptor[] = [
  { id: 'f1', kind: 'text', label: 'First name' },
  { id: 'f2', kind: 'text', label: 'Email' },
  { id: 'f3', kind: 'textarea', label: 'Why do you want this job?' },
  {
    id: 'f4', kind: 'select', label: 'Country',
    options: [{ value: 'id', label: 'Indonesia' }, { value: 'us', label: 'United States' }],
  },
];

function stubProvider(reply: string) {
  return vi.spyOn(PROVIDERS.anthropic, 'complete').mockResolvedValue(reply);
}

async function run(reply: string) {
  return matchFields({
    providerId: 'anthropic',
    model: 'claude-opus-5',
    apiKey: 'test-key',
    profile: profileFixture(),
    answers: [],
    fields,
    pageTitle: 'Apply',
    pageUrl: 'https://example.com/apply',
  }).finally(() => vi.restoreAllMocks());
}

beforeEach(() => vi.restoreAllMocks());

describe('matchFields response handling', () => {
  it('accepts the documented { fields: {...} } envelope', async () => {
    stubProvider(JSON.stringify({
      fields: { f1: 'Bima', f2: 'bima@example.com', f3: null, f4: 'Indonesia' },
    }));
    const { matches } = await run('');
    expect(matches.map((m) => m.value)).toEqual(['Bima', 'bima@example.com', null, 'id']);
  });

  it('accepts a bare object without the envelope', async () => {
    stubProvider(JSON.stringify({ f1: 'Bima', f2: null, f3: null, f4: null }));
    const { matches } = await run('');
    expect(matches[0].value).toBe('Bima');
  });

  it('recovers JSON wrapped in prose or code fences', async () => {
    stubProvider('Here you go:\n```json\n{"fields":{"f1":"Bima","f2":null,"f3":null,"f4":null}}\n```');
    const { matches } = await run('');
    expect(matches[0].value).toBe('Bima');
  });

  it('drops invented values even when the model returns valid JSON', async () => {
    stubProvider(JSON.stringify({
      fields: {
        f1: 'Bima',
        f2: 'bima.maulana@gmail.com',
        f3: 'I am passionate about your mission and thrive in fast-paced teams.',
        f4: 'Singapore',
      },
    }));
    const { matches, rejections } = await run('');
    expect(matches.map((m) => m.value)).toEqual(['Bima', null, null, null]);
    expect(rejections).toHaveLength(3);
  });

  it('fills every field id with null when the model omits them', async () => {
    stubProvider(JSON.stringify({ fields: {} }));
    const { matches } = await run('');
    expect(matches).toHaveLength(4);
    expect(matches.every((m) => m.value === null)).toBe(true);
  });

  it('raises a readable error when the response is not JSON', async () => {
    stubProvider('I am unable to help with that request.');
    await expect(run('')).rejects.toThrow(/not valid JSON|Could not read/i);
  });

  it('makes no provider call when the page has no fields', async () => {
    const spy = stubProvider('{}');
    const result = await matchFields({
      providerId: 'anthropic', model: 'claude-opus-5', apiKey: 'k',
      profile: profileFixture(), answers: [], fields: [],
      pageTitle: '', pageUrl: '',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.matches).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe('the request sent to the provider', () => {
  it('carries the profile, a schema keyed by field id, and forced JSON output', async () => {
    const spy = stubProvider(JSON.stringify({ fields: {} }));
    await run('');
    const req = spy.mock.calls[0][0];

    expect(req.user).toContain('bima@example.com');
    expect(req.user).toContain('Why do you want this job?');
    expect(req.system).toMatch(/matcher, not a writer/i);
    expect(req.schemaName).toBe('fill_form_fields');

    const props = (req.schema as { properties: { fields: { properties: object } } })
      .properties.fields.properties;
    expect(Object.keys(props)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('never sends the page URL as a value the model may copy', async () => {
    const spy = stubProvider(JSON.stringify({ fields: {} }));
    await run('');
    // The URL is context, so it appears — but under PAGE, not USER DATA.
    const req = spy.mock.calls[0][0];
    const userData = req.user.split('# PAGE')[0];
    expect(userData).not.toContain('example.com/apply');
  });
});
