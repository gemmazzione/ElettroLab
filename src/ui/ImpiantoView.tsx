import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, DraftingCompass, FileDown, FileSpreadsheet, FlaskConical, Info, Plus, Trash2, XCircle } from 'lucide-react';
import { billOfMaterials, computePlant, f, fA, IN_ALL, isSubBoard, SECTIONS, type Check, type LineResult, type PlantResult, type Status } from '../impianto/calc';
import { boardsOf, examplePlants, isThreePhaseSupply, KIND_LABEL, line, newId, SUPPLY_LABEL, USE_LABEL, type LineKind, type Plant, type PlantLine, type PlantUse, type RcdGroup, type SupplyKind } from '../impianto/model';
import { bomCsv, buildPlantPdf, pdfName, plantCsv } from '../impianto/pdf';
import { plantToProject } from '../impianto/toLab';
import { useStore } from '../store/projectStore';
import { currentPlant, useImpianto } from '../impianto/store';
import { singleLine, type Prim } from '../impianto/unifilare';
import { multiLine, WIRE_SCREEN } from '../impianto/multifilare';
import { TRANSFORMER_SIZES } from '../model/cabin';
import { INSTALL_METHODS, type InstallMethod, type Insulation } from '../rules/ampacity';
import type { WireSection } from '../model/types';
import { Field, NumberInput, Select, TextInput } from './fields';
import { PlanStep } from './PlanEditor';

/**
 * Sezione «Progetta impianto»: il lavoro del progettista elettrico su un impianto utilizzatore in BT.
 * Dati generali e obbligo di progetto, elenco delle linee, dimensionamento con le verifiche, schema unifilare,
 * relazione tecnica in PDF e tabella dei cavi.
 */

const STEPS = ['Dati generali', 'Linee e carichi', 'Planimetria', 'Quadri e verifiche', 'Terra e materiali', 'Documenti'] as const;

const usePlant = () => useImpianto((s) => currentPlant(s));

