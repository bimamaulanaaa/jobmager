import { describe, expect, it } from 'vitest';
import { validateMatches } from '../validator';
import { emptyProfile, type Profile, type SavedAnswer } from '@/types/profile';
import type { FieldDescriptor } from '@/types/field';

function profileFixture(): Profile {
  const p = emptyProfile('Test');
  p.personal.firstName = 'Ada';
  p.personal.lastName = 'Lovelace';
  p.contact.email = 'ada@example.com';
  p.contact.phone = '+44 20 7946 0958';
  p.address.line1 = '12 Analytical Way';
  p.address.city = 'London';
  p.address.country = 'United Kingdom';
  p.address.postalCode = 'EC1A 1BB';
  p.skills = ['Go', 'Python', 'SQL'];
  p.salary.amount = '120000';
  p.salary.currency = 'GBP';
  p.workAuthorization.requiresSponsorship = 'No';
  p.experience = [
    {
      id: 'e1', company: 'Difference Engine Ltd', title: 'Staff Engineer', location: 'London',
      startDate: '2019-05', endDate: '', current: true, description: 'Built compilers.',
    },
  ];
  p.customFields = [
    { id: 'c1', label: 'Notice period', value: '2 months', type: 'text', order: 0 },
    { id: 'c2', label: 'T-shirt size', value: 'M', type: 'text', order: 1 },
  ];
  return p;
}

const answers: SavedAnswer[] = [
  {
    id: 'a1',
    question: 'Why do you want to work here?',
    answer: 'I care about developer tooling and want to work on compilers.',
    origin: 'example.com', createdAt: 0, updatedAt: 0, useCount: 1,
  },
];

const text = (id: string, label: string): FieldDescriptor => ({ id, kind: 'text', label });

function run(raw: Record<string, unknown>, fields: FieldDescriptor[]) {
  return validateMatches(raw, fields, profileFixture(), answers);
}

describe('validateMatches — accepts what the user actually supplied', () => {
  it('accepts an exact profile value', () => {
    const { matches } = run({ f1: 'ada@example.com' }, [text('f1', 'Email')]);
    expect(matches[0].value).toBe('ada@example.com');
  });

  it('accepts a composed full name', () => {
    const { matches } = run({ f1: 'Ada Lovelace' }, [text('f1', 'Full name')]);
    expect(matches[0].value).toBe('Ada Lovelace');
  });

  it('accepts a reformatted phone number', () => {
    const { matches } = run({ f1: '+442079460958' }, [text('f1', 'Phone')]);
    expect(matches[0].value).toBe('+442079460958');
  });

  it('accepts a reformatted date', () => {
    const { matches } = run({ f1: '05/2019' }, [text('f1', 'Start date')]);
    expect(matches[0].value).toBe('05/2019');
  });

  it('accepts a formatted salary figure', () => {
    const { matches } = run({ f1: '120,000' }, [text('f1', 'Expected salary')]);
    expect(matches[0].value).toBe('120,000');
  });

  it('accepts a joined skill list and a subset of it', () => {
    const joined = run({ f1: 'Go, Python, SQL' }, [text('f1', 'Skills')]);
    expect(joined.matches[0].value).toBe('Go, Python, SQL');
    const subset = run({ f1: 'Go, SQL' }, [text('f1', 'Skills')]);
    expect(subset.matches[0].value).toBe('Go, SQL');
  });

  it('accepts a custom field value', () => {
    const { matches } = run({ f1: '2 months' }, [text('f1', 'Notice period')]);
    expect(matches[0].value).toBe('2 months');
  });

  it('accepts a saved answer verbatim', () => {
    const { matches } = run(
      { f1: 'I care about developer tooling and want to work on compilers.' },
      [{ id: 'f1', kind: 'textarea', label: 'Why do you want to work here?' }],
    );
    expect(matches[0].value).not.toBeNull();
  });
});

