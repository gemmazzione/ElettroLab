import { useEffect, useState, type ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block" title={hint}>
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50';

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  format,
  disabled,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
  disabled?: boolean;
}) {
  return (
    <select
      className={inputCls}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        const found = options.find((o) => String(o) === raw);
        if (found !== undefined) onChange(found);
      }}
    >
      {options.map((o) => (
        <option key={String(o)} value={String(o)}>
          {format ? format(o) : String(o)}
        </option>
      ))}
    </select>
  );
}

/** Campo numerico che conferma il valore solo se valido (blur o Invio). */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max)) {
      setText(String(value));
      return;
    }
    if (v !== value) onChange(v);
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        className={inputCls}
        value={text}
        inputMode="decimal"
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <span className="shrink-0 text-[11px] text-slate-500">{suffix}</span>}
    </div>
  );
}

export function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={inputCls}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() && text !== value && onChange(text.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Row({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
      <span className="text-slate-400">{k}</span>
      <span className={`text-right text-slate-100 ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-800 px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
