import type { Profile, SavedAnswer } from '@/types/profile';

export interface Fact {
  /** Human-readable path, e.g. "experience[0].company". */
  path: string;
  label: string;
  value: string;
}

const LABELS: Record<string, string> = {
  'personal.firstName': 'First name',
  'personal.middleName': 'Middle name',
  'personal.lastName': 'Last name',
  'personal.preferredName': 'Preferred name',
  'personal.pronouns': 'Pronouns',
  'personal.dateOfBirth': 'Date of birth',
  'personal.nationality': 'Nationality',
  'personal.gender': 'Gender',
  'personal.ethnicity': 'Ethnicity / race',
  'personal.veteranStatus': 'Veteran status',
  'personal.disabilityStatus': 'Disability status',
  'contact.email': 'Email',
  'contact.phone': 'Phone',
  'contact.alternateEmail': 'Alternate email',
  'address.line1': 'Address line 1',
  'address.line2': 'Address line 2',
  'address.city': 'City',
  'address.state': 'State / province',
  'address.postalCode': 'Postal code',
  'address.country': 'Country',
  'links.linkedin': 'LinkedIn URL',
  'links.github': 'GitHub URL',
  'links.portfolio': 'Portfolio URL',
  'links.website': 'Website',
  'links.twitter': 'Twitter / X',
  'workAuthorization.authorizedToWork': 'Authorized to work',
  'workAuthorization.requiresSponsorship': 'Requires visa sponsorship',
  'workAuthorization.visaStatus': 'Visa status',
  'workAuthorization.countries': 'Countries authorized to work in',
  'salary.amount': 'Salary expectation (amount)',
  'salary.currency': 'Salary currency',
  'salary.period': 'Salary period',
  'salary.notes': 'Salary notes',
};

/**
 * Flattens a profile into labelled leaf facts. This is the single source of
 * truth for both the prompt and the validator: if a value is not here (or in
 * the derived composites below), the AI is not allowed to use it.
 */
export function profileFacts(profile: Profile): Fact[] {
  const facts: Fact[] = [];
  const push = (path: string, value: unknown, label?: string) => {
    if (typeof value !== 'string' || !value.trim()) return;
    facts.push({ path, label: label ?? LABELS[path] ?? path, value: value.trim() });
  };

  for (const section of ['personal', 'contact', 'address', 'links', 'workAuthorization', 'salary'] as const) {
    const bag = profile[section] as unknown as Record<string, string>;
    for (const key of Object.keys(bag)) push(`${section}.${key}`, bag[key]);
  }

  profile.experience.forEach((job, i) => {
    push(`experience[${i}].company`, job.company, `Experience ${i + 1} — company`);
    push(`experience[${i}].title`, job.title, `Experience ${i + 1} — job title`);
    push(`experience[${i}].location`, job.location, `Experience ${i + 1} — location`);
    push(`experience[${i}].startDate`, job.startDate, `Experience ${i + 1} — start date`);
    push(
      `experience[${i}].endDate`,
      job.current ? 'Present' : job.endDate,
      `Experience ${i + 1} — end date`,
    );
    push(`experience[${i}].description`, job.description, `Experience ${i + 1} — description`);
  });

  profile.education.forEach((edu, i) => {
    push(`education[${i}].school`, edu.school, `Education ${i + 1} — school`);
    push(`education[${i}].degree`, edu.degree, `Education ${i + 1} — degree`);
    push(`education[${i}].fieldOfStudy`, edu.fieldOfStudy, `Education ${i + 1} — field of study`);
    push(`education[${i}].location`, edu.location, `Education ${i + 1} — location`);
    push(`education[${i}].startDate`, edu.startDate, `Education ${i + 1} — start date`);
    push(`education[${i}].endDate`, edu.endDate, `Education ${i + 1} — end date`);
    push(`education[${i}].gpa`, edu.gpa, `Education ${i + 1} — GPA`);
  });

  profile.skills.filter(Boolean).forEach((skill, i) => {
    push(`skills[${i}]`, skill, 'Skill');
  });

  // Custom fields are first-class: same treatment as everything above.
  [...profile.customFields]
    .sort((a, b) => a.order - b.order)
    .forEach((field, i) => {
      push(`customFields[${i}]`, field.value, field.label || `Custom field ${i + 1}`);
    });

  return facts;
}

/**
 * Values the user never typed literally but that are unambiguously composed
 * from values they did — a full name, a one-line address, the skill list.
 * Composition is mechanical; nothing new is asserted.
 */
export function derivedValues(profile: Profile): string[] {
  const out: string[] = [];
  const { personal, address, skills, salary } = profile;

  const nameParts = [personal.firstName, personal.middleName, personal.lastName].filter(Boolean);
  if (nameParts.length > 1) {
    out.push(nameParts.join(' '));
    if (personal.firstName && personal.lastName) {
      out.push(`${personal.firstName} ${personal.lastName}`);
      out.push(`${personal.lastName}, ${personal.firstName}`);
      out.push(`${personal.lastName} ${personal.firstName}`);
    }
  }
  if (personal.preferredName && personal.lastName) {
    out.push(`${personal.preferredName} ${personal.lastName}`);
  }

  const addressParts = [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean);
  if (addressParts.length > 1) {
    out.push(addressParts.join(', '));
    out.push(addressParts.join(' '));
    if (address.city && address.state) {
      out.push(`${address.city}, ${address.state}`);
      out.push(`${address.city}, ${address.state} ${address.postalCode}`.trim());
    }
  }

  const cleanSkills = skills.filter(Boolean);
  if (cleanSkills.length) {
    out.push(cleanSkills.join(', '));
    out.push(cleanSkills.join('; '));
    out.push(cleanSkills.join('\n'));
  }

  if (salary.amount) {
    out.push(salary.amount);
    if (salary.currency) out.push(`${salary.currency} ${salary.amount}`);
    if (salary.currency) out.push(`${salary.amount} ${salary.currency}`);
    if (salary.period) out.push(`${salary.amount} per ${salary.period}`);
  }

  profile.experience.forEach((job) => {
    if (job.title && job.company) out.push(`${job.title} at ${job.company}`);
    if (job.title && job.company) out.push(`${job.title}, ${job.company}`);
  });
  profile.education.forEach((edu) => {
    if (edu.degree && edu.fieldOfStudy) out.push(`${edu.degree} in ${edu.fieldOfStudy}`);
    if (edu.degree && edu.school) out.push(`${edu.degree}, ${edu.school}`);
  });

  return out.filter(Boolean);
}

/** Everything the AI may draw on, flattened for the validator. */
export function allowedCorpus(profile: Profile, answers: SavedAnswer[]): string[] {
  return [
    ...profileFacts(profile).map((f) => f.value),
    ...derivedValues(profile),
    ...answers.map((a) => a.answer).filter(Boolean),
  ];
}
