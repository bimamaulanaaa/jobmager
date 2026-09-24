import { useState } from 'react';
import { emptyProfile } from '@/types/profile';
import { saveSettings, upsertProfile } from '@/storage';
import { Banner } from '@/ui/components';

/** Step one asks for a profile name and nothing else, by design. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the profile a name.');
      return;
    }
    setBusy(true);
    const profile = emptyProfile(trimmed);
    await upsertProfile(profile);
    await saveSettings({ activeProfileId: profile.id, onboarded: true });
    setBusy(false);
    onDone();
  }

  return (
    <div className="onboard stack gap-24">
      <div className="brand">
        <span className="brand-mark">J</span>
        <h1>Welcome to Jobmager</h1>
      </div>

      <p className="muted">
        Jobmager fills job application forms with data you have stored — and only with
        that data. Start by naming a profile. You can keep several: one per kind of role.
      </p>

      <div className="card stack gap-16">
        <label className="field">
          <span className="label">Profile name</span>
          <input
            autoFocus
            value={name}
            placeholder="Main"
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
          />
          <span className="hint">For example: “Main”, “Backend roles”, “Contract work”.</span>
        </label>

        {error ? <Banner kind="error">{error}</Banner> : null}

        <button className="btn btn-primary btn-lg" onClick={() => void create()} disabled={busy}>
          Create profile
        </button>
      </div>

      <p className="faint">
        Next you will connect an AI provider and add your details — by uploading a resume
        or filling the form yourself.
      </p>
    </div>
  );
}
