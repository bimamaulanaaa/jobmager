import type { Profile } from '@/types/profile';
import { emptyEducation, emptyExperience } from '@/types/profile';

/**
 * Extracts plain text from a PDF in the options page. The worker ships with the
 * extension — nothing is uploaded and no CDN is contacted.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

  const buffer = await file.arrayBuffer();
  // No scripting, no external fetches: a resume only needs its text layer.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableAutoFetch: true,
  } as Parameters<typeof pdfjs.getDocument>[0]);
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY: number | null = null;
    const parts: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        parts.push(line.trim());
        line = '';
      }
      line += item.str + (item.hasEOL ? ' ' : '');
      lastY = y;
    }
    if (line.trim()) parts.push(line.trim());
    pages.push(parts.filter(Boolean).join('\n'));
  }
  await loadingTask.destroy();

  const text = pages.join('\n\n').replace(/[ \t]+/g, ' ').trim();
  if (!text) {
    throw new Error(
      'No text found in this PDF. It may be a scan — try a text-based PDF or fill the form manually.',
    );
  }
  return text;
}

type ResumeDraft = Partial<{
  personal: Partial<Profile['personal']>;
  contact: Partial<Profile['contact']>;
  address: Partial<Profile['address']>;
  experience: Partial<Profile['experience'][number]>[];
  education: Partial<Profile['education'][number]>[];
  skills: string[];
  links: Partial<Profile['links']>;
}>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Folds an AI-extracted draft onto an existing profile. The user reviews the
 * result before anything is stored, so this only shapes data — it never saves.
 */
export function applyResumeDraft(base: Profile, draft: ResumeDraft): Profile {
  const merged: Profile = structuredClone(base);

  for (const key of Object.keys(merged.personal) as (keyof Profile['personal'])[]) {
    const value = str(draft.personal?.[key]);
    if (value) merged.personal[key] = value;
  }
  for (const key of Object.keys(merged.contact) as (keyof Profile['contact'])[]) {
    const value = str(draft.contact?.[key]);
    if (value) merged.contact[key] = value;
  }
  for (const key of Object.keys(merged.address) as (keyof Profile['address'])[]) {
    const value = str(draft.address?.[key]);
    if (value) merged.address[key] = value;
  }
  for (const key of Object.keys(merged.links) as (keyof Profile['links'])[]) {
    const value = str(draft.links?.[key]);
    if (value) merged.links[key] = value;
  }

  if (Array.isArray(draft.experience) && draft.experience.length) {
    merged.experience = draft.experience.map((job) => ({
      ...emptyExperience(),
      company: str(job.company),
      title: str(job.title),
      location: str(job.location),
      startDate: str(job.startDate),
      endDate: str(job.endDate),
      current: job.current === true,
      description: str(job.description),
    }));
  }

  if (Array.isArray(draft.education) && draft.education.length) {
    merged.education = draft.education.map((edu) => ({
      ...emptyEducation(),
      school: str(edu.school),
      degree: str(edu.degree),
      fieldOfStudy: str(edu.fieldOfStudy),
      location: str(edu.location),
      startDate: str(edu.startDate),
      endDate: str(edu.endDate),
      gpa: str(edu.gpa),
    }));
  }

  if (Array.isArray(draft.skills) && draft.skills.length) {
    const seen = new Set<string>();
    merged.skills = draft.skills
      .map(str)
      .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  }

  return merged;
}
