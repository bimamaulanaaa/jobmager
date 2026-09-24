import { useRef, useState } from 'react';
import type { Profile } from '@/types/profile';
import { applyResumeDraft, extractPdfText } from '@/core/resume-parser';
import { profileFacts } from '@/core/profile-facts';
import { Banner, Card, Spinner } from '@/ui/components';
import type { BackgroundResponse } from '@/types/messages';

type Phase = 'idle' | 'reading' | 'parsing' | 'review' | 'error';

/**
 * Upload -> extract text locally -> AI structures it -> the user reviews every
 * field before anything is written. Nothing is saved without confirmation.
 */
export function ResumeImport({
  profile, onApply,
}: { profile: Profile; onApply: (p: Profile) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Profile | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError('');
    setDraft(null);
    setFileName(file.name);

    if (!/\.pdf$/i.test(file.name)) {
      setError('Only PDF resumes are supported.');
      setPhase('error');
      return;
    }

    try {
      setPhase('reading');
      const text = await extractPdfText(file);

      setPhase('parsing');
      const response = (await chrome.runtime.sendMessage({
        type: 'PARSE_RESUME',
        text,
      })) as BackgroundResponse<Record<string, unknown>>;

      if (!response?.ok) {
        setError(response?.error ?? 'The AI could not parse this resume.');
        setPhase('error');
        return;
      }

      setDraft(applyResumeDraft(profile, response.data));
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  const busy = phase === 'reading' || phase === 'parsing';

  if (phase === 'review' && draft) {
    const before = new Map(profileFacts(profile).map((f) => [f.path, f.value]));
    const after = profileFacts(draft);
    const changed = after.filter((f) => before.get(f.path) !== f.value);

    return (
      <Card title="Review before saving">
        <p className="muted">
          Extracted from <b>{fileName}</b>. Nothing is stored until you confirm.
          {changed.length ? ` ${changed.length} field${changed.length === 1 ? '' : 's'} will change.` : ''}
        </p>

        {changed.length === 0 ? (
          <Banner kind="warn">Nothing new was found in this resume.</Banner>
        ) : (
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="diff-table">
              <tbody>
                {changed.map((fact) => (
                  <tr key={fact.path}>
                    <td>{fact.label}</td>
                    <td>
                      {before.get(fact.path) ? (
                        <div className="faint" style={{ textDecoration: 'line-through' }}>
                          {before.get(fact.path)}
                        </div>
                      ) : null}
                      <div>{fact.value}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row gap-8">
          <button
            className="btn btn-primary"
            disabled={changed.length === 0}
            onClick={() => { onApply(draft); setPhase('idle'); setDraft(null); }}
          >
            Apply to profile
          </button>
          <button className="btn" onClick={() => { setPhase('idle'); setDraft(null); }}>
            Discard
          </button>
        </div>
        <p className="faint">
          Applying only loads the values into the form below — press Save profile to store them.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Import from resume">
      <p className="muted">
        The PDF is read in this browser. Only its extracted text goes to your AI provider,
        which returns structured fields for you to review.
      </p>

      <div
        className={`dropzone${dragging ? ' drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        {busy ? (
          <span className="row gap-8" style={{ justifyContent: 'center' }}>
            <Spinner />
            {phase === 'reading' ? 'Reading the PDF…' : 'Asking the AI to structure it…'}
          </span>
        ) : (
          <>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>Drop a PDF resume here</div>
            <div className="faint">or click to choose a file</div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {phase === 'error' ? <Banner kind="error">{error}</Banner> : null}
    </Card>
  );
}
