import { Check, ChevronDown, Copy, FilePlus2, FolderOpen, GitCompare, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeDesign, f, moduleCount, peakW, type DesignResults } from '../../pvdesign/calc';
import { isHybrid, type PvDesign } from '../../pvdesign/design';
import { usePvDesign, type PvEntry } from '../../pvdesign/store';

const eur = (v: number) => `${Math.round(v).toLocaleString('it-IT')} €`;
const when = (iso: string) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** Riga sopra i passi: nome del progetto aperto e libreria dei progetti FV. */
export function ProjectBar() {
  const d = usePvDesign((s) => s.design);
  const library = usePvDesign((s) => s.library);
  const rename = usePvDesign((s) => s.rename);
  const duplicate = usePvDesign((s) => s.duplicate);
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  useEffect(() => setName(d.name), [d.name]);
  const commitName = () => {
    setEditing(false);
    const v = name.trim();
    if (v && v !== d.name) rename(library.currentId, v);
    else setName(d.name);
  };
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') {
              setName(d.name);
              setEditing(false);
            }
          }}
          maxLength={80}
          aria-label="Nome del progetto"
          className="min-w-0 flex-1 rounded-md border border-amber-500/50 bg-slate-950 px-2 py-1 text-[0.875rem] font-semibold text-white outline-none sm:max-w-[22rem]"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left text-[0.875rem] font-semibold text-white hover:bg-slate-800/60" title="Rinomina il progetto">
          <span className="truncate">{d.name}</span>
          <Pencil size={13} className="shrink-0 text-slate-500 group-hover:text-slate-300" />
        </button>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-[0.75rem] text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800"
        >
          <FolderOpen size={14} /> I miei progetti <span className="rounded bg-slate-800 px-1.5 font-mono text-[0.6875rem] text-slate-300">{library.projects.length}</span>
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={duplicate}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.75rem] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          title="Crea una copia del progetto per provare un'alternativa (altro inverter, batteria, più moduli...)"
        >
          <Copy size={14} /> <span className="hidden sm:inline">Crea una variante</span>
        </button>
      </div>
      {open && <LibraryPanel close={() => setOpen(false)} onCompare={() => (setOpen(false), setCompare(true))} />}
      {compare && <CompareDialog close={() => setCompare(false)} />}
    </div>
  );
}

