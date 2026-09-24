import { useMemo, useState } from 'react';
import type { CustomField, Profile, SavedAnswer } from '@/types/profile';
import { deleteAnswer, updateAnswer, upsertProfile } from '@/storage';
import { Banner, Card, Empty } from '@/ui/components';

/**
 * Saved answers are questions the user answered by hand. They feed the matcher
 * on later applications and can be promoted into a custom field when an answer
 * turns out to be a stable fact rather than a one-off.
 */
export function AnswersPage({
  answers, onAnswersChange, profile, onProfileChange,
}: {
  answers: SavedAnswer[];
  onAnswersChange: (a: SavedAnswer[]) => void;
  profile: Profile | null;
  onProfileChange: (p: Profile) => void;
}) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const sorted = [...answers].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (a) => a.question.toLowerCase().includes(q) || a.answer.toLowerCase().includes(q),
    );
  }, [answers, query]);

  function startEdit(answer: SavedAnswer) {
    setEditingId(answer.id);
    setEditQuestion(answer.question);
    setEditAnswer(answer.answer);
  }

  async function commitEdit(answer: SavedAnswer) {
    onAnswersChange(
      await updateAnswer({ ...answer, question: editQuestion.trim(), answer: editAnswer }),
    );
    setEditingId(null);
  }

  async function remove(answer: SavedAnswer) {
    if (!confirm('Delete this saved answer?')) return;
    onAnswersChange(await deleteAnswer(answer.id));
  }

  async function promote(answer: SavedAnswer) {
    if (!profile) return;
    const field: CustomField = {
      id: crypto.randomUUID(),
      label: answer.question.slice(0, 120),
      value: answer.answer,
      type: answer.answer.length > 120 ? 'longtext' : 'text',
      order: profile.customFields.length,
    };
    const next: Profile = { ...profile, customFields: [...profile.customFields, field] };
    await upsertProfile(next);
    onProfileChange(next);
    setNotice(`Added “${field.label}” to ${profile.name} as a custom field.`);
  }

  return (
    <div className="stack gap-24">
      <Card
        title="Saved answers"
        action={
          <input
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 200 }}
          />
        }
      >
        <p className="muted">
          Questions you answered by hand after an autofill. Jobmager reuses them on the next
          application — and the matcher may only quote them, never rewrite them.
        </p>

        {notice ? <Banner kind="ok">{notice}</Banner> : null}

        {filtered.length === 0 ? (
          <Empty>
            {answers.length === 0
              ? 'Nothing saved yet. Autofill a form, then answer one of the yellow fields.'
              : 'No answers match that search.'}
          </Empty>
        ) : (
          <div className="stack gap-12">
            {filtered.map((answer) => (
              <div key={answer.id} className="list-item">
                {editingId === answer.id ? (
                  <>
                    <label className="field">
                      <span className="label">Question</span>
                      <input value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="label">Answer</span>
                      <textarea value={editAnswer} onChange={(e) => setEditAnswer(e.target.value)} />
                    </label>
                    <div className="row gap-8">
                      <button className="btn btn-primary btn-sm" onClick={() => void commitEdit(answer)}>
                        Save
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="entry-head">
                      <span className="entry-title">{answer.question}</span>
                      <div className="row gap-4">
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(answer)}>Edit</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void promote(answer)}
                          disabled={!profile}
                          title="Copy into the active profile as a custom field"
                        >
                          Promote
                        </button>
                        <button className="btn btn-ghost btn-sm btn-danger" onClick={() => void remove(answer)}>
                          Delete
                        </button>
                      </div>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{answer.answer}</p>
                    <div className="row gap-8 faint">
                      {answer.origin ? <span>{answer.origin}</span> : null}
                      <span>·</span>
                      <span>updated {new Date(answer.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
