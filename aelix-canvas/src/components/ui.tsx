/** Tiny styled form primitives shared by the inspector / panels. */
import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      className={`inp ${mono ? 'mono' : ''}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberInput({ value, onChange, placeholder }: {
  value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string;
}) {
  return (
    <input
      className="inp"
      type="number"
      value={value ?? ''}
      placeholder={placeholder ?? 'auto'}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

export function Select<T extends string>({ value, options, onChange }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void;
}) {
  return (
    <select className="inp sel" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Btn({ children, onClick, kind = 'ghost', title, disabled }: {
  children: ReactNode; onClick?: () => void; kind?: 'ghost' | 'accent' | 'danger'; title?: string; disabled?: boolean;
}) {
  return (
    <button className={`btn btn-${kind}`} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}

export function PanelSection({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="psec">
      <div className="psec-h"><span>{title}</span>{right}</div>
      <div className="psec-body">{children}</div>
    </div>
  );
}
