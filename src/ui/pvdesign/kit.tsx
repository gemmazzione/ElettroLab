import { ChevronDown, CircleHelp, Lightbulb, Wand2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PvCheck } from '../../engine/pv';
import { usePvDesign } from '../../pvdesign/store';
import { NumberInput } from '../fields';

/*
 * Elementi comuni della progettazione guidata: passi, spiegazioni dei termini, opzioni avanzate a scomparsa,
 * numeri che si aggiornano in modo visibile e verifiche raccontate a parole.
 */

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ glossario

export const GLOSSARY = {
  kwp: ['kWp (kilowatt di picco)', 'La potenza dei moduli in condizioni di prova: sole pieno e celle a 25 °C. Serve a confrontare gli impianti; sul tetto i moduli rendono un po\' meno.'],
  stringa: ['Stringa', 'Moduli collegati uno dopo l\'altro, in fila: le loro tensioni si sommano.'],
  mppt: ['MPPT', 'Ingresso dell\'inverter che cerca in ogni istante il punto di lavoro con la massima potenza. Su uno stesso MPPT vanno stringhe uguali e con lo stesso orientamento.'],
  inverter: ['Inverter', 'Trasforma la corrente continua dei moduli in corrente alternata a 230 V, come quella delle prese di casa.'],
  ibrido: ['Inverter ibrido', 'Inverter che gestisce anche una batteria: l\'energia in più del giorno viene accumulata e usata la sera.'],
  autoconsumo: ['Autoconsumo', 'Quota dell\'energia prodotta che usi in casa mentre viene prodotta (o dalla batteria). Il resto va in rete.'],
  autosufficienza: ['Autosufficienza', 'Quota dei tuoi consumi coperta dal fotovoltaico. Il resto lo prendi dalla rete.'],
  pr: ['Indice di rendimento (PR)', 'Energia prodotta divisa per quella teorica senza perdite. Valori tipici tra 75% e 85%.'],
  rientro: ['Rientro', 'Dopo quanti anni risparmi in bolletta, energia venduta e detrazioni hanno ripagato la spesa.'],
  van: ['Valore attuale netto', 'Il guadagno complessivo nella durata dell\'analisi, con i soldi futuri riportati al valore di oggi. Se è positivo, l\'investimento conviene.'],
  lcoe: ['Costo dell\'energia prodotta', 'Quanto ti costa in media ogni kWh prodotto dall\'impianto in tutta la sua vita. Confrontalo con il prezzo dell\'energia in bolletta.'],
  azimut: ['Orientamento (azimut)', 'Direzione verso cui guardano i moduli: 0° è il sud (il migliore in Italia), −90° l\'est, +90° l\'ovest.'],
  falda: ['Falda', 'Ognuna delle superfici inclinate del tetto. I moduli si posano su una falda, di solito quella più rivolta a sud.'],
  irraggiamento: ['Irraggiamento', 'L\'energia del sole che arriva su un metro quadrato, in kWh/m². Più è alto, più i moduli producono.'],
  ombre: ['Ombreggiamento', 'La parte di produzione persa per ombre di alberi, camini o edifici vicini. Senza ombre evidenti si mette 0–3%.'],
  caduta: ['Caduta di tensione', 'La tensione persa lungo il cavo: è energia sprecata in calore. Di solito si tiene sotto l\'1–2%.'],
  detrazione: ['Detrazione fiscale', 'Parte della spesa che recuperi dalle tasse in rate annuali. Percentuale e durata dipendono dalle regole fiscali in vigore: verificale.'],
} as const;

export type TermKey = keyof typeof GLOSSARY;

