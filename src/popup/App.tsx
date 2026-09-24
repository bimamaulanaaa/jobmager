import { useEffect, useState } from 'react';
import { getActiveProfile, getProfiles, getSettings, saveSettings } from '@/storage';
import type { Profile } from '@/types/profile';
import type { Settings } from '@/types/settings';
import type { AutofillStats } from '@/types/field';
import { Banner, Spinner } from '@/ui/components';

type Phase = 'loading' | 'idle' | 'running' | 'done' | 'error';

interface FrameResult {
  ok: boolean;
  stats?: AutofillStats;
  error?: string;
  code?: string;
}

function openOptions(hash = '') {
  const url = chrome.runtime.getURL(`src/options/index.html${hash}`);
  chrome.tabs.create({ url });
  window.close();
}

/**
 * Injects the content script into every frame of the active tab and collects a
 * result from each. Per-frame injection is what makes iframe-hosted forms work.
 */
async function autofillActiveTab(): Promise<{ stats: AutofillStats; errors: FrameResult[] }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');
  if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url ?? '')) {
    throw new Error('Jobmager cannot run on browser internal pages. Open the application form first.');
  }

  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ['content.js'],
  });

  const frameIds = injected.map((r) => r.frameId).filter((id): id is number => id !== undefined);
  const targets = frameIds.length ? frameIds : [0];

  const results = await Promise.all(
    targets.map(async (frameId): Promise<FrameResult> => {
      try {
        return (await chrome.tabs.sendMessage(tab.id!, { type: 'AUTOFILL' }, { frameId })) as FrameResult;
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const stats: AutofillStats = { total: 0, filled: 0, empty: 0, rejected: 0 };
  for (const result of results) {
    if (!result?.ok || !result.stats) continue;
    stats.total += result.stats.total;
    stats.filled += result.stats.filled;
    stats.empty += result.stats.empty;
    stats.rejected += result.stats.rejected;
  }

  // Only surface a failure when nothing anywhere in the tab worked.
  const errors = stats.total === 0 ? results.filter((r) => !r?.ok) : [];
  return { stats, errors };
}

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<AutofillStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const [s, p, all] = await Promise.all([getSettings(), getActiveProfile(), getProfiles()]);
      setSettings(s);
      setProfile(p);
      setProfiles(all);
      setPhase('idle');
    })();
  }, []);

  const needsProfile = !profile;
  const needsKey = !settings?.apiKey;

  async function onAutofill() {
    setPhase('running');
    setError('');
    setStats(null);
    try {
      const result = await autofillActiveTab();
      if (result.stats.total === 0) {
        const first = result.errors[0];
        if (first?.code === 'NO_KEY' || first?.code === 'NO_PROFILE') {
          setError(first.error ?? 'Setup incomplete.');
        } else {
          setError(first?.error ?? 'No fillable fields found on this page.');
        }
        setPhase('error');
        return;
      }
      setStats(result.stats);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  async function onSwitchProfile(id: string) {
    const next = await saveSettings({ activeProfileId: id });
    setSettings(next);
    setProfile(profiles.find((p) => p.id === id) ?? null);
  }

  if (phase === 'loading') {
    return (
      <div className="popup">
        <div className="row gap-8 muted"><Spinner /> Loading…</div>
      </div>
    );
  }

  return (
    <div className="popup">
      <header className="popup-head">
        <div className="brand">
          <span className="brand-mark">J</span>
          Jobmager
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => openOptions()}>
          Settings
        </button>
      </header>

      {needsProfile ? (
        <>
          <Banner kind="info">Create a profile to get started. It takes one field.</Banner>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => openOptions()}>
            Set up Jobmager
          </button>
        </>
      ) : (
        <>
          {profiles.length > 1 ? (
            <label className="field">
              <span className="label">Profile</span>
              <select value={profile.id} onChange={(e) => void onSwitchProfile(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="row gap-8">
              <span className="pill"><span className="dot dot-ok" />{profile.name}</span>
              <span className="faint">{settings?.model}</span>
            </div>
          )}

          {needsKey ? (
            <Banner kind="error">
              No API key. <a href="#" onClick={(e) => { e.preventDefault(); openOptions('#settings'); }}>
                Add one in Settings
              </a> before autofilling.
            </Banner>
          ) : null}

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => void onAutofill()}
            disabled={phase === 'running' || needsKey}
          >
            {phase === 'running' ? (
              <span className="row gap-8" style={{ justifyContent: 'center' }}>
                <Spinner /> Reading the form…
              </span>
            ) : (
              'Autofill this page'
            )}
          </button>

          {phase === 'error' ? <Banner kind="error">{error}</Banner> : null}

          {phase === 'done' && stats ? (
            <>
              <div className="stat-row">
                <div className="stat stat-filled"><b>{stats.filled}</b><span>filled</span></div>
                <div className="stat stat-empty"><b>{stats.empty}</b><span>left empty</span></div>
                <div className="stat"><b>{stats.total}</b><span>fields seen</span></div>
              </div>
              {stats.rejected > 0 ? (
                <Banner kind="warn">
                  {stats.rejected} proposed {stats.rejected === 1 ? 'value was' : 'values were'} dropped
                  for not matching your profile. Those fields are yellow on the page.
                </Banner>
              ) : null}
              {stats.empty > 0 ? (
                <p className="faint">
                  Yellow fields need you. Type an answer and Jobmager will offer to remember it.
                </p>
              ) : null}
              <p className="faint">Multi-step form? Press Autofill again on the next step.</p>
            </>
          ) : null}
        </>
      )}

      <hr className="divider" />
      <div className="row-between">
        <button className="btn btn-ghost btn-sm" onClick={() => openOptions('#profile')}>
          Edit profile
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => openOptions('#answers')}>
          Saved answers
        </button>
      </div>
    </div>
  );
}