describe('validateMatches — rejects anything invented', () => {
  it('rejects a plausible but unstored fact', () => {
    const { matches, rejections } = run({ f1: 'ada.lovelace@gmail.com' }, [text('f1', 'Email')]);
    expect(matches[0].value).toBeNull();
    expect(rejections).toHaveLength(1);
  });

  it('rejects a generated cover letter', () => {
    const { matches } = run(
      { f1: 'I am excited to apply for this role because I thrive in fast-paced teams.' },
      [{ id: 'f1', kind: 'textarea', label: 'Cover letter' }],
    );
    expect(matches[0].value).toBeNull();
  });

  it('rejects a real value padded with new words', () => {
    const { matches } = run({ f1: 'Ada Lovelace, Senior Staff Engineer at Google' }, [
      text('f1', 'Headline'),
    ]);
    expect(matches[0].value).toBeNull();
  });

  it('rejects a country inferred from a city', () => {
    const p = profileFixture();
    p.address.country = '';
    const { matches } = validateMatches({ f1: 'England' }, [text('f1', 'Country')], p, []);
    expect(matches[0].value).toBeNull();
  });

  it('rejects a value invented for a required field', () => {
    const { matches } = run({ f1: 'Immediately' }, [
      { id: 'f1', kind: 'text', label: 'Availability', required: true },
    ]);
    expect(matches[0].value).toBeNull();
  });

  it('rejects a fragment that is not a delimited part of a stored value', () => {
    // "LinkedIn" appears inside the stored LinkedIn URL, but as an answer to
    // "how did you hear about this role" it is an invented claim.
    const p = profileFixture();
    p.links.linkedin = 'https://linkedin.com/in/adalovelace';
    const { matches } = validateMatches(
      { f1: 'LinkedIn' },
      [text('f1', 'How did you hear about this role?')],
      p,
      [],
    );
    expect(matches[0].value).toBeNull();
  });

  it('accepts a city split out of a one-line address', () => {
    const p = profileFixture();
    p.address.line1 = '12 Analytical Way, London, EC1A 1BB';
    p.address.city = '';
    const { matches } = validateMatches({ f1: 'London' }, [text('f1', 'City')], p, []);
    expect(matches[0].value).toBe('London');
  });

  it('rejects a date completed with a day the user never gave', () => {
    // The profile stores 2019-05. Turning that into 2019-05-01 asserts a day.
    const { matches } = run({ f1: '2019-05-01' }, [text('f1', 'Start date')]);
    expect(matches[0].value).toBeNull();
  });

  it('rejects non-string values', () => {
    const { matches } = run({ f1: 42 }, [text('f1', 'Years of experience')]);
    expect(matches[0].value).toBeNull();
  });

  it('returns null for fields the model omitted', () => {
    const { matches } = run({}, [text('f1', 'Email')]);
    expect(matches[0].value).toBeNull();
  });
});

describe('validateMatches — agreements stay with the user', () => {
  const consent = (label: string): FieldDescriptor => ({
    id: 'f1', kind: 'checkbox', label,
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  });

  it.each([
    'I agree to the terms and conditions',
    'I certify the information above is accurate',
    'I consent to a background check',
    'I acknowledge the privacy policy',
    'Opt in to job alerts',
  ])('refuses to tick: %s', (label) => {
    const { matches, rejections } = run({ f1: 'yes' }, [consent(label)]);
    expect(matches[0].value).toBeNull();
    expect(rejections[0].reason).toMatch(/left for you/);
  });

  it('still answers an ordinary yes/no checkbox', () => {
    const { matches } = run({ f1: 'yes' }, [consent('Are you willing to relocate?')]);
    expect(matches[0].value).toBe('yes');
  });

  it('still fills a multi-select group whose options mention agreements', () => {
    const { matches } = run({ f1: 'Go' }, [{
      id: 'f1', kind: 'checkbox', multiple: true, label: 'Languages',
      options: [{ value: 'go', label: 'Go' }],
    }]);
    expect(matches[0].value).toBe('go');
  });
});

describe('validateMatches — option fields', () => {
  const select: FieldDescriptor = {
    id: 'f1',
    kind: 'select',
    label: 'Do you require sponsorship?',
    options: [
      { value: 'yes', label: 'Yes, I require sponsorship' },
      { value: 'no', label: 'No, I do not require sponsorship' },
    ],
  };

  it('resolves a label to its option value', () => {
    const { matches } = run({ f1: 'No, I do not require sponsorship' }, [select]);
    expect(matches[0].value).toBe('no');
  });

  it('resolves a unique prefix to its option value', () => {
    const { matches } = run({ f1: 'No' }, [select]);
    expect(matches[0].value).toBe('no');
  });

  it('rejects a value outside the option list', () => {
    const { matches, rejections } = run({ f1: 'Maybe later' }, [select]);
    expect(matches[0].value).toBeNull();
    expect(rejections[0].reason).toMatch(/options/);
  });

  it('keeps only the options that exist in a multi-select', () => {
    const multi: FieldDescriptor = {
      id: 'f1', kind: 'checkbox', multiple: true, label: 'Languages',
      options: [
        { value: 'go', label: 'Go' },
        { value: 'py', label: 'Python' },
      ],
    };
    const { matches } = run({ f1: 'Go, Python, Fortran' }, [multi]);
    expect(matches[0].value).toBe('go,py');
  });
});
