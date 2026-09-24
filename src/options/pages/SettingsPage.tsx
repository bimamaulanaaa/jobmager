import { useState } from 'react';
import { PROVIDER_LIST, getProvider } from '@/providers';
import { saveSettings } from '@/storage';
import type { ProviderId, Settings } from '@/types/settings';
import { Banner, Card, Spinner, Toggle } from '@/ui/components';
import type { BackgroundResponse } from '@/types/messages';

type KeyState = 'unknown' | 'checking' | 'valid' | 'invalid';

export function SettingsPage({
  settings, onChange,
}: { settings: Settings; onChange: (s: Settings) => void }) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [keyState, setKeyState] = useState<KeyState>(settings.apiKey ? 'unknown' : 'unknown');
  const [message, setMessage] = useState('');
  const [reveal, setReveal] = useState(false);

  const provider = getProvider(settings.providerId);

  async function patch(next: Partial<Settings>) {
    onChange(await saveSettings(next));
  }

  async function onProviderChange(id: ProviderId) {
    const nextProvider = getProvider(id);
    setKeyState('unknown');
    setMessage('');
    await patch({ providerId: id, model: nextProvider.models[0].id });
  }

  /** Saves and verifies in one action: an unverified key is a silent failure later. */
  async function saveAndValidate() {
    const trimmed = apiKey.trim();
    setKeyState('checking');
    setMessage('');
    await patch({ apiKey: trimmed });
    if (!trimmed) {
      setKeyState('invalid');
      setMessage('Enter an API key.');
      return;
    }
    const response = (await chrome.runtime.sendMessage({
      type: 'VALIDATE_KEY',
      providerId: settings.providerId,
      model: settings.model,
      apiKey: trimmed,
    })) as BackgroundResponse;

    if (response?.ok) {
      setKeyState('valid');
      setMessage(`Key works with ${provider.label}.`);
    } else {
      setKeyState('invalid');
      setMessage(response?.error ?? 'Could not verify the key.');
    }
  }

  return (
    <div className="stack gap-24">
      <Card title="AI provider">
        <p className="muted">
          Jobmager sends your form fields and profile to this provider and nowhere else.
          The key is stored locally in this browser.
        </p>

        <div className="grid grid-2">
          <label className="field">
            <span className="label">Provider</span>
            <select
              value={settings.providerId}
              onChange={(e) => void onProviderChange(e.target.value as ProviderId)}
            >
              {PROVIDER_LIST.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">Model</span>
            <select value={settings.model} onChange={(e) => void patch({ model: e.target.value })}>
              {provider.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="label">API key</span>
          <div className="row gap-8">
            <input
              className="grow mono"
              type={reveal ? 'text' : 'password'}
              value={apiKey}
              placeholder={provider.keyHint}
              spellCheck={false}
              onChange={(e) => { setApiKey(e.target.value); setKeyState('unknown'); setMessage(''); }}
            />
            <button className="btn btn-sm" onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className="hint">
            Get one at <a href={provider.keyUrl} target="_blank" rel="noreferrer">{provider.keyUrl}</a>
          </span>
        </label>

        <div className="row gap-12">
          <button
            className="btn btn-primary"
            onClick={() => void saveAndValidate()}
            disabled={keyState === 'checking'}
          >
            {keyState === 'checking' ? (
              <span className="row gap-8"><Spinner /> Testing…</span>
            ) : (
              'Save and test key'
            )}
          </button>
          {keyState === 'valid' ? <span className="pill"><span className="dot dot-ok" />Verified</span> : null}
          {keyState === 'invalid' ? <span className="pill"><span className="dot dot-bad" />Not working</span> : null}
        </div>

        {message ? (
          <Banner kind={keyState === 'valid' ? 'ok' : 'error'}>{message}</Banner>
        ) : null}
      </Card>

      <Card title="Autofill behaviour">
        <Toggle
          label="Offer to save answers"
          hint="After autofill, ask to remember answers you type into fields it could not fill."
          checked={settings.savePrompts}
          onChange={(v) => void patch({ savePrompts: v })}
        />
        <hr className="divider" />
        <Toggle
          label="Highlight fields"
          hint="Green for filled, yellow for fields still needing you."
          checked={settings.highlight}
          onChange={(v) => void patch({ highlight: v })}
        />
      </Card>

      <Card title="Privacy">
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Your profile, answers and API key live in <code className="mono">chrome.storage.local</code>.</li>
          <li>The only network requests are to the provider you picked above.</li>
          <li>Jobmager reads a page only when you press Autofill, never in the background.</li>
        </ul>
      </Card>
    </div>
  );
}
