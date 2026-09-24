/** Every value the AI is allowed to use during autofill lives in this file's shapes. */

export type CustomFieldType = 'text' | 'number' | 'date' | 'longtext';

export interface CustomField {
  id: string;
  label: string;
  value: string;
  type: CustomFieldType;
  /** Explicit ordering so the options UI can reorder without re-keying. */
  order: number;
}

export interface PersonalInfo {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  dateOfBirth: string;
  nationality: string;
  gender: string;
  ethnicity: string;
  veteranStatus: string;
  disabilityStatus: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  alternateEmail: string;
}

export interface AddressInfo {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  fieldOfStudy: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface LinksInfo {
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
  twitter: string;
}

export interface WorkAuthorization {
  /** Free text on purpose: sites phrase this a dozen different ways. */
  authorizedToWork: string;
  requiresSponsorship: string;
  visaStatus: string;
  countries: string;
}

export interface SalaryExpectation {
  amount: string;
  currency: string;
  period: string;
  notes: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  personal: PersonalInfo;
  contact: ContactInfo;
  address: AddressInfo;
  experience: WorkExperience[];
  education: Education[];
  skills: string[];
  links: LinksInfo;
  workAuthorization: WorkAuthorization;
  salary: SalaryExpectation;
  customFields: CustomField[];
}

/** A question the user answered by hand, reusable on the next application. */
export interface SavedAnswer {
  id: string;
  /** The field's label / surrounding context, used as the match key. */
  question: string;
  answer: string;
  /** Host the answer was first captured on, shown in the options UI. */
  origin: string;
  createdAt: number;
  updatedAt: number;
  useCount: number;
}

export function emptyProfile(name: string): Profile {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    personal: {
      firstName: '', middleName: '', lastName: '', preferredName: '', pronouns: '',
      dateOfBirth: '', nationality: '', gender: '', ethnicity: '',
      veteranStatus: '', disabilityStatus: '',
    },
    contact: { email: '', phone: '', alternateEmail: '' },
    address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
    experience: [],
    education: [],
    skills: [],
    links: { linkedin: '', github: '', portfolio: '', website: '', twitter: '' },
    workAuthorization: { authorizedToWork: '', requiresSponsorship: '', visaStatus: '', countries: '' },
    salary: { amount: '', currency: '', period: '', notes: '' },
    customFields: [],
  };
}

export function emptyExperience(): WorkExperience {
  return {
    id: crypto.randomUUID(), company: '', title: '', location: '',
    startDate: '', endDate: '', current: false, description: '',
  };
}

export function emptyEducation(): Education {
  return {
    id: crypto.randomUUID(), school: '', degree: '', fieldOfStudy: '',
    location: '', startDate: '', endDate: '', gpa: '',
  };
}
