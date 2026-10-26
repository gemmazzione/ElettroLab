import { CheckCircle2, CircleHelp, CloudSun, Moon, RotateCcw, Sun, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { inverterDcLink } from '../engine/dc';
import { inverterDay, loadsOnW } from '../engine/pvDay';
import { DAY_SEASONS, INVERTER_STATE_TEXT, maxStringVoc, pvEnv, stringChecks, type DaySummary } from '../engine/pv';
import type { ComponentInstance, InverterParams, PvArrayParams, PvEnvironment } from '../model/types';
import { meterPower, useStore } from '../store/projectStore';
import { Field, NumberInput, Row, Section, TextInput } from './fields';
import { fmt, fmtCurrent, fmtPower } from './format';

/** Pannelli delle proprietà per generatori, inverter e misuratori. */

// ------------------------------------------------------------------ condizioni ambientali

export function PvEnvironmentSection() {
  const env = pvEnv(useStore((s) => s.project.pv));
  const commit = useStore((s) => s.commit);
  const set = (patch: Partial<PvEnvironment>) =>
    commit((p) => {
      p.pv = { ...pvEnv(p.pv), ...patch };
    });
  const presets: { label: string; icon: typeof Sun; g: number }[] = [
    { label: 'Notte', icon: Moon, g: 0 },
    { label: 'Nuvoloso', icon: CloudSun, g: 200 },
    { label: 'Velato', icon: CloudSun, g: 550 },
    { label: 'Sereno', icon: Sun, g: 1000 },
  ];
  return (
    <Section title="Sole e temperatura">
      <label className="block">
        <span className="mb-1 flex justify-between text-[11px] text-slate-400">
          <span>Irraggiamento sui moduli</span>
          <span className="font-mono text-amber-300">{fmt(env.irradiance, 0)} W/m²</span>
        </span>
        <input
          type="range"
          min={0}
          max={1100}
          step={10}
          value={env.irradiance}
          onChange={(e) => set({ irradiance: Number(e.target.value) })}
          className="w-full accent-amber-400"
          aria-label="Irraggiamento in watt al metro quadro"
        />
      </label>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => set({ irradiance: p.g })}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ring-1 ${env.irradiance === p.g ? 'bg-amber-400/15 text-amber-200 ring-amber-400/50' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}
          >
            <p.icon size={11} /> {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Temperatura ora">
          <NumberInput value={env.ambientC} min={-30} max={50} suffix="°C" onChange={(v) => set({ ambientC: v })} />
        </Field>
        <Field label="Minima del sito" hint="Serve per la tensione a vuoto massima della stringa">
          <NumberInput value={env.minAmbientC} min={-40} max={20} suffix="°C" onChange={(v) => set({ minAmbientC: v })} />
        </Field>
        <Field label="Massima del sito" hint="Serve per la tensione minima della stringa (cella calda)">
          <NumberInput value={env.maxAmbientC} min={20} max={55} suffix="°C" onChange={(v) => set({ maxAmbientC: v })} />
        </Field>
      </div>
      <p className="text-[10.5px] leading-snug text-slate-500">Valori validi per tutto il progetto. Cambiando l'irraggiamento durante la simulazione l'inverter adegua subito la potenza immessa.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ generatore

export function PvArrayEditor({ comp }: { comp: ComponentInstance }) {
  const update = useStore((s) => s.updateParams);
  if (comp.params.kind !== 'pv-array') return null;
  const p = comp.params.p;
  const set = (patch: Partial<PvArrayParams>) => update(comp.id, { kind: 'pv-array', p: { ...p, ...patch } });
  const n = Math.round(p.modulesPerString);
  return (
    <>
      <Field label="Nome / posizione">
        <TextInput value={p.name} onChange={(v) => set({ name: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Moduli in serie (stringa)">
          <NumberInput value={p.modulesPerString} min={1} max={30} onChange={(v) => set({ modulesPerString: Math.round(v) })} />
        </Field>
        <Field label="Stringhe in parallelo">
          <NumberInput value={p.strings} min={1} max={6} onChange={(v) => set({ strings: Math.round(v) })} />
        </Field>
      </div>
      <Row k="Potenza di picco" v={`${fmt((p.moduleWp * n * p.strings) / 1000, 2)} kWp (${n * p.strings} moduli)`} />
      <div className="text-[11px] font-semibold text-slate-400">Dati di targa del modulo (STC)</div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Pmax">
          <NumberInput value={p.moduleWp} min={50} max={800} step={5} suffix="Wp" onChange={(v) => set({ moduleWp: v })} />
        </Field>
        <Field label="Vmp">
          <NumberInput value={p.vmp} min={10} max={80} step={0.1} suffix="V" onChange={(v) => set({ vmp: v })} />
        </Field>
        <Field label="Imp">
          <NumberInput value={p.imp} min={1} max={25} step={0.01} suffix="A" onChange={(v) => set({ imp: v })} />
        </Field>
        <Field label="Voc">
          <NumberInput value={p.voc} min={10} max={90} step={0.1} suffix="V" onChange={(v) => set({ voc: v })} />
        </Field>
        <Field label="Isc">
          <NumberInput value={p.isc} min={1} max={25} step={0.01} suffix="A" onChange={(v) => set({ isc: v })} />
        </Field>
        <Field label="NOCT">
          <NumberInput value={p.noct} min={35} max={55} suffix="°C" onChange={(v) => set({ noct: v })} />
        </Field>
        <Field label="Coeff. Voc">
          <NumberInput value={p.tcVoc} min={-1} max={0} step={0.01} suffix="%/°C" onChange={(v) => set({ tcVoc: v })} />
        </Field>
        <Field label="Coeff. Pmax">
          <NumberInput value={p.tcPmax} min={-1} max={0} step={0.01} suffix="%/°C" onChange={(v) => set({ tcPmax: v })} />
        </Field>
        <Field label="Coeff. Isc">
          <NumberInput value={p.tcIsc} min={0} max={0.2} step={0.01} suffix="%/°C" onChange={(v) => set({ tcIsc: v })} />
        </Field>
      </div>
      <p className="text-[10.5px] leading-snug text-slate-500">Valori tipici di un modulo da 400 Wp: usa quelli della scheda tecnica del modulo reale.</p>
    </>
  );
}

export function PvArrayLive({ comp }: { comp: ComponentInstance }) {
  const res = useStore((s) => (s.result && s.result.ok ? s.result.pvArrays.get(comp.id) : undefined));
  const env = pvEnv(useStore((s) => s.project.pv));
  const project = useStore((s) => s.project);
  if (comp.params.kind !== 'pv-array' || !res) return null;
  const inv = res.inverterId ? project.components.find((c) => c.id === res.inverterId) : undefined;
  return (
    <Section title="Punto di lavoro">
      <Row k="Temperatura di cella" v={`${fmt(res.tc, 1)} °C (ambiente ${fmt(env.ambientC, 0)} °C)`} />
      <Row k="Potenza disponibile (MPP)" v={fmtPower(res.pmp)} />
      <Row k="Vmp · Imp" v={`${fmt(res.vmp, 1)} V · ${fmtCurrent(res.imp)}`} />
      <Row k="Voc · Isc" v={`${fmt(res.voc, 1)} V · ${fmtCurrent(res.isc)}`} />
      <Row k="Potenza prelevata dall'inverter" v={res.pOut > 1 ? fmtPower(res.pOut) : '—'} />
      <Row k="Tensione a vuoto massima (freddo)" v={`${fmt(maxStringVoc(comp.params.p, env.minAmbientC), 0)} V a ${fmt(env.minAmbientC, 0)} °C`} />
      <Row k="Inverter collegato" v={inv ? inv.label : 'nessuno'} />
      <p className="text-[10.5px] leading-snug text-slate-500">
        Con la luce i moduli sono sempre in tensione, anche con l'inverter spento o il sezionatore aperto: il lato DC si tratta come parte attiva.
      </p>
    </Section>
  );
}

// ------------------------------------------------------------------ inverter

export function InverterEditor({ comp }: { comp: ComponentInstance }) {
  const update = useStore((s) => s.updateParams);
  if (comp.params.kind !== 'inverter') return null;
  const p = comp.params.p;
  const set = (patch: Partial<InverterParams>) => update(comp.id, { kind: 'inverter', p: { ...p, ...patch } });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Potenza nominale AC">
          <NumberInput value={p.pacW} min={500} max={6000} step={100} suffix="W" onChange={(v) => set({ pacW: v })} />
        </Field>
        <Field label="Rendimento">
          <NumberInput value={p.efficiency} min={80} max={99.5} step={0.1} suffix="%" onChange={(v) => set({ efficiency: v })} />
        </Field>
        <Field label="Tensione DC massima">
          <NumberInput value={p.maxDcV} min={100} max={1100} step={10} suffix="V" onChange={(v) => set({ maxDcV: v })} />
        </Field>
        <Field label="Corrente DC massima">
          <NumberInput value={p.maxDcA} min={2} max={40} step={0.5} suffix="A" onChange={(v) => set({ maxDcA: v })} />
        </Field>
        <Field label="MPPT minima">
          <NumberInput value={p.mpptMinV} min={30} max={600} step={5} suffix="V" onChange={(v) => set({ mpptMinV: v })} />
        </Field>
        <Field label="MPPT massima">
          <NumberInput value={p.mpptMaxV} min={60} max={1000} step={5} suffix="V" onChange={(v) => set({ mpptMaxV: v })} />
        </Field>
        <Field label="Batteria" hint="0 = senza accumulo">
          <NumberInput value={p.batteryKWh} min={0} max={30} step={0.5} suffix="kWh" onChange={(v) => set({ batteryKWh: v })} />
        </Field>
        <Field label="Potenza batteria">
          <NumberInput value={p.batteryW} min={0} max={10000} step={100} suffix="W" onChange={(v) => set({ batteryW: v })} />
        </Field>
      </div>
      <p className="text-[10.5px] leading-snug text-slate-500">
        L'inverter si spegne se manca la rete o se la tensione di rete è fuori dalle soglie usate dal modello (0,85–1,1 volte la nominale). Le soglie reali della protezione di interfaccia sono quelle prescritte dal distributore.
      </p>
    </>
  );
}

const Verdict = ({ ok }: { ok: boolean | null }) =>
  ok === true ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" /> : ok === false ? <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" /> : <CircleHelp size={14} className="mt-0.5 shrink-0 text-amber-300" />;

export function InverterLive({ comp }: { comp: ComponentInstance }) {
  const res = useStore((s) => (s.result && s.result.ok ? s.result.inverters.get(comp.id) : undefined));
  const running = useStore((s) => s.running);
  if (comp.params.kind !== 'inverter') return null;
  return (
    <Section title="Funzionamento">
      {!running || !res ? (
        <p className="text-[12px] text-slate-500">Avvia la simulazione per vedere la produzione.</p>
      ) : (
        <>
          <p className={`text-[12.5px] font-semibold ${res.state === 'produzione' ? 'text-emerald-300' : res.state === 'polarità invertita' || res.state === 'tensione dc eccessiva' ? 'text-red-300' : 'text-amber-300'}`}>
            {INVERTER_STATE_TEXT[res.state]}
          </p>
          <Row k="Potenza immessa (AC)" v={fmtPower(res.pac)} />
          <Row k="Tensione e corrente AC" v={`${fmt(res.vac, 1)} V · ${fmtCurrent(res.iac)}`} />
          <Row k="Potenza DC (dopo i cavi)" v={fmtPower(res.pdc)} />
          <Row k="Tensione e corrente DC" v={`${fmt(res.vdc, 0)} V · ${fmtCurrent(res.idc)}`} />
          <Row k="Perdite nei cavi DC" v={fmtPower(res.dcLossW)} />
          {res.clipped && <p className="text-[11.5px] text-amber-200">Potenza limitata alla taglia dell'inverter (clipping).</p>}
        </>
      )}
    </Section>
  );
}

export function StringChecksSection({ comp }: { comp: ComponentInstance }) {
  const project = useStore((s) => s.project);
  const env = pvEnv(project.pv);
  const link = useMemo(() => inverterDcLink(project, comp, () => true), [project, comp]);
  if (comp.params.kind !== 'inverter') return null;
  const inv = comp.params.p;
  const arrays = [...link.arrays, ...link.reversed];
  return (
    <Section title="Dimensionamento stringa-inverter">
      {!arrays.length ? (
        <p className="text-[12px] text-slate-500">Collega un generatore fotovoltaico agli ingressi DC per le verifiche.</p>
      ) : (
        arrays.map((a) =>
          a.params.kind === 'pv-array' ? (
            <div key={a.id} className="space-y-1.5">
              {arrays.length > 1 && <div className="text-[11.5px] font-semibold text-slate-300">{a.label}</div>}
              {stringChecks(a.params.p, inv, env).map((c) => (
                <div key={c.id} className="flex gap-2 rounded-md bg-slate-950/60 p-2 text-[11.5px] leading-snug text-slate-300">
                  <Verdict ok={c.ok} />
                  <div>
                    <div className="font-semibold text-slate-200">{c.title}</div>
                    <div className="text-slate-400">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        )
      )}
      <p className="text-[10.5px] leading-snug text-slate-500">Verifiche sui dati di targa di moduli e inverter (modello semplificato): i valori ammessi sono quelli dei costruttori.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ giornata tipo

const SEASONS = DAY_SEASONS;
type Season = keyof typeof SEASONS;

export function DayProfileSection({ comp }: { comp: ComponentInstance }) {
  const project = useStore((s) => s.project);
  const [season, setSeason] = useState<Season>('mezza stagione');
  const loadW = useMemo(() => loadsOnW(project), [project]);
  const day = useMemo<DaySummary | null>(() => inverterDay(project, comp, season), [project, comp, season]);
  if (comp.params.kind !== 'inverter') return null;
  return (
    <Section title="Giornata tipo">
      <div className="flex gap-1" role="radiogroup" aria-label="Stagione">
        {(Object.keys(SEASONS) as Season[]).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={season === k}
            onClick={() => setSeason(k)}
            className={`rounded px-2 py-0.5 text-[11px] ring-1 ${season === k ? 'bg-sky-500/15 text-sky-200 ring-sky-500/50' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}
          >
            {SEASONS[k].label}
          </button>
        ))}
      </div>
      {!day ? (
        <p className="text-[12px] text-slate-500">Collega un generatore fotovoltaico per calcolare la giornata tipo.</p>
      ) : (
        <>
          <DayChart day={day} battery={comp.params.p.batteryKWh > 0} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px]">
            <Row k="Prodotta" v={`${fmt(day.producedKWh, 1)} kWh`} />
            <Row k="Consumata" v={`${fmt(day.consumedKWh, 1)} kWh`} />
            <Row k="Autoconsumata" v={`${fmt(day.selfConsumedKWh, 1)} kWh`} />
            <Row k="Immessa in rete" v={`${fmt(day.exportedKWh, 1)} kWh`} />
            <Row k="Prelevata dalla rete" v={`${fmt(day.importedKWh, 1)} kWh`} />
            <Row k="Autoconsumo" v={`${fmt(day.selfConsumptionPct, 0)} %`} />
          </div>
          <Row k="Autosufficienza (consumi coperti)" v={`${fmt(day.selfSufficiencyPct, 0)} %`} />
          <p className="text-[10.5px] leading-snug text-slate-500">
            Giornata serena idealizzata ({SEASONS[season].label.toLowerCase()}: picco {SEASONS[season].peak} W/m²), consumo costante pari agli utilizzatori accesi ora ({fmtPower(loadW)}). Serve a ragionare su autoconsumo e accumulo, non a stimare la produzione reale (orientamento, ombre, meteo).
          </p>
        </>
      )}
    </Section>
  );
}

function DayChart({ day, battery }: { day: DaySummary; battery: boolean }) {
  const W = 300;
  const H = 150;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const maxP = Math.max(500, ...day.points.map((p) => Math.max(p.pv, p.load)));
  const x = (h: number) => pad.l + (h / 24) * (W - pad.l - pad.r);
  const y = (w: number) => H - pad.b - (w / maxP) * (H - pad.t - pad.b);
  const step = 0.25;
  const pvPath = `M${x(0)},${y(0)} ${day.points.map((p) => `L${x(p.hour)},${y(p.pv)} L${x(p.hour + step)},${y(p.pv)}`).join(' ')} L${x(24)},${y(0)} Z`;
  const loadPath = day.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.hour)},${y(p.load)} L${x(p.hour + step)},${y(p.load)}`).join(' ');
  const maxSoc = Math.max(0.001, ...day.points.map((p) => p.soc));
  const socPath = day.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.hour + step / 2)},${H - pad.b - (p.soc / maxSoc) * (H - pad.t - pad.b) * 0.95}`).join(' ');
  const ticks = [0, 6, 12, 18, 24];
  return (
    <figure>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Produzione ${fmt(day.producedKWh, 1)} kWh e consumi ${fmt(day.consumedKWh, 1)} kWh nella giornata tipo`}>
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="#0f172a" />
        {[0.5, 1].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(maxP * k)} y2={y(maxP * k)} stroke="#1e293b" />
            <text x={pad.l - 4} y={y(maxP * k) + 3} textAnchor="end" fontSize={8} fill="#94a3b8">
              {fmtPower(maxP * k)}
            </text>
          </g>
        ))}
        <path d={pvPath} fill="#fbbf24" fillOpacity={0.35} stroke="#fbbf24" strokeWidth={1.2} />
        <path d={loadPath} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
        {battery && <path d={socPath} fill="none" stroke="#34d399" strokeWidth={1.2} strokeDasharray="3 2" />}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#475569" />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={8} fill="#94a3b8">
            {t}:00
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-slate-300">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/60" /> Produzione
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-sky-400" /> Consumi
        </span>
        {battery && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-emerald-400" /> Carica batteria
          </span>
        )}
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ misuratore

export function MeterSection({ comp }: { comp: ComponentInstance }) {
  const p = useStore((s) => meterPower(s.result, comp));
  const e = useStore((s) => s.meterEnergy[comp.id]);
  const running = useStore((s) => s.running);
  const update = useStore((s) => s.updateParams);
  if (comp.params.kind !== 'meter') return null;
  const reset = () => useStore.setState((s) => ({ meterEnergy: { ...s.meterEnergy, [comp.id]: { fwd: 0, rev: 0 } } }));
  const pr = comp.params.p;
  return (
    <>
      <Field label="Nome">
        <TextInput value={pr.name} onChange={(v) => update(comp.id, { kind: 'meter', p: { ...pr, name: v } })} />
      </Field>
      {running ? (
        <>
          <Row k="Potenza ora" v={`${fmtPower(Math.abs(p))} ${p < -0.5 ? '(uscita → ingresso)' : p > 0.5 ? '(ingresso → uscita)' : ''}`} />
          <Row k="Energia ingresso → uscita" v={`${fmt((e?.fwd ?? 0) / 1000, 3)} kWh`} />
          <Row k="Energia uscita → ingresso" v={`${fmt((e?.rev ?? 0) / 1000, 3)} kWh`} />
          <button onClick={reset} className="flex items-center gap-1 text-[11.5px] text-slate-400 hover:text-slate-100">
            <RotateCcw size={12} /> Azzera i contatori
          </button>
        </>
      ) : (
        <p className="text-[12px] text-slate-500">Avvia la simulazione: l'energia si accumula nel tempo simulato (usa la velocità 60× per vederla crescere).</p>
      )}
      <p className="text-[10.5px] leading-snug text-slate-500">
        Collegato tra la protezione e l'inverter conta l'energia prodotta (verso uscita → ingresso se l'alimentazione entra dall'alto). Il contatore di scambio con la rete è quello del distributore, rappresentato dal punto di fornitura.
      </p>
    </>
  );
}
