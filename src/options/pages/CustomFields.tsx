import type { CustomField, CustomFieldType, Profile } from '@/types/profile';
import { Card, Empty } from '@/ui/components';

const TYPES: { id: CustomFieldType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'longtext', label: 'Long text' },
];

const SUGGESTIONS = ['Notice period', 'Preferred pronouns', 'T-shirt size', 'Availability to start', 'Referred by'];

/**
 * Custom fields are stored alongside the default schema and flattened into the
 * same fact list, so the AI matches them exactly like built-in fields.
 */
export function CustomFields({
  profile, onChange,
}: { profile: Profile; onChange: (p: Profile) => void }) {
  const fields = [...profile.customFields].sort((a, b) => a.order - b.order);

  function commit(next: CustomField[]) {
    onChange({ ...profile, customFields: next.map((f, i) => ({ ...f, order: i })) });
  }

  function add(label = '') {
    commit([
      ...fields,
      { id: crypto.randomUUID(), label, value: '', type: 'text', order: fields.length },
    ]);
  }

  function update(id: string, patch: Partial<CustomField>) {
    commit(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function remove(id: string) {
    commit(fields.filter((f) => f.id !== id));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  return (
    <Card
      title="Custom fields"
      action={<button className="btn btn-sm" onClick={() => add()}>Add field</button>}
    >
      <p className="muted">
        Anything the default schema does not cover. These are matched exactly like
        built-in fields — a question on a form that lines up with the label here gets
        this value.
      </p>

      {fields.length === 0 ? (
        <>
          <Empty>No custom fields yet.</Empty>
          <div className="row gap-8" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-sm" onClick={() => add(s)}>+ {s}</button>
            ))}
          </div>
        </>
      ) : (
        <div className="stack gap-12">
          {fields.map((field, index) => (
            <div key={field.id} className="list-item">
              <div className="row gap-8">
                <div className="stack gap-4">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >↑</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => move(index, 1)}
                    disabled={index === fields.length - 1}
                    aria-label="Move down"
                  >↓</button>
                </div>

                <div className="grow stack gap-8">
                  <div className="row gap-8">
                    <input
                      className="grow"
                      value={field.label}
                      placeholder="Label, e.g. Notice period"
                      onChange={(e) => update(field.id, { label: e.target.value })}
                    />
                    <select
                      value={field.type}
                      style={{ width: 120 }}
                      onChange={(e) => update(field.id, { type: e.target.value as CustomFieldType })}
                    >
                      {TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => remove(field.id)}
                    >Delete</button>
                  </div>

                  {field.type === 'longtext' ? (
                    <textarea
                      value={field.value}
                      placeholder="Value"
                      onChange={(e) => update(field.id, { value: e.target.value })}
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      value={field.value}
                      placeholder="Value"
                      onChange={(e) => update(field.id, { value: e.target.value })}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