function LibraryPanel({ close, onCompare }: { close: () => void; onCompare: () => void }) {
  const library = usePvDesign((s) => s.library);
  const { open, remove, create } = usePvDesign.getState();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // Il clic che ha aperto il pannello non deve chiuderlo subito.
    const t = setTimeout(() => document.addEventListener('pointerdown', down));
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [close]);
  return (
    <div ref={ref} className="pv-pop-in absolute right-0 top-full z-30 mt-1.5 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/50">
      <ul className="max-h-[22rem] space-y-1 overflow-y-auto [scrollbar-width:thin]">
        {library.projects.map((p) => {
          const cur = p.id === library.currentId;
          return (
            <li key={p.id} className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 ${cur ? 'bg-amber-500/10' : 'hover:bg-slate-800'}`}>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  open(p.id);
                  close();
                }}
              >
                <span className="flex items-center gap-1.5 text-[0.78125rem] font-medium text-slate-100">
                  {cur && <Check size={13} className="shrink-0 text-amber-300" />}
                  <span className="truncate">{p.design.name}</span>
                </span>
                <span className="block text-[0.6875rem] text-slate-500">
                  {f(peakW(p.design) / 1000, 1)} kWp{p.design.location.address ? ` · ${p.design.location.address.split(',')[0]}` : ''} · {when(p.updated)}
                </span>
              </button>
              <button
                onClick={() => window.confirm(`Eliminare «${p.design.name}»? Non si può annullare.`) && remove(p.id)}
                className="rounded p-1.5 text-slate-500 opacity-70 transition-colors hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
                aria-label={`Elimina ${p.design.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-slate-800 pt-2">
        <button
          onClick={() => {
            create();
            close();
          }}
          className="flex items-center justify-center gap-1.5 rounded-md bg-slate-800 px-2 py-2 text-[0.75rem] font-medium text-slate-100 hover:bg-slate-700"
        >
          <FilePlus2 size={14} /> Nuovo progetto
        </button>
        <button
          onClick={onCompare}
          disabled={library.projects.length < 2}
          className="flex items-center justify-center gap-1.5 rounded-md bg-slate-800 px-2 py-2 text-[0.75rem] font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-40"
          title={library.projects.length < 2 ? 'Serve almeno un secondo progetto: crea una variante' : undefined}
        >
          <GitCompare size={14} /> Confronta
        </button>
      </div>
      <p className="px-1 pt-2 text-[0.6875rem] text-slate-500">I progetti restano in questo browser; con l'accesso all'account si salvano anche sul sito.</p>
    </div>
  );
}

/** Ricalcola un progetto salvato; se è nello stesso luogo di quello aperto usa il suo anno tipo PVGIS. */
function resultsOf(p: PvEntry, current: PvDesign): DesignResults {
  const w = current.site.weather;
  const lat = p.design.location.lat;
  const same = w && lat !== null && Math.abs(w.lat - lat) < 0.02 && Math.abs(w.lon - (p.design.location.lon ?? 0)) < 0.02;
  return computeDesign(same ? { ...p.design, site: { ...p.design.site, weather: w } } : p.design);
}

type Row = [string, (d: PvDesign, r: DesignResults) => string, ((r: DesignResults) => number)?, ('high' | 'low')?];
const ROWS: Row[] = [
  ['Potenza', (d) => `${f(peakW(d) / 1000, 2)} kWp`],
  ['Moduli', (d) => f(moduleCount(d))],
  ['Inverter', (d) => d.inverter.label],
  ['Batteria', (d) => (isHybrid(d) && d.batteryKWh > 0 ? `${f(d.batteryKWh, 1)} kWh` : 'nessuna')],
  ['Produzione annua', (_, r) => `${f(r.yield.productionKWh)} kWh`, (r) => r.yield.productionKWh, 'high'],
  ['Autoconsumo', (_, r) => `${f(r.yield.selfConsumptionPct)}%`, (r) => r.yield.selfConsumptionPct, 'high'],
  ['Autosufficienza', (_, r) => `${f(r.yield.selfSufficiencyPct)}%`, (r) => r.yield.selfSufficiencyPct, 'high'],
  ['Costo totale', (_, r) => eur(r.economics.total), (r) => r.economics.total, 'low'],
  ['Risparmio del primo anno', (_, r) => eur(r.economics.firstYearSaving + r.economics.firstYearExport + r.economics.firstYearCer), (r) => r.economics.firstYearSaving + r.economics.firstYearExport + r.economics.firstYearCer, 'high'],
  ['Si ripaga in', (_, r) => (r.economics.paybackYears === null ? 'oltre la durata' : `${f(r.economics.paybackYears, 1)} anni`), (r) => r.economics.paybackYears ?? 1e9, 'low'],
  ['Valore attuale netto', (_, r) => eur(r.economics.npv), (r) => r.economics.npv, 'high'],
  ['Verifiche', (_, r) => {
    const bad = r.checks.filter((c) => c.ok === false).length + (r.dc.ok ? 0 : 1) + (r.ac.ok ? 0 : 1);
    return bad ? `${bad} da correggere` : 'tutte superate';
  }],
];

function CompareDialog({ close }: { close: () => void }) {
  const library = usePvDesign((s) => s.library);
  const current = usePvDesign((s) => s.design);
  const others = library.projects.filter((p) => p.id !== library.currentId);
  const [a, setA] = useState(library.currentId);
  const [b, setB] = useState(others[0]?.id ?? library.currentId);
  const pick = (id: string) => library.projects.find((p) => p.id === id)!;
  const ra = useMemo(() => (a === library.currentId ? computeDesign(current) : resultsOf(pick(a), current)), [a, current, library]);
  const rb = useMemo(() => (b === library.currentId ? computeDesign(current) : resultsOf(pick(b), current)), [b, current, library]);
  const da = a === library.currentId ? current : pick(a).design;
  const db = b === library.currentId ? current : pick(b).design;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close]);
  const sel = (v: string, set: (v: string) => void, label: string) => (
    <select value={v} onChange={(e) => set(e.target.value)} aria-label={label} className="w-full min-w-0 truncate rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[0.75rem] font-semibold text-slate-100">
      {library.projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.id === library.currentId ? `${current.name} (aperto)` : p.design.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center" onClick={close}>
      <div role="dialog" aria-label="Confronto tra progetti" className="pv-pop-in w-full max-w-[44rem] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-white">
            <GitCompare size={17} className="text-amber-300" /> Confronto tra due progetti
          </h2>
          <button onClick={close} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-[0.78125rem]">
            <thead>
              <tr>
                <th className="w-[34%]" />
                <th className="px-1 pb-2">{sel(a, setA, 'Primo progetto')}</th>
                <th className="px-1 pb-2">{sel(b, setB, 'Secondo progetto')}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, fmt, num, better]) => {
                const va = num?.(ra);
                const vb = num?.(rb);
                const win = va !== undefined && vb !== undefined && Math.abs(va - vb) > Math.abs(va) * 0.005 ? ((better === 'high' ? va > vb : va < vb) ? 'a' : 'b') : null;
                const cell = (who: 'a' | 'b', d: PvDesign, r: DesignResults) => (
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${win === who ? 'font-semibold text-emerald-300' : 'text-slate-200'}`}>
                    {fmt(d, r)}
                    {win === who && <Check size={12} className="ml-1 inline align-[-1px]" />}
                  </td>
                );
                return (
                  <tr key={label} className="border-t border-slate-800">
                    <td className="py-1.5 text-slate-400">{label}</td>
                    {cell('a', da, ra)}
                    {cell('b', db, rb)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.6875rem] text-slate-500">
          In verde il valore migliore. I progetti in un altro luogo sono calcolati con l'irraggiamento stimato finché non li apri e scarichi i dati PVGIS.
        </p>
      </div>
    </div>
  );
}
