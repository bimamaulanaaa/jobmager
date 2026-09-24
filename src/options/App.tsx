import { useEffect, useState } from 'react';
import { getAnswers, getProfiles, getSettings, saveSettings } from '@/storage';
import type { Profile, SavedAnswer } from '@/types/profile';
import type { Settings } from '@/types/settings';
import { Spinner } from '@/ui/components';
import { Onboarding } from './pages/Onboarding';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { AnswersPage } from './pages/AnswersPage';

type Tab = 'profile' | 'answers' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'answers', label: 'Saved answers' },
  { id: 'settings', label: 'Settings' },
];

function tabFromHash(): Tab {
  const hash = location.hash.replace('#', '');
  return TABS.some((t) => t.id === hash) ? (hash as Tab) : 'profile';
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [tab, setTab] = useState<Tab>(tabFromHash);

  async function reload() {
    const [s, p, a] = await Promise.all([getSettings(), getProfiles(), getAnswers()]);
    setSettings(s);
    setProfiles(p);
    setAnswers(a);
    setLoading(false);
  }

  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function go(next: Tab) {
    setTab(next);
    location.hash = next;
  }

  if (loading || !settings) {
    return (
      <div className="shell">
        <div className="row gap-8 muted"><Spinner /> Loading…</div>
      </div>
    );
  }

  if (!profiles.length) {
    return (
      <div className="shell">
        <Onboarding onDone={() => void reload()} />
      </div>
    );
  }

  const activeProfile =
    profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0] ?? null;

  return (
    <div className="shell">
      <header className="shell-head">
        <div className="brand">
          <span className="brand-mark">J</span>
          <div className="stack">
            <h1>Jobmager</h1>
            <span className="faint">
              {profiles.length} profile{profiles.length === 1 ? '' : 's'} · {answers.length} saved answer
              {answers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <span className="pill">
          <span className={`dot ${settings.apiKey ? 'dot-ok' : 'dot-bad'}`} />
          {settings.apiKey ? settings.model : 'No API key'}
        </span>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => go(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'profile' ? (
        <ProfilePage
          profiles={profiles}
          activeId={settings.activeProfileId}
          onProfilesChange={setProfiles}
          onActiveChange={async (id) => setSettings(await saveSettings({ activeProfileId: id }))}
        />
      ) : null}

      {tab === 'answers' ? (
        <AnswersPage
          answers={answers}
          onAnswersChange={setAnswers}
          profile={activeProfile}
          onProfileChange={(p) => setProfiles(profiles.map((x) => (x.id === p.id ? p : x)))}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsPage settings={settings} onChange={setSettings} />
      ) : null}
    </div>
  );
}
