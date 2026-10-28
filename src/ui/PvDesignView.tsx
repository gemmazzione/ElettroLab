import { FileDown, RotateCcw, Sun, Wand2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PvCheck } from '../engine/pv';
import { INSTALL_METHODS, type InstallMethod } from '../rules/ampacity';
import { computeDesign, f, moduleCount, peakW, proposeSizing, stringsPerMppt, type DesignResults, type MonthResult } from '../pvdesign/calc';
import { INVERTERS, LOAD_PROFILES, MODULES, MONTH_DAYS, MONTHS, MOUNTINGS, SITES, type LoadProfileId, type MountingId } from '../pvdesign/data';
import { isHybrid, type PvDesign } from '../pvdesign/design';
import { usePvDesign } from '../pvdesign/store';
import { designToProject } from '../pvdesign/toProject';
import { useStore } from '../store/projectStore';
import { Field, NumberInput, Select, TextInput } from './fields';

/** Sezione «Progetta FV»: progettazione guidata di un impianto fotovoltaico domestico con calcoli e costi. */
export function PvDesignView() {
  const d = usePvDesign((s) => s.design);
  const reload = usePvDesign((s) => s.reload);
  useEffect(() => reload(), [reload]);
  const r = useMemo(() => computeDesign(d), [d]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <header>
            <div className="flex items-center gap-2 text-amber-400">
              <Sun size={18} />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Progetta FV</span>
            </div>
            <h1 className="mt-1 text-[20px] font-semibold text-white">Progettazione di un impianto fotovoltaico</h1>
            <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-slate-400">
              Sei passi: sito, consumi, generatore e inverter, cavi e protezioni, produzione, costi. I risultati si aggiornano a ogni modifica. Dati climatici, prodotti e prezzi sono
              indicativi e modificabili: il risultato è uno studio di fattibilità, non un progetto esecutivo né una verifica di conformità.
            </p>
          </header>
          <SiteStep />
          <ConsumptionStep />
          <GeneratorStep r={r} />
          <CablesStep r={r} />
          <YieldStep r={r} />
          <CostStep r={r} />
        </div>
        <Summary r={r} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ elementi comuni

function Step({ n, title, intro, children }: { n: number; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/50">
      <header className="flex items-baseline gap-3 border-b border-slate-800 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[12px] font-bold text-amber-300">{n}</span>
        <div>
          <h2 className="text-[14px] font-semibold text-white">{title}</h2>
          {intro && <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{intro}</p>}
        </div>
      </header>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{children}</div>;

function Num({ label, value, onChange, suffix, min, max, step, hint }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput value={value} onChange={onChange} suffix={suffix} min={min} max={max} step={step} />
    </Field>
  );
}

function useUpdate() {
  return usePvDesign((s) => s.update);
}

function Checks({ checks }: { checks: PvCheck[] }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2 rounded-md bg-slate-950/60 px-3 py-2">
          <span className={`mt-0.5 shrink-0 text-[12px] font-bold ${c.ok === true ? 'text-emerald-400' : c.ok === false ? 'text-red-400' : 'text-amber-300'}`}>
            {c.ok === true ? '✓' : c.ok === false ? '✗' : '!'}
          </span>
          <div>
            <div className="text-[12px] font-medium text-slate-100">{c.title}</div>
            <div className="text-[11.5px] leading-snug text-slate-400">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Notes({ title, notes, ok }: { title: string; notes: string[]; ok?: boolean }) {
  return (
    <div className="rounded-md bg-slate-950/60 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-slate-100">
        {ok !== undefined && <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>}
        {title}
      </div>
      <ul className="list-disc space-y-1 pl-4 text-[11.5px] leading-snug text-slate-400">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-slate-950/60 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-[16px] font-semibold text-white">{value}</div>
      {sub && <div className="text-[10.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

const eur = (v: number) => `${f(v)} €`;

// ------------------------------------------------------------------ 1. sito

function SiteStep() {
  const s = usePvDesign((x) => x.design.site);
  const name = usePvDesign((x) => x.design.name);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['site']>) => up((d) => ({ ...d, site: { ...d.site, ...patch } }));
  const [table, setTable] = useState(false);
  const yearH = s.hDay.reduce((a, h, i) => a + h * (MONTH_DAYS[i] ?? 30), 0);
  return (
    <Step n={1} title="Sito e orientamento" intro="Dove si trova l'impianto e come sono rivolti i moduli. I dati climatici delle tre zone sono ordini di grandezza: per un progetto vero inserisci quelli del sito (UNI 10349, PVGIS).">
      <Grid>
        <div className="col-span-2">
          <Field label="Nome del progetto">
            <TextInput value={name} onChange={(v) => up((d) => ({ ...d, name: v }))} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Zona climatica (dati indicativi)">
            <Select
              value={s.presetId}
              options={[...SITES.map((x) => x.id), 'custom']}
              format={(id) => SITES.find((x) => x.id === id)?.label ?? 'Dati personalizzati'}
              onChange={(id) => {
                const p = SITES.find((x) => x.id === id);
                if (p) set({ presetId: id, latitude: p.latitude, hDay: [...p.hDay], tMean: [...p.tMean], tMin: p.tMin, tMax: p.tMax });
                else set({ presetId: 'custom' });
              }}
            />
          </Field>
        </div>
        <Num label="Latitudine" value={s.latitude} onChange={(v) => set({ latitude: v, presetId: 'custom' })} suffix="°N" min={30} max={60} step={0.1} />
        <Num label="Inclinazione dei moduli" value={s.tilt} onChange={(v) => set({ tilt: v })} suffix="°" min={0} max={90} hint="0° = orizzontali, 90° = verticali" />
        <Num label="Orientamento (azimut)" value={s.azimuth} onChange={(v) => set({ azimuth: v })} suffix="°" min={-180} max={180} hint="0° = sud, −90° = est, +90° = ovest, 180° = nord" />
        <Num label="Ombreggiamento medio" value={s.shadingPct} onChange={(v) => set({ shadingPct: v })} suffix="%" min={0} max={60} step={0.5} />
        <Num label="Temperatura minima di progetto" value={s.tMin} onChange={(v) => set({ tMin: v, presetId: 'custom' })} suffix="°C" min={-40} max={20} />
        <Num label="Temperatura massima di progetto" value={s.tMax} onChange={(v) => set({ tMax: v, presetId: 'custom' })} suffix="°C" min={20} max={55} />
        <Num label="Albedo del suolo" value={s.albedo} onChange={(v) => set({ albedo: v })} min={0} max={0.9} step={0.05} hint="Erba 0,2; cemento 0,3; neve fresca 0,8" />
        <Num label="Superficie disponibile" value={s.roofM2} onChange={(v) => set({ roofM2: v })} suffix="m²" min={0} hint="0 = non verificare" />
        <div className="col-span-2">
          <Field label="Montaggio dei moduli">
            <Select value={s.mounting} options={Object.keys(MOUNTINGS) as MountingId[]} format={(m) => MOUNTINGS[m].label} onChange={(m) => set({ mounting: m })} />
          </Field>
        </div>
      </Grid>
      <div>
        <button className="text-[11.5px] font-medium text-sky-400 hover:text-sky-300" onClick={() => setTable((v) => !v)}>
          {table ? 'Nascondi' : 'Mostra e modifica'} i dati climatici mensili (irraggiamento orizzontale {f(yearH)} kWh/m² all'anno)
        </button>
        {table && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[11px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1 text-left font-medium">Mese</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-0.5 font-medium">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['hDay', 'Irraggiamento kWh/m² al giorno', 0.1],
                    ['tMean', 'Temperatura media °C', 1],
                  ] as const
                ).map(([key, label, step]) => (
                  <tr key={key}>
                    <td className="whitespace-nowrap py-1 pr-2 text-slate-400">{label}</td>
                    {s[key].map((v, i) => (
                      <td key={i} className="px-0.5">
                        <NumberInput
                          value={v}
                          step={step}
                          min={key === 'hDay' ? 0 : -30}
                          max={key === 'hDay' ? 10 : 45}
                          onChange={(x) => set({ [key]: s[key].map((y, j) => (j === i ? x : y)), presetId: 'custom' } as Partial<PvDesign['site']>)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Step>
  );
}

// ------------------------------------------------------------------ 2. consumi

function ConsumptionStep() {
  const c = usePvDesign((x) => x.design.consumption);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['consumption']>) => up((d) => ({ ...d, consumption: { ...d.consumption, ...patch } }));
  return (
    <Step n={2} title="Consumi della casa" intro="I consumi annui si leggono sulle bollette (somma di 12 mesi). Il profilo orario decide quanta energia si usa mentre i moduli producono.">
      <Grid>
        <Num label="Consumo annuo" value={c.annualKWh} onChange={(v) => set({ annualKWh: v })} suffix="kWh" min={100} max={50000} step={100} />
        <Num label="Potenza della fornitura" value={c.contractKW} onChange={(v) => set({ contractKW: v })} suffix="kW" min={1} max={30} step={0.5} />
        <div className="col-span-2">
          <Field label="Quando si consuma">
            <Select value={c.profile} options={Object.keys(LOAD_PROFILES) as LoadProfileId[]} format={(p) => LOAD_PROFILES[p].label} onChange={(p) => set({ profile: p })} />
          </Field>
        </div>
      </Grid>
    </Step>
  );
}

// ------------------------------------------------------------------ 3. generatore e inverter

function GeneratorStep({ r }: { r: DesignResults }) {
  const d = usePvDesign((x) => x.design);
  const up = useUpdate();
  const [note, setNote] = useState<string | null>(null);
  const [moduleData, setModuleData] = useState(false);
  const setMod = (patch: Partial<PvDesign['module']>) => up((x) => ({ ...x, module: { ...x.module, ...patch } }));
  const setInv = (patch: Partial<PvDesign['inverter']>) => up((x) => ({ ...x, inverter: { ...x.inverter, ...patch } }));
  const propose = () => {
    const p = proposeSizing(d, INVERTERS);
    if (!p) {
      setNote('Nessuna configurazione valida con questi moduli e inverter: prova un altro modulo o controlla le temperature di progetto.');
      return;
    }
    const inv = INVERTERS.find((i) => i.id === p.inverterId)!;
    up((x) => ({ ...x, modulesPerString: p.modulesPerString, strings: p.strings, inverter: { ...inv } }));
    setNote(`${p.note} Proposta: ${p.strings} ${p.strings > 1 ? 'stringhe' : 'stringa'} da ${p.modulesPerString} moduli con l'inverter «${inv.label}».${p.modulesPerString * p.strings !== p.targetModules ? ` È la configurazione più vicina che supera le verifiche di stringa con un rapporto DC/AC tra 0,8 e 1,2.` : ''}`);
  };
  return (
    <Step n={3} title="Moduli, stringhe e inverter" intro="I moduli in serie formano una stringa; le stringhe vanno sugli ingressi MPPT dell'inverter. Le verifiche usano i dati di targa e le temperature di progetto del sito.">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={propose} className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-slate-950 hover:bg-amber-400">
          <Wand2 size={14} /> Proponi il dimensionamento sui consumi
        </button>
        <span className="text-[11px] text-slate-500">Cerca la configurazione valida che produce in un anno circa quanto consumi.</span>
      </div>
      {note && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-snug text-amber-100">{note}</p>}
      <Grid>
        <div className="col-span-2">
          <Field label="Modulo">
            <Select
              value={MODULES.find((m) => m.id === d.module.id)?.id ?? d.module.id}
              options={MODULES.map((m) => m.id)}
              format={(id) => MODULES.find((m) => m.id === id)?.label ?? id}
              onChange={(id) => up((x) => ({ ...x, module: { ...MODULES.find((m) => m.id === id)! } }))}
            />
          </Field>
        </div>
        <Num label="Moduli per stringa" value={d.modulesPerString} onChange={(v) => up((x) => ({ ...x, modulesPerString: Math.round(v) }))} min={1} max={40} />
        <Num label="Stringhe" value={d.strings} onChange={(v) => up((x) => ({ ...x, strings: Math.round(v) }))} min={1} max={12} />
        <div className="col-span-2">
          <Field label="Inverter">
            <Select
              value={d.inverter.id}
              options={INVERTERS.map((i) => i.id)}
              format={(id) => INVERTERS.find((i) => i.id === id)?.label ?? id}
              onChange={(id) => up((x) => ({ ...x, inverter: { ...INVERTERS.find((i) => i.id === id)! }, batteryKWh: INVERTERS.find((i) => i.id === id)!.hybrid ? x.batteryKWh : 0 }))}
            />
          </Field>
        </div>
        {isHybrid(d) ? (
          <Num label="Capacità della batteria" value={d.batteryKWh} onChange={(v) => up((x) => ({ ...x, batteryKWh: v }))} suffix="kWh" min={0} max={40} step={0.5} hint="0 = senza accumulo" />
        ) : (
          <div className="col-span-2 self-end text-[11px] leading-snug text-slate-500">Per l'accumulo scegli un inverter ibrido.</div>
        )}
      </Grid>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Potenza di picco" value={`${f(peakW(d) / 1000, 2)} kWp`} sub={`${moduleCount(d)} moduli`} />
        <Kpi label="Superficie" value={`${f(moduleCount(d) * d.module.areaM2, 1)} m²`} />
        <Kpi label="Tensione Vmp stringa" value={`${f(d.modulesPerString * d.module.vmp)} V`} sub="a 25 °C" />
        <Kpi label="Stringhe per MPPT" value={`${stringsPerMppt(d)}`} sub={`${d.inverter.mppt} ingressi`} />
      </div>
      <div>
        <button className="text-[11.5px] font-medium text-sky-400 hover:text-sky-300" onClick={() => setModuleData((v) => !v)}>
          {moduleData ? 'Nascondi' : 'Modifica'} i dati di targa di modulo e inverter
        </button>
        {moduleData && (
          <div className="mt-3 space-y-3">
            <Grid>
              <Num label="Potenza modulo" value={d.module.moduleWp} onChange={(v) => setMod({ moduleWp: v })} suffix="Wp" min={50} max={800} />
              <Num label="Vmp" value={d.module.vmp} onChange={(v) => setMod({ vmp: v })} suffix="V" min={5} max={100} step={0.1} />
              <Num label="Imp" value={d.module.imp} onChange={(v) => setMod({ imp: v })} suffix="A" min={1} max={25} step={0.01} />
              <Num label="Voc" value={d.module.voc} onChange={(v) => setMod({ voc: v })} suffix="V" min={5} max={100} step={0.1} />
              <Num label="Isc" value={d.module.isc} onChange={(v) => setMod({ isc: v })} suffix="A" min={1} max={25} step={0.01} />
              <Num label="Coeff. Voc" value={d.module.tcVoc} onChange={(v) => setMod({ tcVoc: v })} suffix="%/°C" min={-1} max={0} step={0.01} />
              <Num label="Coeff. Pmax" value={d.module.tcPmax} onChange={(v) => setMod({ tcPmax: v })} suffix="%/°C" min={-1} max={0} step={0.01} />
              <Num label="NOCT" value={d.module.noct} onChange={(v) => setMod({ noct: v })} suffix="°C" min={35} max={60} />
              <Num label="Superficie modulo" value={d.module.areaM2} onChange={(v) => setMod({ areaM2: v })} suffix="m²" min={0.3} max={4} step={0.01} />
              <Num label="Fusibile massimo in serie" value={d.module.maxSeriesFuseA} onChange={(v) => setMod({ maxSeriesFuseA: v })} suffix="A" min={5} max={40} />
            </Grid>
            <Grid>
              <Num label="Potenza AC inverter" value={d.inverter.pacW} onChange={(v) => setInv({ pacW: v })} suffix="W" min={500} max={20000} step={100} />
              <Num label="Rendimento europeo" value={d.inverter.euroEff} onChange={(v) => setInv({ euroEff: v })} suffix="%" min={80} max={99.5} step={0.1} />
              <Num label="Ingressi MPPT" value={d.inverter.mppt} onChange={(v) => setInv({ mppt: Math.round(v) })} min={1} max={6} />
              <Num label="Tensione DC massima" value={d.inverter.maxDcV} onChange={(v) => setInv({ maxDcV: v })} suffix="V" min={100} max={1500} />
              <Num label="MPPT minima" value={d.inverter.mpptMinV} onChange={(v) => setInv({ mpptMinV: v })} suffix="V" min={20} max={1000} />
              <Num label="MPPT massima" value={d.inverter.mpptMaxV} onChange={(v) => setInv({ mpptMaxV: v })} suffix="V" min={50} max={1500} />
              <Num label="Corrente DC per MPPT" value={d.inverter.maxDcA} onChange={(v) => setInv({ maxDcA: v })} suffix="A" min={1} max={60} />
            </Grid>
          </div>
        )}
      </div>
      <Checks checks={r.checks} />
    </Step>
  );
}

// ------------------------------------------------------------------ 4. cavi e protezioni

const SECTION_OPTS = ['auto', 2.5, 4, 6, 10, 16] as const;

function CablesStep({ r }: { r: DesignResults }) {
  const c = usePvDesign((x) => x.design.cables);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['cables']>) => up((d) => ({ ...d, cables: { ...d.cables, ...patch } }));
  const sec = (v: number | null) => (v === null ? 'auto' : v);
  return (
    <Step n={4} title="Cavi e protezioni" intro="Sezioni dei cavi dalla portata e dalla caduta di tensione (obiettivo ≤ 1% per lato, scelta di progetto comune), poi le protezioni lato DC e lato AC.">
      <Grid>
        <Num label="Cavi DC: lunghezza stringa → inverter" value={c.dcLengthM} onChange={(v) => set({ dcLengthM: v })} suffix="m" min={1} max={300} hint="Sola andata, per ogni stringa" />
        <Field label="Sezione cavo solare">
          <Select
            value={sec(c.dcSection)}
            options={SECTION_OPTS.filter((s) => s !== 2.5)}
            format={(s) => (s === 'auto' ? `Automatica (${r.dc.section} mm²)` : `${s} mm²`)}
            onChange={(s) => set({ dcSection: s === 'auto' ? null : s })}
          />
        </Field>
        <Num label="Temperatura attorno ai cavi DC" value={c.dcAmbientC} onChange={(v) => set({ dcAmbientC: v })} suffix="°C" min={10} max={60} step={5} hint="Sul tetto, sotto i moduli, si superano facilmente i 50 °C" />
        <span />
        <Num label="Linea AC: inverter → quadro" value={c.acLengthM} onChange={(v) => set({ acLengthM: v })} suffix="m" min={1} max={200} hint="Sola andata" />
        <Field label="Sezione linea AC">
          <Select value={sec(c.acSection)} options={SECTION_OPTS} format={(s) => (s === 'auto' ? `Automatica (${r.ac.section} mm²)` : `${s} mm²`)} onChange={(s) => set({ acSection: s === 'auto' ? null : s })} />
        </Field>
        <div className="col-span-2">
          <Field label="Posa della linea AC">
            <Select value={c.acMethod} options={INSTALL_METHODS.map((m) => m.id)} format={(id: InstallMethod) => INSTALL_METHODS.find((m) => m.id === id)!.label} onChange={(m) => set({ acMethod: m })} />
          </Field>
        </div>
      </Grid>
      <div className="grid gap-2 xl:grid-cols-2">
        <Notes title={`Cavi DC: ${r.dc.section} mm², caduta ${f(r.dc.dropPct, 2)}%`} notes={r.dc.notes} ok={r.dc.ok} />
        <Notes title={`Linea AC: ${r.ac.section} mm², ${r.ac.inA} A, caduta ${f(r.ac.dropPct, 2)}%`} notes={r.ac.notes} ok={r.ac.ok} />
        <Notes
          title={`Protezioni lato DC${r.protection.fusesNeeded ? ': fusibili di stringa necessari' : ''}`}
          notes={r.protection.notes}
        />
        <Notes
          title="Protezioni lato AC"
          notes={[
            `Magnetotermico differenziale dedicato da ${r.ac.inA} A all'arrivo della linea dell'inverter. Il tipo di differenziale (A o B) dipende da cosa dichiara il costruttore sulla possibile componente continua di guasto.`,
            'Protezione di interfaccia (SPI): negli impianti piccoli è spesso integrata nell\'inverter. Limiti di potenza e prescrizioni sono quelli della CEI 0-21 e del distributore (riferimento non verificato su testo).',
            'Contatore di produzione e contatore bidirezionale di scambio sono installati dal distributore secondo la pratica di connessione.',
            'Masse (cornici dei moduli, strutture metalliche, inverter) collegate all\'impianto di terra con conduttori di protezione adeguati.',
          ]}
        />
      </div>
    </Step>
  );
}

// ------------------------------------------------------------------ 5. produzione

function YieldStep({ r }: { r: DesignResults }) {
  const y = r.yield;
  const d = usePvDesign((x) => x.design);
  const month = usePvDesign((x) => x.month);
  const setMonth = usePvDesign((x) => x.setMonth);
  const lossSum = y.losses.reduce((a, l) => a + l.kWh, 0);
  return (
    <Step
      n={5}
      title="Produzione, autoconsumo e perdite"
      intro="Calcolo a passi di 15 minuti sul giorno medio di ogni mese: irraggiamento sul piano dei moduli (modello isotropo), temperatura delle celle, perdite, limite dell'inverter, consumi e batteria."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Produzione annua" value={`${f(y.productionKWh)} kWh`} sub={`${f(y.specificYield)} kWh/kWp`} />
        <Kpi label="Irraggiamento sui moduli" value={`${f(y.hPoaYear)} kWh/m²`} sub="all'anno" />
        <Kpi label="Indice di rendimento" value={`${f(y.pr * 100, 1)}%`} sub="PR" />
        <Kpi label="Autoconsumo" value={`${f(y.selfConsumptionPct)}%`} sub={`autosufficienza ${f(y.selfSufficiencyPct)}%`} />
      </div>
      <MonthChart months={y.months} selected={month} onSelect={setMonth} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-slate-200">Giorno medio di {MONTHS[month]?.toLowerCase()}</h3>
            <select className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px]" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <DayChart m={y.months[month] ?? y.months[0]!} battery={isHybrid(d) && d.batteryKWh > 0} />
        </div>
        <div>
          <h3 className="mb-1 text-[12px] font-semibold text-slate-200">Dall'energia ideale a quella utile</h3>
          <table className="w-full text-[11.5px]">
            <tbody>
              <tr className="border-b border-slate-800">
                <td className="py-1 text-slate-300">Energia ideale (kWp × irraggiamento sui moduli)</td>
                <td className="py-1 text-right font-mono text-slate-100">{f(y.idealKWh)} kWh</td>
              </tr>
              {y.losses.map((l) => (
                <tr key={l.label} className="border-b border-slate-800/60">
                  <td className="py-0.5 text-slate-400">− {l.label}</td>
                  <td className="py-0.5 text-right font-mono text-slate-400">
                    {f(l.kWh)} kWh <span className="text-slate-600">({f((l.kWh / Math.max(1, y.idealKWh)) * 100, 1)}%)</span>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1 font-semibold text-slate-200">Energia immessa nell'impianto di casa</td>
                <td className="py-1 text-right font-mono font-semibold text-amber-300">{f(y.idealKWh - lossSum)} kWh</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
            <span className="text-slate-400">Autoconsumata</span>
            <span className="text-right font-mono">{f(y.selfKWh)} kWh</span>
            <span className="text-slate-400">Immessa in rete</span>
            <span className="text-right font-mono">{f(y.exportKWh)} kWh</span>
            <span className="text-slate-400">Prelevata dalla rete</span>
            <span className="text-right font-mono">{f(y.importKWh)} kWh</span>
            <span className="text-slate-400">Consumi totali</span>
            <span className="text-right font-mono">{f(y.consumptionKWh)} kWh</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Num label="Riflessione, spettro, basso irraggiamento" value={d.losses.opticalPct} onChange={(v) => setLoss('opticalPct', v)} suffix="%" min={0} max={15} step={0.5} />
            <Num label="Sporcamento" value={d.losses.soilingPct} onChange={(v) => setLoss('soilingPct', v)} suffix="%" min={0} max={20} step={0.5} />
            <Num label="Disaccoppiamento (mismatch)" value={d.losses.mismatchPct} onChange={(v) => setLoss('mismatchPct', v)} suffix="%" min={0} max={10} step={0.5} />
            <Num label="Fermi e indisponibilità" value={d.losses.availabilityPct} onChange={(v) => setLoss('availabilityPct', v)} suffix="%" min={0} max={10} step={0.5} />
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Il giorno medio non contiene l'alternanza di giornate serene e nuvolose: la produzione mensile è un ordine di grandezza, mentre autoconsumo e contributo della batteria risultano un po'
        ottimistici. Per un dimensionamento definitivo servono dati orari del sito (per esempio PVGIS) e i consumi misurati.
      </p>
    </Step>
  );
}

function setLoss(key: keyof PvDesign['losses'], v: number) {
  usePvDesign.getState().update((d) => ({ ...d, losses: { ...d.losses, [key]: v } }));
}

function MonthChart({ months, selected, onSelect }: { months: MonthResult[]; selected: number; onSelect: (m: number) => void }) {
  const W = 720;
  const H = 210;
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const max = Math.max(50, ...months.map((m) => Math.max(m.productionKWh, m.consumptionKWh)));
  const nice = Math.ceil(max / 100) * 100;
  const bw = (W - pad.l - pad.r) / 12;
  const y = (v: number) => H - pad.b - (v / nice) * (H - pad.t - pad.b);
  return (
    <figure>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Produzione e consumi mese per mese">
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(nice * k)} y2={y(nice * k)} stroke="#1e293b" />
            <text x={pad.l - 5} y={y(nice * k) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {f(nice * k)}
            </text>
          </g>
        ))}
        <text x={4} y={pad.t + 2} fontSize={9.5} fill="#64748b">
          kWh
        </text>
        {months.map((m, i) => {
          const x0 = pad.l + i * bw;
          const w = bw * 0.36;
          return (
            <g key={i} onClick={() => onSelect(i)} className="cursor-pointer">
              <rect x={x0} y={pad.t} width={bw} height={H - pad.t - pad.b} fill={i === selected ? '#1e293b' : 'transparent'} />
              <rect x={x0 + bw * 0.12} y={y(m.productionKWh)} width={w} height={y(0) - y(m.productionKWh)} fill="#fbbf24" fillOpacity={0.35} />
              <rect x={x0 + bw * 0.12} y={y(m.selfKWh)} width={w} height={y(0) - y(m.selfKWh)} fill="#fbbf24" />
              <rect x={x0 + bw * 0.52} y={y(m.consumptionKWh)} width={w} height={y(0) - y(m.consumptionKWh)} fill="#38bdf8" fillOpacity={0.8} />
              <text x={x0 + bw / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={i === selected ? '#f8fafc' : '#94a3b8'}>
                {MONTHS[i]}
              </text>
              <title>{`${MONTHS[i]}: prodotti ${f(m.productionKWh)} kWh (autoconsumati ${f(m.selfKWh)}), consumati ${f(m.consumptionKWh)} kWh`}</title>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#475569" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-slate-300">
        <Legend cls="bg-amber-400" label="Prodotta e autoconsumata" />
        <Legend cls="bg-amber-400/35" label="Prodotta e immessa in rete" />
        <Legend cls="bg-sky-400/80" label="Consumi" />
        <span className="text-slate-500">Clicca un mese per vederne il giorno medio.</span>
      </figcaption>
    </figure>
  );
}

const Legend = ({ cls, label }: { cls: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} /> {label}
  </span>
);

function DayChart({ m, battery }: { m: MonthResult; battery: boolean }) {
  const W = 340;
  const H = 170;
  const pad = { l: 40, r: 8, t: 8, b: 20 };
  const step = 24 / m.pv.length;
  const max = Math.max(300, ...m.pv, ...m.load);
  const x = (h: number) => pad.l + (h / 24) * (W - pad.l - pad.r);
  const y = (w: number) => H - pad.b - (w / max) * (H - pad.t - pad.b);
  const pv = `M${x(0)},${y(0)} ${m.pv.map((p, i) => `L${x(i * step)},${y(p)} L${x((i + 1) * step)},${y(p)}`).join(' ')} L${x(24)},${y(0)} Z`;
  const load = m.load.map((p, i) => `${i ? 'L' : 'M'}${x(i * step)},${y(p)} L${x((i + 1) * step)},${y(p)}`).join(' ');
  const soc = m.soc.map((s, i) => `${i ? 'L' : 'M'}${x((i + 0.5) * step)},${H - pad.b - s * (H - pad.t - pad.b)}`).join(' ');
  const kw = (w: number) => (w >= 1000 ? `${f(w / 1000, 1)} kW` : `${f(w)} W`);
  return (
    <figure>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Produzione e consumi nel giorno medio">
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="#0f172a" />
        {[0.5, 1].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * k)} y2={y(max * k)} stroke="#1e293b" />
            <text x={pad.l - 4} y={y(max * k) + 3} textAnchor="end" fontSize={8.5} fill="#94a3b8">
              {kw(max * k)}
            </text>
          </g>
        ))}
        <path d={pv} fill="#fbbf24" fillOpacity={0.35} stroke="#fbbf24" strokeWidth={1.2} />
        <path d={load} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
        {battery && <path d={soc} fill="none" stroke="#34d399" strokeWidth={1.2} strokeDasharray="3 2" />}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#475569" />
        {[0, 6, 12, 18, 24].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={8.5} fill="#94a3b8">
            {t}:00
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-slate-300">
        <Legend cls="bg-amber-400/60" label="Produzione" />
        <Legend cls="bg-sky-400" label="Consumi" />
        {battery && <Legend cls="bg-emerald-400" label="Carica della batteria (0–100%)" />}
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ 6. costi

function CostStep({ r }: { r: DesignResults }) {
  const e = usePvDesign((x) => x.design.economics);
  const deg = usePvDesign((x) => x.design.losses.degradationPct);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['economics']>) => up((d) => ({ ...d, economics: { ...d.economics, ...patch } }));
  const ec = r.economics;
  const [prices, setPrices] = useState(false);
  return (
    <Step
      n={6}
      title="Costi e ritorno dell'investimento"
      intro="Computo con un listino indicativo (IVA esclusa, modificabile), poi i flussi di cassa anno per anno: energia non acquistata, energia venduta, detrazione, manutenzione e sostituzione dell'inverter."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[11.5px]">
          <thead>
            <tr className="border-b border-slate-700 text-left text-slate-500">
              <th className="py-1 font-medium">Voce</th>
              <th className="py-1 text-right font-medium">Quantità</th>
              <th className="py-1 text-right font-medium">Prezzo</th>
              <th className="py-1 text-right font-medium">Importo</th>
            </tr>
          </thead>
          <tbody>
            {ec.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-800/60">
                <td className="py-1 text-slate-300">{l.label}</td>
                <td className="py-1 text-right font-mono text-slate-400">{l.id === 'misc' ? `${f(l.qty, 1)}%` : f(l.qty, l.qty % 1 ? 2 : 0)}</td>
                <td className="py-1 text-right font-mono text-slate-400">{l.id === 'misc' ? '' : `${f(l.price, 2)} ${l.unit}`}</td>
                <td className="py-1 text-right font-mono text-slate-100">{eur(l.total)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="pt-1.5 text-slate-300">Imponibile</td>
              <td className="pt-1.5 text-right font-mono">{eur(ec.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-slate-300">IVA {f(e.vatPct)}%</td>
              <td className="text-right font-mono">{eur(ec.vat)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="pt-1 font-semibold text-white">Totale</td>
              <td className="pt-1 text-right font-mono font-semibold text-amber-300">{eur(ec.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <button className="text-[11.5px] font-medium text-sky-400 hover:text-sky-300" onClick={() => setPrices((v) => !v)}>
          {prices ? 'Nascondi' : 'Modifica'} il listino prezzi
        </button>
        {prices && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {e.prices.map((p) => (
              <Num
                key={p.id}
                label={p.label}
                value={p.price}
                suffix={p.unit}
                min={0}
                step={0.01}
                onChange={(v) => set({ prices: e.prices.map((q) => (q.id === p.id ? { ...q, price: v } : q)) })}
              />
            ))}
          </div>
        )}
      </div>
      <Grid>
        <Num label="IVA" value={e.vatPct} onChange={(v) => set({ vatPct: v })} suffix="%" min={0} max={30} hint="Aliquota agevolata comune per gli impianti sulle abitazioni: verificare il caso specifico" />
        <Num label="Detrazione fiscale" value={e.deductionPct} onChange={(v) => set({ deductionPct: v })} suffix="%" min={0} max={110} hint="Dipende dalla normativa fiscale dell'anno e dal tipo di immobile: verificare" />
        <Num label="Anni della detrazione" value={e.deductionYears} onChange={(v) => set({ deductionYears: Math.round(v) })} min={0} max={20} />
        <Num label="Prezzo energia prelevata" value={e.importPrice} onChange={(v) => set({ importPrice: v })} suffix="€/kWh" min={0} max={2} step={0.01} hint="Costo variabile complessivo per kWh (energia, rete, oneri, imposte)" />
        <Num label="Valore energia immessa" value={e.exportPrice} onChange={(v) => set({ exportPrice: v })} suffix="€/kWh" min={0} max={1} step={0.01} hint="Per esempio ritiro dedicato: varia con il mercato" />
        <Num label="Aumento annuo dell'energia" value={e.energyInflationPct} onChange={(v) => set({ energyInflationPct: v })} suffix="%" min={-10} max={20} step={0.5} />
        <Num label="Manutenzione e assicurazione" value={e.omPerYear} onChange={(v) => set({ omPerYear: v })} suffix="€/anno" min={0} max={2000} step={10} />
        <Num label="Sostituzione inverter all'anno" value={e.inverterReplaceYear} onChange={(v) => set({ inverterReplaceYear: Math.round(v) })} min={0} max={40} hint="0 = nessuna sostituzione" />
        <Num label="Durata dell'analisi" value={e.years} onChange={(v) => set({ years: Math.round(v) })} suffix="anni" min={5} max={40} />
        <Num label="Tasso di attualizzazione" value={e.discountPct} onChange={(v) => set({ discountPct: v })} suffix="%" min={0} max={15} step={0.5} />
        <Num label="Degrado annuo dei moduli" value={deg} onChange={(v) => setLoss('degradationPct', v)} suffix="%" min={0} max={3} step={0.1} />
      </Grid>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Rientro semplice" value={ec.paybackYears === null ? 'oltre la durata' : `${f(ec.paybackYears, 1)} anni`} />
        <Kpi label="Risparmio 1° anno" value={eur(ec.firstYearSaving + ec.firstYearExport)} sub={`${eur(ec.firstYearSaving)} + ${eur(ec.firstYearExport)} venduti`} />
        <Kpi label={`Valore attuale netto (${e.years} anni)`} value={eur(ec.npv)} />
        <Kpi label="Costo dell'energia prodotta" value={`${f(ec.lcoe, 3)} €/kWh`} sub="LCOE, al netto della detrazione" />
      </div>
      <CashChart cash={ec.cashflow} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] sm:max-w-md">
        <span className="text-slate-400">Spesa energia senza impianto</span>
        <span className="text-right font-mono">{eur(ec.billBefore)} /anno</span>
        <span className="text-slate-400">Spesa energia con impianto</span>
        <span className="text-right font-mono">{eur(ec.billAfter)} /anno</span>
        <span className="text-slate-400">Detrazione totale</span>
        <span className="text-right font-mono">{eur(ec.deductionTotal)}</span>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Prezzi, aliquote, detrazioni e valore dell'energia cambiano nel tempo e da caso a caso: sostituiscili con preventivi e condizioni reali. Non sono considerati quote fisse della bolletta,
        finanziamenti, costi di connessione del distributore e variazioni di tariffa.
      </p>
    </Step>
  );
}

function CashChart({ cash }: { cash: { year: number; cumulative: number }[] }) {
  const W = 720;
  const H = 180;
  const pad = { l: 56, r: 8, t: 10, b: 22 };
  const lo = Math.min(0, ...cash.map((c) => c.cumulative));
  const hi = Math.max(0, ...cash.map((c) => c.cumulative));
  const n = cash.length - 1;
  const x = (k: number) => pad.l + (k / Math.max(1, n)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const bw = ((W - pad.l - pad.r) / Math.max(1, n)) * 0.7;
  return (
    <figure>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flusso di cassa cumulato">
        {[lo, 0, hi].map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#64748b' : '#1e293b'} />
            <text x={pad.l - 5} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {eur(v)}
            </text>
          </g>
        ))}
        {cash.map((c) => (
          <rect
            key={c.year}
            x={x(c.year) - bw / 2}
            y={Math.min(y(0), y(c.cumulative))}
            width={bw}
            height={Math.abs(y(c.cumulative) - y(0))}
            fill={c.cumulative >= 0 ? '#34d399' : '#f87171'}
            fillOpacity={0.75}
          >
            <title>{`Anno ${c.year}: ${eur(c.cumulative)}`}</title>
          </rect>
        ))}
        {cash
          .filter((c) => c.year % 5 === 0)
          .map((c) => (
            <text key={c.year} x={x(c.year)} y={H - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {c.year}
            </text>
          ))}
      </svg>
      <figcaption className="mt-1 text-[11px] text-slate-400">Flusso di cassa cumulato anno per anno: quando le barre diventano verdi l'impianto si è ripagato.</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ riepilogo

function Summary({ r }: { r: DesignResults }) {
  const d = usePvDesign((x) => x.design);
  const reset = usePvDesign((x) => x.reset);
  const openProject = useStore((s) => s.openProject);
  const setMode = useStore((s) => s.setMode);
  const [busy, setBusy] = useState(false);
  const errors = r.checks.filter((c) => c.ok === false).length + (r.dc.ok ? 0 : 1) + (r.ac.ok ? 0 : 1);
  const warnings = r.checks.filter((c) => c.ok === null).length;
  const pdf = async () => {
    setBusy(true);
    try {
      const { exportPvDesignPdf } = await import('../pvdesign/pdf');
      exportPvDesignPdf(d, r);
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="lg:sticky lg:top-5 lg:self-start">
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-[13px] font-semibold text-white">{d.name}</h2>
        <dl className="space-y-1 text-[12px]">
          {(
            [
              ['Potenza di picco', `${f(peakW(d) / 1000, 2)} kWp`],
              ['Configurazione', `${d.strings} × ${d.modulesPerString} moduli da ${d.module.moduleWp} Wp`],
              ['Inverter', `${f(d.inverter.pacW / 1000, 1)} kW${isHybrid(d) && d.batteryKWh > 0 ? ` + batteria ${f(d.batteryKWh, 1)} kWh` : ''}`],
              ['Produzione annua', `${f(r.yield.productionKWh)} kWh`],
              ['Copertura dei consumi', `${f((r.yield.productionKWh / Math.max(1, r.yield.consumptionKWh)) * 100)}%`],
              ['Autoconsumo', `${f(r.yield.selfConsumptionPct)}%`],
              ['Autosufficienza', `${f(r.yield.selfSufficiencyPct)}%`],
              ['Costo totale', eur(r.economics.total)],
              ['Costo per kWp', eur(r.economics.perKWp)],
              ['Rientro semplice', r.economics.paybackYears === null ? 'oltre la durata' : `${f(r.economics.paybackYears, 1)} anni`],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-400">{k}</dt>
              <dd className="text-right font-mono text-slate-100">{v}</dd>
            </div>
          ))}
        </dl>
        <div className={`rounded-md px-3 py-2 text-[11.5px] ${errors ? 'bg-red-500/10 text-red-200' : warnings ? 'bg-amber-500/10 text-amber-100' : 'bg-emerald-500/10 text-emerald-200'}`}>
          {errors ? `${errors} verifiche non superate: correggi la configurazione.` : warnings ? `Verifiche superate, ${warnings} da valutare.` : 'Tutte le verifiche di calcolo sono superate.'}
        </div>
        <div className="space-y-2">
          <button onClick={pdf} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-[12px] font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60">
            <FileDown size={14} /> Relazione PDF
          </button>
          <button
            onClick={() => {
              if (!window.confirm('Il progetto aperto nel laboratorio sarà sostituito da quello generato. Se ti serve, salvalo prima nella libreria. Continuare?')) return;
              openProject(designToProject(d));
              setMode('lab');
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-700 px-3 py-2 text-[12px] font-semibold text-white hover:bg-slate-600"
            title="Crea nel laboratorio lo schema con generatore, inverter, cavi e protezioni di questo progetto"
          >
            <Zap size={14} /> Apri nel laboratorio
          </button>
          <button
            onClick={() => window.confirm('Ripristinare tutti i valori iniziali del progetto fotovoltaico?') && reset()}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <RotateCcw size={13} /> Ripristina i valori iniziali
          </button>
        </div>
        <p className="text-[10.5px] leading-snug text-slate-500">
          Studio di fattibilità con modelli semplificati e dati indicativi: non sostituisce il progetto di un tecnico abilitato né la verifica delle norme CEI applicabili.
        </p>
      </div>
    </aside>
  );
}