export function ImpiantoView() {
  const plant = usePlant();
  const step = useImpianto((s) => s.step);
  const setStep = useImpianto((s) => s.setStep);
  const result = useMemo(() => computePlant(plant), [plant]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-[90rem] gap-5 px-4 py-5 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="min-w-0 xl:sticky xl:top-5 xl:self-start" aria-label="Fasi del progetto">
          <div className="mb-3 flex items-center gap-2 text-sky-300">
            <DraftingCompass size={18} />
            <span className="text-[0.8125rem] font-semibold">Progetta impianto</span>
          </div>
          <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] xl:flex-col">
            {STEPS.map((t, i) => {
              const bad = i === 3 && result.errors > 0;
              return (
                <li key={t} className="shrink-0">
                  <button
                    onClick={() => setStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.78125rem] ${i === step ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65625rem] font-bold ${bad ? 'bg-red-500/25 text-red-200' : i === step ? 'bg-sky-400/20 text-sky-300' : 'bg-slate-800 text-slate-400'}`}>
                      {bad ? '!' : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{t}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Summary r={result} />
        </nav>
        <main className="min-w-0 space-y-4">
          <LibraryBar />
          {step === 0 && <GeneralStep r={result} />}
          {step === 1 && <LinesStep r={result} />}
          {step === 2 && <PlanStep r={result} />}
          {step === 3 && <BoardStep r={result} />}
          {step === 4 && <EarthStep r={result} />}
          {step === 5 && <DocsStep r={result} />}
          <div className="flex justify-between pt-1">
            <button disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-md px-3 py-1.5 text-[0.75rem] text-slate-300 hover:bg-slate-800 disabled:opacity-30">
              ← {step > 0 ? STEPS[step - 1] : ''}
            </button>
            {step < STEPS.length - 1 && (
              <button onClick={() => setStep(step + 1)} className="rounded-md bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-sky-500">
                {STEPS[step + 1]} →
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ comuni

const Card = ({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) => (
  <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
    {(title || right) && (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {title && <h2 className="text-[0.875rem] font-semibold text-slate-100">{title}</h2>}
        {right}
      </div>
    )}
    {children}
  </section>
);

const TONE: Record<Status, string> = { ok: 'text-emerald-300', info: 'text-sky-200', warn: 'text-amber-200', error: 'text-red-300' };
const StatusIcon = ({ s, size = 14 }: { s: Status; size?: number }) =>
  s === 'ok' ? <CheckCircle2 size={size} className="shrink-0 text-emerald-400" aria-label="ok" /> : s === 'info' ? <Info size={size} className="shrink-0 text-sky-400" aria-label="da rispettare in opera" /> : s === 'warn' ? <AlertTriangle size={size} className="shrink-0 text-amber-300" aria-label="attenzione" /> : <XCircle size={size} className="shrink-0 text-red-400" aria-label="da correggere" />;

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2 text-[0.75rem] leading-snug">
          <span className="mt-0.5">
            <StatusIcon s={c.status} />
          </span>
          <span>
            <span className="font-semibold text-slate-200">{c.label}: </span>
            <span className={c.status === 'ok' || c.status === 'info' ? 'text-slate-300' : TONE[c.status]}>{c.text}</span>
            {c.ref && <span className="ml-1 text-[0.6875rem] text-slate-500">({c.ref})</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Summary({ r }: { r: PlantResult }) {
  return (
    <div className="mt-4 hidden space-y-1 rounded-lg border border-slate-800 p-3 text-[0.71875rem] xl:block">
      <div className="flex justify-between text-slate-400">
        <span>Potenza contemporanea</span>
        <span className="font-mono text-slate-100">{f(r.balance.simultaneousW / 1000, 1)} kW</span>
      </div>
      <div className="flex justify-between text-slate-400">
        <span>Generale</span>
        <span className="font-mono text-slate-100">{r.main.inA ? `${r.main.inA} A` : '—'}</span>
      </div>
      <div className="flex justify-between text-slate-400">
        <span>Icc al quadro</span>
        <span className="font-mono text-slate-100">{fA(r.source.iccMaxA)}</span>
      </div>
      <div className={`pt-1 ${r.errors ? 'text-red-300' : r.warnings ? 'text-amber-200' : 'text-emerald-300'}`}>
        {r.errors ? `${r.errors} verifiche da correggere` : r.warnings ? `${r.warnings} avvisi` : 'Tutte le verifiche superate'}
      </div>
    </div>
  );
}

function LibraryBar() {
  const s = useImpianto();
  const plant = currentPlant(s);
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Progetto aperto"
        value={plant.id}
        onChange={(e) => s.open(e.target.value)}
        className="min-w-0 max-w-[18rem] rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[0.75rem] text-slate-100"
      >
        {s.plants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="relative">
        <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[0.75rem] text-slate-300 hover:bg-slate-800">
          <Plus size={14} /> Nuovo
        </button>
        {adding && <div className="fixed inset-0 z-10" onClick={() => setAdding(false)} aria-hidden />}
        {adding && (
          <div className="absolute left-0 top-full z-20 mt-1 w-[18rem] rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
            {examplePlants().map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  s.create(e.id);
                  setAdding(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-800"
              >
                <div className="text-[0.75rem] font-semibold text-slate-100">{e.title}</div>
                <div className="text-[0.6875rem] text-slate-400">{e.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={s.duplicate} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[0.75rem] text-slate-300 hover:bg-slate-800">
        <Copy size={14} /> Duplica
      </button>
      <button
        onClick={() => window.confirm(`Eliminare il progetto «${plant.name}»?`) && s.remove(plant.id)}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[0.75rem] text-slate-400 hover:bg-slate-800 hover:text-red-300"
      >
        <Trash2 size={14} /> Elimina
      </button>
      <span className="ml-auto text-[0.6875rem] text-slate-500">Salvato nel browser e, con l'accesso, nell'account</span>
    </div>
  );
}

// ------------------------------------------------------------------ 1. dati generali

function GeneralStep({ r }: { r: PlantResult }) {
  const p = usePlant();
  const up = useImpianto((s) => s.update);
  const set = (patch: Partial<Plant>) => up((x) => ({ ...x, ...patch }));
  const sup = (patch: Partial<Plant['supply']>) => up((x) => ({ ...x, supply: { ...x.supply, ...patch } }));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <Card title="Committente e progetto">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome del progetto">
              <TextInput value={p.name} onChange={(v) => set({ name: v })} />
            </Field>
            <Field label="Committente">
              <OptText value={p.client} onChange={(v) => set({ client: v })} />
            </Field>
            <Field label="Ubicazione">
              <OptText value={p.address} onChange={(v) => set({ address: v })} />
            </Field>
            <Field label="Progettista">
              <OptText value={p.designer} onChange={(v) => set({ designer: v })} />
            </Field>
            <Field label="Destinazione d'uso">
              <Select value={p.use} options={Object.keys(USE_LABEL) as PlantUse[]} format={(v) => USE_LABEL[v]} onChange={(v) => set({ use: v })} />
            </Field>
            <Field label="Superficie">
              <NumberInput value={p.areaM2} min={1} max={100000} suffix="m²" onChange={(v) => set({ areaM2: v })} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.75rem] text-slate-300">
            {(
              [
                ['medical', 'Locali a uso medico'],
                ['explosion', 'Pericolo di esplosione'],
                ['fire', 'Maggior rischio in caso d\'incendio'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-sky-500" checked={p.special[k]} onChange={(e) => set({ special: { ...p.special, [k]: e.target.checked } })} />
                {label}
              </label>
            ))}
          </div>
        </Card>
        <Card title="Fornitura e sistema di distribuzione">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Field label="Fornitura">
                <Select value={p.supply.kind} options={Object.keys(SUPPLY_LABEL) as SupplyKind[]} format={(v) => SUPPLY_LABEL[v]} onChange={(v) => sup({ kind: v, iccKA: v === 'bt-mono' ? 6 : v === 'bt-tri' ? 10 : p.supply.iccKA })} />
              </Field>
            </div>
            {p.supply.kind !== 'cabina' ? (
              <>
                <Field label="Potenza impegnata">
                  <NumberInput value={p.supply.contractKW} min={1} max={500} step={0.5} suffix="kW" onChange={(v) => sup({ contractKW: v })} />
                </Field>
                <Field label="Icc al punto di consegna" hint="Valore dichiarato dal distributore: chiedilo per il punto di fornitura">
                  <NumberInput value={p.supply.iccKA} min={0.5} max={50} step={0.5} suffix="kA" onChange={(v) => sup({ iccKA: v })} />
                </Field>
                <Field label="Resistenza di terra RA">
                  <NumberInput value={p.raOhm} min={0.1} max={5000} suffix="Ω" onChange={(v) => set({ raOhm: v })} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Trasformatore">
                  <Select value={p.supply.kva} options={TRANSFORMER_SIZES} format={(v) => `${v} kVA`} onChange={(v) => sup({ kva: v })} />
                </Field>
                <Field label="Tensione di cortocircuito ucc">
                  <NumberInput value={p.supply.ukPct} min={2} max={10} step={0.5} suffix="%" onChange={(v) => sup({ ukPct: v })} />
                </Field>
                <Field label="Scc della rete MT" hint="Dato del distributore: tipicamente alcune centinaia di MVA">
                  <NumberInput value={p.supply.mvSccMVA} min={10} max={2000} step={10} suffix="MVA" onChange={(v) => sup({ mvSccMVA: v })} />
                </Field>
              </>
            )}
          </div>
          <p className="mt-3 text-[0.71875rem] leading-snug text-slate-400">
            {p.earthing === 'TT'
              ? 'Sistema TT: le masse sono collegate al dispersore dell\'impianto e la protezione dai contatti indiretti è affidata ai differenziali (RA · IΔn ≤ 50 V).'
              : 'Sistema TN-S: il PE parte dal centro stella del trasformatore. Il guasto a massa è quasi un cortocircuito e può farlo interrompere anche il magnetotermico, se la corrente di guasto supera la sua soglia magnetica.'}
          </p>
        </Card>
        <Card title="Linea di alimentazione e criteri">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Lunghezza fino al quadro">
              <NumberInput value={p.feeder.lengthM} min={1} max={500} suffix="m" onChange={(v) => set({ feeder: { ...p.feeder, lengthM: v } })} />
            </Field>
            <Field label="Posa">
              <Select value={p.feeder.method} options={INSTALL_METHODS.map((m) => m.id)} format={methodLabel} onChange={(v) => set({ feeder: { ...p.feeder, method: v } })} />
            </Field>
            <Field label="Isolante">
              <Select value={p.feeder.insulation} options={['PVC', 'EPR'] as Insulation[]} onChange={(v) => set({ feeder: { ...p.feeder, insulation: v } })} />
            </Field>
            <Field label="Contemporaneità kc sul generale" hint="Quota dei carichi che funzionano insieme">
              <NumberInput value={p.kc} min={0.1} max={1} step={0.05} onChange={(v) => set({ kc: v })} />
            </Field>
            <Field label="Caduta di tensione massima">
              <NumberInput value={p.maxDropPct} min={1} max={10} step={0.5} suffix="%" onChange={(v) => set({ maxDropPct: v })} />
            </Field>
            <Field label="Differenziale sul generale" hint="Di solito selettivo (tipo S), a monte dei 30 mA">
              <Select value={p.mainRcdMa} options={[0, 100, 300, 500, 1000] as const} format={(v) => (v ? `${v} mA` : 'nessuno')} onChange={(v) => set({ mainRcdMa: v })} />
            </Field>
            <Field label="Scaricatori di sovratensione (SPD)" hint="La necessità si valuta con la CEI EN 62305-2">
              <Select value={p.spd} options={['nessuno', 'origine', 'origine-sottoquadri'] as const} format={(v) => (v === 'nessuno' ? 'nessuno' : v === 'origine' ? 'all\'origine' : 'origine e sottoquadri')} onChange={(v) => set({ spd: v })} />
            </Field>
            {p.mainRcdMa > 0 && (
              <label className="flex items-center gap-1.5 self-end pb-2 text-[0.75rem] text-slate-300">
                <input type="checkbox" className="accent-sky-500" checked={p.mainRcdS} onChange={(e) => set({ mainRcdS: e.target.checked })} /> Selettivo (tipo S)
              </label>
            )}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Serve il progetto di un professionista?">
          <div className={`flex items-start gap-2 text-[0.8125rem] ${r.dm.required ? 'text-amber-200' : 'text-emerald-300'}`}>
            <StatusIcon s={r.dm.required ? 'warn' : 'ok'} size={16} />
            <span className="font-semibold">{r.dm.required ? 'Sì, progetto di un professionista iscritto all\'albo' : 'No: basta il progetto del responsabile tecnico dell\'impresa installatrice'}</span>
          </div>
          {r.dm.required && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[0.75rem] text-slate-300">
              {r.dm.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[0.6875rem] leading-snug text-slate-500">
            DM 22 gennaio 2008 n. 37, art. 5 comma 2, letto su Normattiva. Restano altri casi (lampade a catodo freddo, impianti elettronici coesistenti, protezione dalle scariche atmosferiche oltre 200 m³) e
            le eventuali modifiche successive del decreto: verifica il testo vigente.
          </p>
        </Card>
        <Card title="Il punto di consegna">
          <div className="space-y-1 text-[0.75rem]">
            <KV k="Icc massima al quadro" v={fA(r.source.iccMaxA)} />
            <KV k="Sistema" v={p.earthing} />
            <KV k="Potenza contemporanea" v={`${f(r.balance.simultaneousW / 1000, 1)} kW`} />
            <KV k="Corrente del generale" v={fA(r.main.ibA)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function OptText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [t, setT] = useState(value);
  return (
    <input
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => t.trim() !== value && onChange(t.trim())}
      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[0.75rem] text-slate-100 outline-none focus:border-sky-500"
    />
  );
}

const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-3">
    <span className="text-slate-400">{k}</span>
    <span className="text-right font-mono text-slate-100">{v}</span>
  </div>
);

const methodLabel = (m: InstallMethod) => INSTALL_METHODS.find((x) => x.id === m)?.label ?? m;

// ------------------------------------------------------------------ 2. linee

const ADD_KINDS: LineKind[] = ['luce', 'prese', 'cucina', 'clima', 'scaldabagno', 'ricarica', 'fm', 'motore', 'emergenza', 'sottoquadro', 'generico'];

/** Valore del selettore «Differenziale»: proprio (mA) o di gruppo (id). */
const rcdValue = (l: PlantLine) => (l.rcdGroup ? `g:${l.rcdGroup}` : `m:${l.rcdMa}`);

function LinesStep({ r }: { r: PlantResult }) {
  const p = usePlant();
  const b = r.balance;
  return (
    <div className="space-y-4">
      {boardsOf(p).map((bd) => (
        <BoardLines key={bd.id || 'qg'} boardId={bd.id} name={bd.name} r={r} />
      ))}
      <RcdGroupsCard />
      <Card title="Bilancio delle potenze del quadro generale">
        <div className="grid gap-x-8 gap-y-1 text-[0.75rem] sm:grid-cols-2">
          <KV k="Potenza installata" v={`${f(b.installedW / 1000, 1)} kW`} />
          <KV k="Potenza assorbita (Σ P · ku)" v={`${f(b.absorbedW / 1000, 1)} kW`} />
          <KV k={`Contemporanea (kc ${f(p.kc, 2)})`} v={`${f(b.simultaneousW / 1000, 1)} kW`} />
          <KV k="cos φ medio" v={f(b.cosPhi, 2)} />
          {b.phaseA.length === 3 ? (
            <>
              {b.phaseA.map((v, i) => (
                <KV key={i} k={`Corrente L${i + 1}`} v={fA(v)} />
              ))}
              <KV k="Squilibrio" v={`${f(b.unbalance * 100, 0)}%`} />
            </>
          ) : (
            <KV k="Corrente del generale" v={fA(b.ibA)} />
          )}
        </div>
        {b.phaseA.length === 3 && b.ibA > 0 && (
          <div className="mt-3 space-y-1">
            {b.phaseA.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-[0.6875rem] text-slate-400">
                <span className="w-5">L{i + 1}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                  <div className="h-full rounded bg-sky-500" style={{ width: `${(v / b.ibA) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BoardLines({ boardId, name, r }: { boardId: string; name: string; r: PlantResult }) {
  const p = usePlant();
  const up = useImpianto((s) => s.update);
  const feeder = p.lines.find((l) => l.id === boardId);
  const tri = boardId ? feeder?.phases === 3 : isThreePhaseSupply(p);
  const lines = p.lines.filter((l) => l.boardId === boardId && l.id !== boardId);
  const groups = p.rcdGroups.filter((g) => g.boardId === boardId);
  const setLine = (id: string, patch: Partial<PlantLine>) => up((x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const add = (k: LineKind) => up((x) => ({ ...x, lines: [...x.lines, line(k, tri, { boardId, ...(k === 'sottoquadro' && boardId ? { kind: 'generico', name: 'Linea' } : {}) })] }));
  const resOf = (id: string) => r.lines.find((x) => x.line.id === id);
  const fr = boardId ? resOf(boardId) : null;
  return (
    <Card
      title={boardId ? `Sottoquadro «${name}»` : 'Linee del quadro generale'}
      right={
        boardId && feeder ? (
          <div className="flex items-center gap-2 text-[0.71875rem] text-slate-400">
            <span>
              alimentato da {fr?.tag} · {feeder.phases === 3 ? 'trifase' : 'monofase'}
            </span>
            <span>kc</span>
            <div className="w-[4.5rem]">
              <NumberInput value={feeder.kcSub ?? 0.8} min={0.1} max={1} step={0.05} onChange={(v) => setLine(feeder.id, { kcSub: v })} />
            </div>
          </div>
        ) : null
      }
    >
      {!boardId && (
        <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">
          Per ogni linea: potenza installata, coefficiente di utilizzazione ku, lunghezza e posa del cavo, curva dell'interruttore e differenziale (proprio o di gruppo). Una linea «Sottoquadro» diventa un quadro con le sue linee qui sotto.
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ADD_KINDS.filter((k) => !boardId || k !== 'sottoquadro').map((k) => (
          <button key={k} onClick={() => add(k)} className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[0.71875rem] text-slate-200 hover:border-sky-500 hover:bg-slate-800">
            <Plus size={12} /> {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-700 p-6 text-center text-[0.75rem] text-slate-400">Nessuna linea: aggiungine una con i pulsanti qui sopra.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[72rem] border-separate border-spacing-y-1 text-[0.71875rem]">
            <thead className="text-left text-[0.65625rem] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-1 font-medium">Sigla</th>
                <th className="px-1 font-medium">Nome</th>
                {tri && <th className="px-1 font-medium">Fasi</th>}
                {tri && <th className="px-1 font-medium">Fase</th>}
                <th className="px-1 font-medium">P [W]</th>
                <th className="px-1 font-medium">cos φ</th>
                <th className="px-1 font-medium">ku</th>
                <th className="px-1 font-medium">L [m]</th>
                <th className="px-1 font-medium">Posa</th>
                <th className="px-1 font-medium">Isol.</th>
                <th className="px-1 font-medium">°C</th>
                <th className="px-1 font-medium" title="Circuiti raggruppati nella stessa canalizzazione">Circ.</th>
                <th className="px-1 font-medium">Curva</th>
                <th className="px-1 font-medium">Differenziale</th>
                <th className="px-1 font-medium" title="Alimenta componenti in un bagno o doccia">Bagno</th>
                <th className="px-1 font-medium">Ib</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const lr = resOf(l.id);
                const isSub = isSubBoard(p, l);
                const rcdOpts = ['m:0', 'm:30', 'm:100', 'm:300', ...groups.map((g) => `g:${g.id}`)];
                return (
                  <tr key={l.id} className="bg-slate-950/50 align-middle">
                    <td className="rounded-l-md px-1 py-1 font-mono text-slate-400">{lr?.tag ?? `#${i + 1}`}</td>
                    <td className="w-[12rem] px-1">
                      <TextInput value={l.name} onChange={(v) => setLine(l.id, { name: v })} />
                    </td>
                    {tri && (
                      <td className="w-[5.75rem] px-1">
                        <Select value={l.phases} options={[1, 3] as const} format={(v) => (v === 1 ? '1F+N' : l.withNeutral ? '3F+N' : '3F')} onChange={(v) => setLine(l.id, { phases: v })} />
                      </td>
                    )}
                    {tri && (
                      <td className="w-[5.75rem] px-1">
                        {l.phases === 1 ? (
                          <Select value={l.phase} options={[0, 1, 2, 3] as const} format={(v) => (v ? `L${v}` : `auto${lr?.phase ? ` L${lr.phase}` : ''}`)} onChange={(v) => setLine(l.id, { phase: v })} />
                        ) : (
                          <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400" title="Neutro distribuito">
                            <input type="checkbox" className="accent-sky-500" checked={l.withNeutral} onChange={(e) => setLine(l.id, { withNeutral: e.target.checked })} /> N
                          </label>
                        )}
                      </td>
                    )}
                    {isSub ? (
                      <td colSpan={3} className="px-1 text-[0.6875rem] text-slate-400">
                        dalle sue linee: {f((lr?.sub?.simultaneousW ?? 0) / 1000, 1)} kW, cos φ {f(lr?.cosPhi ?? 1, 2)}
                      </td>
                    ) : (
                      <>
                        <td className="w-[6rem] px-1">
                          <NumberInput value={l.powerW} min={1} max={2000000} step={50} onChange={(v) => setLine(l.id, { powerW: v })} />
                        </td>
                        <td className="w-[4.5rem] px-1">
                          <NumberInput value={l.cosPhi} min={0.3} max={1} step={0.01} onChange={(v) => setLine(l.id, { cosPhi: v })} />
                        </td>
                        <td className="w-[4.5rem] px-1">
                          <NumberInput value={l.ku} min={0.05} max={1} step={0.05} onChange={(v) => setLine(l.id, { ku: v })} />
                        </td>
                      </>
                    )}
                    <td className="w-[4.5rem] px-1">
                      <NumberInput value={l.lengthM} min={1} max={2000} onChange={(v) => setLine(l.id, { lengthM: v })} />
                    </td>
                    <td className="w-[4.5rem] px-1">
                      <Select value={l.method} options={INSTALL_METHODS.map((m) => m.id)} onChange={(v) => setLine(l.id, { method: v })} />
                    </td>
                    <td className="w-[4.5rem] px-1">
                      <Select value={l.insulation} options={['PVC', 'EPR'] as Insulation[]} onChange={(v) => setLine(l.id, { insulation: v })} />
                    </td>
                    <td className="w-[4rem] px-1">
                      <NumberInput value={l.ambientC} min={10} max={60} step={5} onChange={(v) => setLine(l.id, { ambientC: v })} />
                    </td>
                    <td className="w-[3.75rem] px-1">
                      <NumberInput value={l.grouped} min={1} max={20} onChange={(v) => setLine(l.id, { grouped: v })} />
                    </td>
                    <td className="w-[4rem] px-1">
                      <Select value={l.curve} options={['B', 'C', 'D'] as const} onChange={(v) => setLine(l.id, { curve: v })} />
                    </td>
                    <td className="w-[9rem] px-1">
                      <Select
                        value={rcdValue(l)}
                        options={rcdOpts}
                        format={(v) => (v.startsWith('g:') ? `gruppo «${groups.find((g) => `g:${g.id}` === v)?.name ?? '?'}»` : v === 'm:0' ? 'nessuno' : `proprio ${v.slice(2)} mA`)}
                        onChange={(v) => setLine(l.id, v.startsWith('g:') ? { rcdGroup: v.slice(2), rcdMa: 0 } : { rcdGroup: '', rcdMa: Number(v.slice(2)) as PlantLine['rcdMa'] })}
                      />
                    </td>
                    <td className="px-1 text-center">
                      <input type="checkbox" aria-label={`${l.name} in un bagno`} className="accent-sky-500" checked={!!l.bathroom} onChange={(e) => setLine(l.id, { bathroom: e.target.checked })} />
                    </td>
                    <td className="px-1 font-mono text-slate-200">{lr ? `${f(lr.ibA, 1)} A` : '—'}</td>
                    <td className="rounded-r-md px-1">
                      <div className="flex">
                        <button
                          title="Duplica la linea"
                          aria-label={`Duplica ${l.name}`}
                          onClick={() => up((x) => ({ ...x, lines: [...x.lines, { ...l, id: newId(), name: `${l.name} 2` }] }))}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          title="Elimina la linea"
                          aria-label={`Elimina ${l.name}`}
                          onClick={() => (!isSub || window.confirm(`Eliminare il sottoquadro «${l.name}»? Le sue linee passano al quadro generale.`)) && up((x) => ({ ...x, lines: x.lines.filter((y) => y.id !== l.id) }))}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RcdGroupsCard() {
  const p = usePlant();
  const up = useImpianto((s) => s.update);
  const boards = boardsOf(p);
  const setG = (id: string, patch: Partial<RcdGroup>) => up((x) => ({ ...x, rcdGroups: x.rcdGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  return (
    <Card
      title="Differenziali di gruppo"
      right={
        <button
          onClick={() => up((x) => ({ ...x, rcdGroups: [...x.rcdGroups, { id: `g${newId()}`, name: `Gruppo ${x.rcdGroups.length + 1}`, boardId: '', idnMa: 30, type: 'A', s: false }] }))}
          className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[0.71875rem] text-slate-200 hover:border-sky-500 hover:bg-slate-800"
        >
          <Plus size={12} /> Differenziale di gruppo
        </button>
      }
    >
      <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">
        Un differenziale puro protegge più linee dello stesso quadro: dividere le linee su più differenziali evita che un guasto spenga tutto. Assegna le linee al gruppo con la colonna «Differenziale».
      </p>
      {p.rcdGroups.length === 0 ? (
        <p className="text-[0.75rem] text-slate-500">Nessun differenziale di gruppo: ogni linea usa il suo differenziale.</p>
      ) : (
        <div className="space-y-2">
          {p.rcdGroups.map((g) => (
            <div key={g.id} className="grid items-end gap-2 rounded-md bg-slate-950/50 p-2 sm:grid-cols-[minmax(0,1fr)_10rem_6rem_5rem_auto_auto]">
              <Field label="Nome">
                <TextInput value={g.name} onChange={(v) => setG(g.id, { name: v })} />
              </Field>
              <Field label="Quadro">
                <Select value={g.boardId} options={boards.map((b) => b.id)} format={(v) => boards.find((b) => b.id === v)?.name ?? v} onChange={(v) => setG(g.id, { boardId: v })} />
              </Field>
              <Field label="IΔn">
                <Select value={g.idnMa} options={[30, 100, 300, 500] as const} format={(v) => `${v} mA`} onChange={(v) => setG(g.id, { idnMa: v })} />
              </Field>
              <Field label="Tipo">
                <Select value={g.type} options={['AC', 'A', 'F', 'B'] as const} onChange={(v) => setG(g.id, { type: v })} />
              </Field>
              <label className="flex items-center gap-1.5 pb-2 text-[0.75rem] text-slate-300">
                <input type="checkbox" className="accent-sky-500" checked={g.s} onChange={(e) => setG(g.id, { s: e.target.checked })} /> S
              </label>
              <button
                aria-label={`Elimina ${g.name}`}
                onClick={() => up((x) => ({ ...x, rcdGroups: x.rcdGroups.filter((y) => y.id !== g.id), lines: x.lines.map((l) => (l.rcdGroup === g.id ? { ...l, rcdGroup: '', rcdMa: 30 } : l)) }))}
                className="mb-1 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ 3. quadri e verifiche

function BoardStep({ r }: { r: PlantResult }) {
  const p = usePlant();
  const up = useImpianto((s) => s.update);
  const [open, setOpen] = useState<string | null>(null);
  const [diagram, setDiagram] = useState('');
  const [multi, setMulti] = useState(false);
  const board = r.boards.find((b) => b.id === diagram) ? diagram : '';
  return (
    <div className="space-y-4">
      <Card title="Quadro generale" right={<StatusIcon s={r.main.status} size={16} />}>
        <CheckList checks={r.main.checks} />
        {(r.pfc.suggestedKvar || p.pfcKvar > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-[0.75rem]">
            <span className="text-slate-400">Rifasamento sul quadro generale:</span>
            <div className="w-[9rem]">
              <Select<number> value={p.pfcKvar} options={[0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400]} format={(v) => (v ? `${v} kvar` : 'nessuno')} onChange={(v) => up((x) => ({ ...x, pfcKvar: v }))} />
            </div>
            {r.pfc.suggestedKvar && p.pfcKvar !== r.pfc.suggestedKvar && (
              <button onClick={() => up((x) => ({ ...x, pfcKvar: r.pfc.suggestedKvar! }))} className="rounded-md bg-sky-600 px-2 py-1 font-semibold text-white hover:bg-sky-500">
                Usa {r.pfc.suggestedKvar} kvar (cos φ 0,95)
              </button>
            )}
          </div>
        )}
      </Card>
      {r.boards.map((b) => (
        <Card key={b.id || 'qg'} title={b.id ? `Sottoquadro «${b.name}»` : 'Linee del quadro generale'} right={b.feeder ? <span className="text-[0.71875rem] text-slate-400">Icc al quadro {fA(b.lines[0]?.iccOriginA ?? 0)} · ΔV all'arrivo {f(b.feeder.dropTotPct, 2)}%</span> : null}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-[0.75rem]">
              <thead className="text-left text-[0.65625rem] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="py-1.5 pr-2 font-medium" />
                  <th className="py-1.5 pr-2 font-medium">Linea</th>
                  <th className="py-1.5 pr-2 font-medium">Ib</th>
                  <th className="py-1.5 pr-2 font-medium">Protezione</th>
                  <th className="py-1.5 pr-2 font-medium">Cavo</th>
                  <th className="py-1.5 pr-2 font-medium">Iz</th>
                  <th className="py-1.5 pr-2 font-medium">ΔV tot.</th>
                  <th className="py-1.5 pr-2 font-medium">Icc fondo</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((lr) => (
                  <LineRow key={lr.line.id} lr={lr} open={open === lr.line.id} toggle={() => setOpen(open === lr.line.id ? null : lr.line.id)} maxDrop={p.maxDropPct} />
                ))}
              </tbody>
            </table>
          </div>
          {b.lines.length === 0 && <p className="text-[0.75rem] text-slate-400">Nessuna linea in questo quadro.</p>}
        </Card>
      ))}
      <Card
        title={multi ? 'Schema multifilare' : 'Schema unifilare'}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-slate-950 p-0.5" role="group" aria-label="Tipo di schema">
              {(['Unifilare', 'Multifilare'] as const).map((t, i) => (
                <button key={t} onClick={() => setMulti(i === 1)} aria-pressed={multi === (i === 1)} className={`rounded px-2 py-1 text-[0.71875rem] ${multi === (i === 1) ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  {t}
                </button>
              ))}
            </div>
            {r.boards.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {r.boards.map((b) => (
                  <button key={b.id || 'qg'} onClick={() => setDiagram(b.id)} className={`rounded px-2 py-1 text-[0.71875rem] ${board === b.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      >
        {multi && (
          <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-slate-400">
            {(['L1', 'L2', 'L3', 'N', 'PE'] as const).map((w) => (
              <span key={w} className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4" style={{ background: WIRE_SCREEN[w] }} />
                {w === 'N' ? 'N (blu)' : w === 'PE' ? 'PE (giallo-verde)' : w}
              </span>
            ))}
          </p>
        )}
        <Diagram r={r} boardId={board} multi={multi} />
      </Card>
    </div>
  );
}

function LineRow({ lr, open, toggle, maxDrop }: { lr: LineResult; open: boolean; toggle: () => void; maxDrop: number }) {
  const up = useImpianto((s) => s.update);
  const l = lr.line;
  const setLine = (patch: Partial<PlantLine>) => up((x) => ({ ...x, lines: x.lines.map((y) => (y.id === l.id ? { ...y, ...patch } : y)) }));
  const rcdText = lr.line.rcdGroup ? ` · gruppo` : l.rcdMa ? ` · ${l.rcdMa} mA ${l.rcdType}` : '';
  return (
    <>
      <tr className="cursor-pointer border-b border-slate-800/70 hover:bg-slate-800/40" onClick={toggle}>
        <td className="py-1.5 pr-2">
          <div className="flex items-center gap-1">
            {open ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
            <StatusIcon s={lr.status} />
          </div>
        </td>
        <td className="py-1.5 pr-2">
          <span className="font-mono text-slate-500">{lr.tag}</span> <span className="text-slate-100">{l.name}</span>
          {lr.phase && <span className="ml-1 text-[0.6875rem] text-slate-500">L{lr.phase}</span>}
          {l.bathroom && <span className="ml-1 text-[0.6875rem] text-sky-300">bagno</span>}
        </td>
        <td className="py-1.5 pr-2 font-mono">{f(lr.ibA, 1)} A</td>
        <td className="py-1.5 pr-2 font-mono">
          {lr.inA ? `${lr.inA > 63 ? 'In ' : l.curve}${lr.inA}` : '—'}
          {l.inOverride ? '*' : ''} · {lr.icuKA ?? '—'} kA{rcdText}
        </td>
        <td className="py-1.5 pr-2 font-mono">
          {lr.designation}
          {l.sectionOverride ? '*' : ''} · {f(l.lengthM, 0)} m
        </td>
        <td className="py-1.5 pr-2 font-mono">{lr.izA ? fA(lr.izA) : '—'}</td>
        <td className={`py-1.5 pr-2 font-mono ${lr.dropTotPct > maxDrop ? 'text-amber-200' : ''}`}>{f(lr.dropTotPct, 2)}%</td>
        <td className="py-1.5 pr-2 font-mono">{lr.iccMinA ? fA(lr.iccMinA) : '—'}</td>
      </tr>
      {open && (
        <tr className="border-b border-slate-800/70 bg-slate-950/40">
          <td />
          <td colSpan={7} className="py-3 pr-2">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
              <CheckList checks={lr.checks} />
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                <Field label="Corrente nominale" hint="Automatica = la taglia più piccola ≥ Ib">
                  <Select<number> value={l.inOverride ?? 0} options={[0, ...IN_ALL]} format={(v) => (v ? `${v} A` : `automatica (${lr.inA ?? '—'} A)`)} onChange={(v) => setLine({ inOverride: v || undefined })} />
                </Field>
                <Field label="Sezione" hint="Automatica = la più piccola che supera tutte le verifiche">
                  <Select<number>
                    value={l.sectionOverride ?? 0}
                    options={[0, ...SECTIONS]}
                    format={(v) => (v ? `${f(v, v % 1 ? 1 : 0)} mm²` : `automatica (${lr.designation})`)}
                    onChange={(v) => setLine({ sectionOverride: (v || undefined) as WireSection | undefined })}
                  />
                </Field>
                {!l.rcdGroup && l.rcdMa > 0 && (
                  <Field label="Tipo di differenziale">
                    <Select value={l.rcdType} options={['AC', 'A', 'F', 'B'] as const} onChange={(v) => setLine({ rcdType: v })} />
                  </Field>
                )}
                {l.kind === 'sottoquadro' && !l.rcdGroup && l.rcdMa > 0 && (
                  <label className="flex items-center gap-1.5 text-[0.75rem] text-slate-300">
                    <input type="checkbox" className="accent-sky-500" checked={!!l.rcdS} onChange={(e) => setLine({ rcdS: e.target.checked })} /> Differenziale selettivo (S)
                  </label>
                )}
                {l.kind === 'motore' && (
                  <Field label="Avviamento">
                    <Select value={l.starting ?? 'diretto'} options={['diretto', 'stella-triangolo', 'inverter'] as const} onChange={(v) => setLine({ starting: v })} />
                  </Field>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Diagram({ r, boardId, multi }: { r: PlantResult; boardId: string; multi: boolean }) {
  const p = usePlant();
  const d = useMemo(() => (multi ? multiLine(p, r, boardId) : singleLine(p, r, boardId)), [p, r, boardId, multi]);
  return (
    <div className="overflow-x-auto rounded-md bg-slate-950 p-2">
      <svg width={d.width} height={d.height} viewBox={`0 0 ${d.width} ${d.height}`} role="img" aria-label="Schema unifilare del quadro" className="block">
        {d.prims.map((pr, i) => (
          <PrimSvg key={i} p={pr} />
        ))}
      </svg>
    </div>
  );
}

const STROKE = { ok: '#94a3b8', warn: '#fbbf24', error: '#f87171' } as const;

function PrimSvg({ p }: { p: Prim }) {
  if (p.t === 'line') return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.wire ? WIRE_SCREEN[p.wire] : '#cbd5e1'} strokeWidth={p.bold ? 3 : p.wire ? 1.4 : 1.2} strokeDasharray={p.dash ? '5 3' : undefined} />;
  if (p.t === 'rect') return <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={2} fill="#0f172a" stroke={STROKE[p.tone ?? 'ok']} strokeWidth={1.4} />;
  if (p.t === 'circle') return p.dot ? <circle cx={p.cx} cy={p.cy} r={p.r} fill={WIRE_SCREEN[p.dot]} /> : <circle cx={p.cx} cy={p.cy} r={p.r} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1.2} />;
  return (
    <text
      x={p.x}
      y={p.y}
      fontSize={p.size}
      textAnchor={p.anchor ?? 'start'}
      fill={p.muted ? '#94a3b8' : '#e2e8f0'}
      fontWeight={p.bold ? 600 : 400}
      transform={p.rot ? `rotate(-90 ${p.x} ${p.y})` : undefined}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
    >
      {p.s}
    </text>
  );
}

// ------------------------------------------------------------------ 4. terra e materiali

function EarthStep({ r }: { r: PlantResult }) {
  const p = usePlant();
  const up = useImpianto((s) => s.update);
  const set = (patch: Partial<Plant>) => up((x) => ({ ...x, ...patch }));
  const bom = useMemo(() => billOfMaterials(p, r), [p, r]);
  const groups = [...new Set(bom.map((b) => b.group))];
  return (
    <div className="space-y-4">
      <Card title="Impianto di terra">
        {r.earth.tt && (
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Field label="Resistenza di terra di progetto RA">
              <NumberInput value={p.raOhm} min={0.1} max={5000} suffix="Ω" onChange={(v) => set({ raOhm: v })} />
            </Field>
            <Field label="Resistività del terreno" hint="Argilla 20–100, terreno sabbioso 200–1000, roccia oltre 1000 Ω·m (valori indicativi)">
              <NumberInput value={p.soilOhmM} min={1} max={10000} suffix="Ω·m" onChange={(v) => set({ soilOhmM: v })} />
            </Field>
            <Field label="Lunghezza dei picchetti">
              <NumberInput value={p.rodLengthM} min={0.5} max={6} step={0.5} suffix="m" onChange={(v) => set({ rodLengthM: v })} />
            </Field>
          </div>
        )}
        <CheckList checks={r.earth.checks} />
      </Card>
      <Card
        title="Computo dei materiali"
        right={
          <button
            onClick={() => download(pdfName(p).replace('_relazione.pdf', '_materiali.csv'), new Blob([bomCsv(bom)], { type: 'text/csv;charset=utf-8' }))}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-[0.71875rem] text-slate-200 hover:bg-slate-800"
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
        }
      >
        <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">
          Quantità ricavate dal progetto, senza prezzi e senza sfridi: per il preventivo servono i prezzi dei listini o di un prezzario regionale. Mancano scatole, tubi, canalizzazioni, frutti e apparecchi, che dipendono dalla planimetria.
        </p>
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">{g}</div>
              <table className="w-full text-[0.75rem]">
                <tbody>
                  {bom
                    .filter((b) => b.group === g)
                    .map((b) => (
                      <tr key={b.item + b.unit} className="border-b border-slate-800/60">
                        <td className="py-1 pr-3 text-slate-200">{b.item}</td>
                        <td className="w-24 py-1 text-right font-mono text-slate-100">
                          {f(b.qty, 0)} {b.unit}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ 5. documenti

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function DocsStep({ r }: { r: PlantResult }) {
  const p = usePlant();
  const up = useImpianto((s) => s.update);
  const [notes, setNotes] = useState(p.notes);
  const openInLab = () => {
    if (!window.confirm('Aprire l\'impianto nel laboratorio? Il progetto aperto ora nel laboratorio viene sostituito: salvalo prima, se ti serve.')) return;
    const s = useStore.getState();
    s.openProject(plantToProject(p));
    s.setMode('lab');
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <Card title="Relazione tecnica e tabelle">
          <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">
            La relazione raccoglie dati generali, obbligo di progetto, bilancio delle potenze, dimensionamento e verifiche di ogni linea, differenziali, impianto di terra, computo dei materiali, ipotesi di calcolo e lo schema unifilare di ogni quadro.
          </p>
          {r.errors > 0 && <p className="mb-3 text-[0.75rem] text-red-300">Ci sono {r.errors} verifiche da correggere: la relazione le riporta come tali.</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => buildPlantPdf(p, r).save(pdfName(p))} className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-sky-500">
              <FileDown size={14} /> Relazione PDF
            </button>
            <button
              onClick={() => download(pdfName(p).replace('_relazione.pdf', '_linee.csv'), new Blob([plantCsv(r)], { type: 'text/csv;charset=utf-8' }))}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-[0.75rem] text-slate-200 hover:bg-slate-800"
            >
              <FileSpreadsheet size={14} /> Tabella linee (CSV)
            </button>
          </div>
        </Card>
        <Card title="Prova il quadro nel laboratorio">
          <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">
            Ricostruisce l'impianto nel laboratorio: fornitura, quadro generale, un quadro per ogni sottoquadro, protezioni, differenziali, SPD, cavi e utilizzatori del progetto. Puoi simularlo, inserire guasti e misurare.
          </p>
          <button onClick={openInLab} className="flex items-center gap-1.5 rounded-md border border-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-sky-200 hover:bg-sky-600/20">
            <FlaskConical size={14} /> Apri nel laboratorio
          </button>
        </Card>
        <Card title="Note del progettista">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== p.notes && up((x) => ({ ...x, notes }))}
            rows={5}
            placeholder="Scelte progettuali, dati da confermare con il committente o il distributore…"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[0.75rem] text-slate-100 outline-none focus:border-sky-500"
          />
        </Card>
      </div>
      <Card title="Cosa manca per un progetto completo">
        <ul className="space-y-2 text-[0.75rem] leading-snug text-slate-300">
          <li>
            <span className="font-semibold text-slate-100">Disegni esecutivi</span>: la planimetria di questa sezione è uno schema di massima; il progetto vero ha piante in scala con percorsi delle canalizzazioni, di solito in CAD.
          </li>
          <li>
            <span className="font-semibold text-slate-100">Dotazioni minime delle abitazioni</span> (numero di prese e punti luce per livello): introdotte da una variante della CEI 64-8 successiva al 2007, non verificata qui. La planimetria conta i punti per locale per il confronto.
          </li>
          <li>
            <span className="font-semibold text-slate-100">Valutazione del rischio di fulminazione</span> (CEI EN 62305-2): stabilisce se servono gli SPD e la protezione dell'edificio. Qui si sceglie solo dove installarli.
          </li>
          <li>
            <span className="font-semibold text-slate-100">Illuminazione di sicurezza</span>: illuminamenti e autonomie dalle norme dell'attività (UNI EN 1838, prevenzione incendi). Qui ci sono le regole del circuito (Cap. 56).
          </li>
          <li>
            <span className="font-semibold text-slate-100">Altri luoghi della parte 7</span>: piscine, cantieri, locali medici, ambienti a maggior rischio d'incendio.
          </li>
          <li>
            <span className="font-semibold text-slate-100">Prezzi</span>: il computo dà le quantità, il preventivo richiede listini o prezzari.
          </li>
        </ul>
        <p className="mt-3 text-[0.6875rem] leading-snug text-slate-500">
          Le verifiche richiamano la CEI 64-8:2007, letta sul testo come studio storico: l'edizione vigente è la IX (dal 1/11/2024) e alcune prescrizioni (per esempio i bagni) sono cambiate. Portate dei cavi, curve e poteri di interruzione vanno confermati su tabelle CEI-UNEL e cataloghi dei costruttori.
        </p>
      </Card>
    </div>
  );
}