/** Piccola finestra di spiegazione: si apre passando sopra, con il tasto Tab o con un tocco. */
function Popover({ trigger, title, text, align = 'left' }: { trigger: ReactNode; title?: string; text: string; align?: 'left' | 'right' }) {
  const [openState, setOpenState] = useState(false);
  const [side, setSide] = useState(align);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const open = openState;
  // Vicino al bordo destro la finestra si apre verso sinistra, per non uscire dallo schermo.
  const setOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setOpenState((o) => {
      const next = typeof v === 'function' ? v(o) : v;
      if (next && ref.current) setSide(ref.current.getBoundingClientRect().left > window.innerWidth - 280 ? 'right' : align);
      return next;
    });
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center rounded text-inherit"
      >
        {trigger}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pv-pop-in absolute top-full z-30 mt-1.5 w-[min(260px,70vw)] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-left text-[0.71875rem] font-normal normal-case leading-snug tracking-normal text-slate-300 shadow-[0_8px_24px_rgba(2,6,23,0.6)] ${side === 'right' ? 'right-0' : 'left-0'}`}
        >
          {title && <span className="mb-0.5 block font-semibold text-slate-100">{title}</span>}
          {text}
        </span>
      )}
    </span>
  );
}

/** Termine tecnico con la sua spiegazione. */
export function Term({ k, children, align }: { k: TermKey; children?: ReactNode; align?: 'left' | 'right' }) {
  const [title, text] = GLOSSARY[k];
  return (
    <Popover
      align={align}
      title={title}
      text={text}
      trigger={<span className="cursor-help underline decoration-slate-500 decoration-dotted underline-offset-[3px] hover:decoration-amber-400">{children ?? title}</span>}
    />
  );
}

/** Icona «?» con una spiegazione breve. */
export function Tip({ text }: { text: string }) {
  return <Popover text={text} trigger={<CircleHelp size={12} className="text-slate-500 hover:text-amber-300" aria-label="Spiegazione" />} />;
}

// ------------------------------------------------------------------ campi

export function Num({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  hint,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-[0.6875rem] text-slate-400">
        <label htmlFor={id}>{label}</label>
        {hint && <Tip text={hint} />}
      </span>
      <NumberInput id={id} value={value} onChange={onChange} suffix={suffix} min={min} max={max} step={step} />
    </div>
  );
}

export function FieldLabel({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-[0.6875rem] text-slate-400">
        {label}
        {hint && <Tip text={hint} />}
      </span>
      {children}
    </div>
  );
}

export const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{children}</div>;

// ------------------------------------------------------------------ passi

export function Step({ n, title, intro, help, children }: { n: number; title: string; intro?: ReactNode; help?: ReactNode; children: ReactNode }) {
  const expert = usePvDesign((s) => s.expert);
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <header className="flex items-start gap-3 border-b border-slate-800 px-4 py-3.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[0.78125rem] font-bold tabular-nums text-amber-300">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[1rem] font-semibold leading-tight text-white">{title}</h2>
          {intro && <p className="mt-1 max-w-[72ch] text-[0.78125rem] leading-relaxed text-slate-400">{intro}</p>}
        </div>
      </header>
      <div className="space-y-4 px-4 py-4">
        {help && !expert && (
          <p className="flex gap-2.5 rounded-lg bg-sky-500/[0.07] px-3 py-2.5 text-[0.78125rem] leading-relaxed text-sky-100">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-sky-300" />
            <span>{help}</span>
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

/** Sezione a scomparsa per le opzioni avanzate: aperta di default in modalità esperto. */
export function More({ label, children, defaultOpen }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const expert = usePvDesign((s) => s.expert);
  const [open, setOpen] = useState(defaultOpen ?? expert);
  useEffect(() => setOpen(defaultOpen ?? expert), [expert, defaultOpen]);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  // I campi nascosti non devono ricevere il fuoco con il tasto Tab.
  useEffect(() => {
    if (body.current) body.current.inert = !open;
  }, [open]);
  return (
    <div className="rounded-lg border border-slate-800/80">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[0.75rem] font-medium text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-white"
      >
        {label}
        <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} className="pv-more" data-open={open}>
        <div ref={body} className="min-h-0 overflow-hidden">
          <div className="space-y-3 px-3 pb-3 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ numeri animati

/** Valore che raggiunge il nuovo numero in 0,5 s (subito con «riduci movimento»). */
export function useTween(value: number, ms = 500): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 4);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function Animated({ value, format }: { value: number; format: (v: number) => string }) {
  return <>{format(useTween(value))}</>;
}

/** Riga di risultato che si illumina brevemente quando il valore cambia. */
export function FlashRow({ label, value, format, text }: { label: ReactNode; value?: number; format?: (v: number) => string; text?: string }) {
  const key = value ?? text;
  // Confronto con il valore precedente (non con il primo render: in sviluppo gli effetti partono due volte).
  const prev = useRef(key);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    setPulse((p) => p + 1);
  }, [key]);
  return (
    <div className="relative -mx-2 flex justify-between gap-3 rounded px-2 py-[3px]">
      {pulse > 0 && <span key={pulse} aria-hidden className="pv-flash pointer-events-none absolute inset-0 rounded" />}
      <dt className="relative text-slate-400">{label}</dt>
      <dd className="relative text-right font-mono tabular-nums text-slate-100">{value !== undefined && format ? <Animated value={value} format={format} /> : text}</dd>
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-950/60 px-3 py-2.5">
      <div className="text-[0.6875rem] text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-[1.0625rem] font-semibold tabular-nums text-white">{value}</div>
      {sub && <div className="text-[0.6875rem] text-slate-500">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ verifiche

/** Cosa fare quando una verifica non è superata, in parole semplici. */
const FIX: Record<string, string> = {
  'voc-max': 'Con il freddo la stringa supera la tensione massima dell\'inverter: togli un modulo dalla stringa o scegli un inverter che accetta tensioni più alte.',
  'vmp-min': 'D\'estate la tensione della stringa scende sotto il minimo dell\'inverter: aggiungi moduli alla stringa.',
  'vmp-max': 'D\'inverno la tensione supera la finestra di lavoro dell\'inverter: togli un modulo dalla stringa.',
  'isc-max': 'Troppa corrente su un ingresso: distribuisci le stringhe su più ingressi MPPT o usa meno stringhe in parallelo.',
  'dc-ac': 'Moduli e inverter non sono ben proporzionati: con «Proponi» il programma sceglie un inverter adatto.',
  mppt: 'Le stringhe non si dividono in parti uguali tra gli ingressi: usa un numero di stringhe multiplo degli ingressi.',
  contract: 'L\'inverter è più potente della tua fornitura: parlane con il distributore o scegli un inverter più piccolo.',
  'roof-fit': 'Sulla falda scelta non ci stanno tutti i moduli: riducili, cambia falda o riduci la distanza dai bordi.',
  roof: 'I moduli occupano più superficie di quella disponibile: riduci il numero di moduli.',
  battery: 'Per usare una batteria scegli un inverter ibrido.',
};

export function CheckSummary({ checks, onFix }: { checks: PvCheck[]; onFix?: () => void }) {
  const bad = checks.filter((c) => c.ok === false);
  const warn = checks.filter((c) => c.ok === null);
  const tone = bad.length ? 'bad' : warn.length ? 'warn' : 'ok';
  const box = { ok: 'bg-emerald-500/[0.08] text-emerald-100', warn: 'bg-amber-500/[0.08] text-amber-100', bad: 'bg-red-500/[0.09] text-red-100' }[tone];
  return (
    <div className="space-y-2">
      <div className={`rounded-lg px-3 py-2.5 text-[0.78125rem] leading-relaxed ${box}`}>
        <div className="font-semibold">
          {tone === 'ok' ? 'Tutto compatibile: moduli, stringhe e inverter lavorano bene insieme.' : tone === 'warn' ? 'Funziona, con qualche aspetto da valutare.' : bad.length === 1 ? 'C\'è un problema da correggere.' : `Ci sono ${bad.length} problemi da correggere.`}
        </div>
        {[...bad, ...warn].map((c) => (
          <div key={c.id} className="mt-1.5 flex gap-2">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${c.ok === false ? 'bg-red-400' : 'bg-amber-300'}`} />
            <span>
              <span className="font-medium">{c.title}.</span> {FIX[c.id] ?? c.detail}
            </span>
          </div>
        ))}
        {bad.length > 0 && onFix && (
          <button onClick={onFix} className="mt-2 flex items-center gap-1.5 rounded-md bg-red-500/20 px-2.5 py-1 text-[0.75rem] font-semibold text-red-50 hover:bg-red-500/30">
            <Wand2 size={13} /> Prova a correggere in automatico
          </button>
        )}
      </div>
      <More label={`Mostra le ${checks.length} verifiche con i calcoli`}>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-2 rounded-md bg-slate-950/60 px-3 py-2">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.ok === true ? 'bg-emerald-400' : c.ok === false ? 'bg-red-400' : 'bg-amber-300'}`} aria-label={c.ok === true ? 'superata' : c.ok === false ? 'non superata' : 'da valutare'} />
              <div>
                <div className="text-[0.75rem] font-medium text-slate-100">{c.title}</div>
                <div className="text-[0.71875rem] leading-snug text-slate-400">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </More>
    </div>
  );
}

export function Notes({ title, notes, ok }: { title: string; notes: string[]; ok?: boolean }) {
  return (
    <div className="rounded-md bg-slate-950/60 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[0.75rem] font-semibold text-slate-100">
        {ok !== undefined && <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />}
        {title}
      </div>
      <ul className="list-disc space-y-1 pl-4 text-[0.71875rem] leading-snug text-slate-400">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
