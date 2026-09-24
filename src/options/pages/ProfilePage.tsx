import { useEffect, useState } from 'react';
import {
  emptyEducation, emptyExperience, emptyProfile,
  type Education, type Profile, type WorkExperience,
} from '@/types/profile';
import { deleteProfile, saveSettings, upsertProfile } from '@/storage';
import { Banner, Card, TextArea, TextField } from '@/ui/components';
import { CustomFields } from './CustomFields';
import { ResumeImport } from './ResumeImport';

type Section = keyof Pick<Profile, 'personal' | 'contact' | 'address' | 'links' | 'workAuthorization' | 'salary'>;

export function ProfilePage({
  profiles, activeId, onProfilesChange, onActiveChange,
}: {
  profiles: Profile[];
  activeId: string | null;
  onProfilesChange: (p: Profile[]) => void;
  onActiveChange: (id: string) => void;
}) {
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;
  const [draft, setDraft] = useState<Profile | null>(active);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(active);
    setSaved(false);
  }, [active?.id, profiles.length]);

  if (!draft) return <Banner kind="info">No profile yet.</Banner>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(active);

  function set<S extends Section>(section: S, key: keyof Profile[S], value: string) {
    setDraft((d) => (d ? { ...d, [section]: { ...d[section], [key]: value } } : d));
    setSaved(false);
  }

  async function save() {
    if (!draft) return;
    const next = await upsertProfile(draft);
    onProfilesChange(next);
    setSaved(true);
  }

  async function addProfile() {
    const name = prompt('Name for the new profile');
    if (!name?.trim()) return;
    const profile = emptyProfile(name.trim());
    const next = await upsertProfile(profile);
    onProfilesChange(next);
    await saveSettings({ activeProfileId: profile.id });
    onActiveChange(profile.id);
  }

  async function removeProfile() {
    if (!draft) return;
    if (!confirm(`Delete the profile “${draft.name}”? This cannot be undone.`)) return;
    const next = await deleteProfile(draft.id);
    onProfilesChange(next);
    if (next[0]) onActiveChange(next[0].id);
  }

  const patchList = <T extends { id: string }>(
    list: T[], id: string, patch: Partial<T>,
  ): T[] => list.map((item) => (item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="stack gap-24">
      <Card>
        <div className="row-between">
          <div className="row gap-8 grow">
            <label className="field grow" style={{ maxWidth: 280 }}>
              <span className="label">Active profile</span>
              <select value={draft.id} onChange={(e) => onActiveChange(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="field grow" style={{ maxWidth: 280 }}>
              <span className="label">Rename</span>
              <input
                value={draft.name}
                onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setSaved(false); }}
              />
            </label>
          </div>
          <div className="row gap-8">
            <button className="btn btn-sm" onClick={() => void addProfile()}>New profile</button>
            <button className="btn btn-sm btn-danger" onClick={() => void removeProfile()}>Delete</button>
          </div>
        </div>
      </Card>

      <ResumeImport profile={draft} onApply={(next) => { setDraft(next); setSaved(false); }} />

      <Card title="Personal">
        <div className="grid grid-3">
          <TextField label="First name" value={draft.personal.firstName} onChange={(v) => set('personal', 'firstName', v)} />
          <TextField label="Middle name" value={draft.personal.middleName} onChange={(v) => set('personal', 'middleName', v)} />
          <TextField label="Last name" value={draft.personal.lastName} onChange={(v) => set('personal', 'lastName', v)} />
          <TextField label="Preferred name" value={draft.personal.preferredName} onChange={(v) => set('personal', 'preferredName', v)} />
          <TextField label="Pronouns" value={draft.personal.pronouns} onChange={(v) => set('personal', 'pronouns', v)} />
          <TextField label="Date of birth" type="date" value={draft.personal.dateOfBirth} onChange={(v) => set('personal', 'dateOfBirth', v)} />
          <TextField label="Nationality" value={draft.personal.nationality} onChange={(v) => set('personal', 'nationality', v)} />
        </div>
        <hr className="divider" />
        <h3>Voluntary disclosure</h3>
        <p className="faint">
          Only used when a form asks. Leave blank to have Jobmager skip these questions.
        </p>
        <div className="grid grid-2">
          <TextField label="Gender" value={draft.personal.gender} onChange={(v) => set('personal', 'gender', v)} />
          <TextField label="Ethnicity / race" value={draft.personal.ethnicity} onChange={(v) => set('personal', 'ethnicity', v)} />
          <TextField label="Veteran status" value={draft.personal.veteranStatus} onChange={(v) => set('personal', 'veteranStatus', v)} />
          <TextField label="Disability status" value={draft.personal.disabilityStatus} onChange={(v) => set('personal', 'disabilityStatus', v)} />
        </div>
      </Card>

      <Card title="Contact">
        <div className="grid grid-3">
          <TextField label="Email" type="email" value={draft.contact.email} onChange={(v) => set('contact', 'email', v)} />
          <TextField label="Phone" type="tel" value={draft.contact.phone} onChange={(v) => set('contact', 'phone', v)} />
          <TextField label="Alternate email" type="email" value={draft.contact.alternateEmail} onChange={(v) => set('contact', 'alternateEmail', v)} />
        </div>
      </Card>

      <Card title="Address">
        <div className="grid grid-2">
          <TextField label="Address line 1" value={draft.address.line1} onChange={(v) => set('address', 'line1', v)} />
          <TextField label="Address line 2" value={draft.address.line2} onChange={(v) => set('address', 'line2', v)} />
        </div>
        <div className="grid grid-2">
          <TextField label="City" value={draft.address.city} onChange={(v) => set('address', 'city', v)} />
          <TextField label="State / province" value={draft.address.state} onChange={(v) => set('address', 'state', v)} />
          <TextField label="Postal code" value={draft.address.postalCode} onChange={(v) => set('address', 'postalCode', v)} />
          <TextField label="Country" value={draft.address.country} onChange={(v) => set('address', 'country', v)} />
        </div>
      </Card>

      <Card
        title="Work experience"
        action={
          <button
            className="btn btn-sm"
            onClick={() => setDraft({ ...draft, experience: [...draft.experience, emptyExperience()] })}
          >Add role</button>
        }
      >
        {draft.experience.length === 0 ? (
          <p className="faint">No roles yet. Add one, or import a resume above.</p>
        ) : (
          draft.experience.map((job: WorkExperience, i) => (
            <div key={job.id} className="list-item">
              <div className="entry-head">
                <span className="entry-title">{job.title || job.company || `Role ${i + 1}`}</span>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  onClick={() => setDraft({ ...draft, experience: draft.experience.filter((e) => e.id !== job.id) })}
                >Remove</button>
              </div>
              <div className="grid grid-2">
                <TextField label="Job title" value={job.title} onChange={(v) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { title: v }) })} />
                <TextField label="Company" value={job.company} onChange={(v) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { company: v }) })} />
              </div>
              <div className="grid grid-3">
                <TextField label="Location" value={job.location} onChange={(v) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { location: v }) })} />
                <TextField label="Start" placeholder="2019-05" value={job.startDate} onChange={(v) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { startDate: v }) })} />
                <TextField label="End" placeholder="2023-08" disabled={job.current} value={job.current ? '' : job.endDate} onChange={(v) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { endDate: v }) })} />
              </div>
              <label className="row gap-8" style={{ fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={job.current}
                  onChange={(e) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { current: e.target.checked }) })}
                />
                I work here now
              </label>
              <TextArea label="Description" value={job.description} onChange={(v) => setDraft({ ...draft, experience: patchList(draft.experience, job.id, { description: v }) })} />
            </div>
          ))
        )}
      </Card>

      <Card
        title="Education"
        action={
          <button
            className="btn btn-sm"
            onClick={() => setDraft({ ...draft, education: [...draft.education, emptyEducation()] })}
          >Add school</button>
        }
      >
        {draft.education.length === 0 ? (
          <p className="faint">No education entries yet.</p>
        ) : (
          draft.education.map((edu: Education, i) => (
            <div key={edu.id} className="list-item">
              <div className="entry-head">
                <span className="entry-title">{edu.school || `School ${i + 1}`}</span>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  onClick={() => setDraft({ ...draft, education: draft.education.filter((e) => e.id !== edu.id) })}
                >Remove</button>
              </div>
              <div className="grid grid-2">
                <TextField label="School" value={edu.school} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { school: v }) })} />
                <TextField label="Degree" value={edu.degree} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { degree: v }) })} />
              </div>
              <div className="grid grid-3">
                <TextField label="Field of study" value={edu.fieldOfStudy} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { fieldOfStudy: v }) })} />
                <TextField label="Start" value={edu.startDate} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { startDate: v }) })} />
                <TextField label="End" value={edu.endDate} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { endDate: v }) })} />
              </div>
              <div className="grid grid-2">
                <TextField label="Location" value={edu.location} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { location: v }) })} />
                <TextField label="GPA" value={edu.gpa} onChange={(v) => setDraft({ ...draft, education: patchList(draft.education, edu.id, { gpa: v }) })} />
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title="Skills">
        <TextArea
          label="Skills"
          hint="One per line, or comma separated."
          value={draft.skills.join('\n')}
          onChange={(v) =>
            setDraft({ ...draft, skills: v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) })
          }
        />
      </Card>

      <Card title="Links">
        <div className="grid grid-2">
          <TextField label="LinkedIn" type="url" value={draft.links.linkedin} onChange={(v) => set('links', 'linkedin', v)} />
          <TextField label="GitHub" type="url" value={draft.links.github} onChange={(v) => set('links', 'github', v)} />
          <TextField label="Portfolio" type="url" value={draft.links.portfolio} onChange={(v) => set('links', 'portfolio', v)} />
          <TextField label="Website" type="url" value={draft.links.website} onChange={(v) => set('links', 'website', v)} />
          <TextField label="Twitter / X" type="url" value={draft.links.twitter} onChange={(v) => set('links', 'twitter', v)} />
        </div>
      </Card>

      <Card title="Work authorization">
        <div className="grid grid-2">
          <TextField label="Authorized to work" hint="e.g. “Yes, authorized to work in the UK”" value={draft.workAuthorization.authorizedToWork} onChange={(v) => set('workAuthorization', 'authorizedToWork', v)} />
          <TextField label="Requires sponsorship" hint="e.g. “No”" value={draft.workAuthorization.requiresSponsorship} onChange={(v) => set('workAuthorization', 'requiresSponsorship', v)} />
          <TextField label="Visa status" value={draft.workAuthorization.visaStatus} onChange={(v) => set('workAuthorization', 'visaStatus', v)} />
          <TextField label="Countries" value={draft.workAuthorization.countries} onChange={(v) => set('workAuthorization', 'countries', v)} />
        </div>
      </Card>

      <Card title="Salary expectation">
        <div className="grid grid-3">
          <TextField label="Amount" value={draft.salary.amount} onChange={(v) => set('salary', 'amount', v)} />
          <TextField label="Currency" placeholder="USD" value={draft.salary.currency} onChange={(v) => set('salary', 'currency', v)} />
          <TextField label="Period" placeholder="year" value={draft.salary.period} onChange={(v) => set('salary', 'period', v)} />
        </div>
        <TextField label="Notes" value={draft.salary.notes} onChange={(v) => set('salary', 'notes', v)} />
      </Card>

      <CustomFields profile={draft} onChange={(p) => { setDraft(p); setSaved(false); }} />

      <div className="savebar">
        <span className={saved ? 'muted' : 'faint'}>
          {saved ? 'Profile saved.' : dirty ? 'Unsaved changes.' : 'Everything saved.'}
        </span>
        <button className="btn btn-primary" onClick={() => void save()} disabled={!dirty}>
          Save profile
        </button>
      </div>
    </div>
  );
}
