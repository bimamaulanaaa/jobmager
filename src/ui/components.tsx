import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function TextField({
  label, hint, value, onChange, ...rest
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Field label={label} hint={hint}>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function TextArea({
  label, hint, value, onChange, ...rest
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return (
    <Field label={label} hint={hint}>
      <textarea {...rest} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Banner({
  kind, children,
}: { kind: 'error' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card stack gap-16">
      {title || action ? (
        <div className="row-between">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export function Toggle({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row-between">
      <div className="stack gap-4">
        <span style={{ fontWeight: 500 }}>{label}</span>
        {hint ? <span className="faint">{hint}</span> : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="faint" style={{ padding: '18px 0', textAlign: 'center' }}>
      {children}
    </p>
  );
}
