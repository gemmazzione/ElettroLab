import { Check, ChevronLeft, ChevronRight, FileDown, Home, Map as MapIcon, PencilRuler, RotateCcw, Sun, Wallet, Wand2, Zap } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeDesign, f, moduleCount, peakW, proposeSizing, stringsPerMppt, type DesignResults, type MonthResult } from '../pvdesign/calc';
import { DEFAULT_PRICES, ECONOMIC_SOURCES, INVERTERS, LOAD_PROFILES, MODULES, MONTH_DAYS, MONTHS, MOUNTINGS, PRICE_SOURCES, PRICES_CHECKED, SITES, type LoadProfileId, type MountingId } from '../pvdesign/data';
import { isHybrid, type PvDesign } from '../pvdesign/design';
import { compassName, roofLayout, ROOF_TYPES, type RoofType } from '../pvdesign/roof';
import { usePvDesign } from '../pvdesign/store';
import { designToProject } from '../pvdesign/toProject';
import { INSTALL_METHODS, type InstallMethod } from '../rules/ampacity';
import { useStore } from '../store/projectStore';
import { NumberInput, Select, TextInput } from './fields';
import { Animated, CheckSummary, FieldLabel, FlashRow, Grid, Kpi, More, Notes, Num, Step, Term } from './pvdesign/kit';
import { LoadProfileEditor } from './pvdesign/LoadProfileEditor';
import { BatteryStep, Sources } from './pvdesign/BatteryStep';

// Mappa e vista 3D caricate solo quando servono (Leaflet e three.js sono librerie pesanti).
const RoofMap = lazy(() => import('./pvdesign/RoofMap').then((m) => ({ default: m.RoofMap })));
const Roof3D = lazy(() => import('./pvdesign/Roof3D').then((m) => ({ default: m.Roof3D })));

const STEPS = ['La casa', 'Il tetto', 'Clima e ombre', 'Consumi', 'Moduli e inverter', 'Accumulo', 'Cavi e protezioni', 'Vista 3D', 'Produzione', 'Costi', 'Riepilogo'] as const;

const eur = (v: number) => `${f(v)} €`;
const payback = (y: number | null) => (y === null ? 'oltre la durata' : `${f(y, 1)} anni`);

/** Sezione «Progetta FV»: progettazione guidata, passo per passo, di un impianto fotovoltaico domestico con calcoli e costi. */
export function PvDesignView() {
  const d = usePvDesign((s) => s.design);
  const reload = usePvDesign((s) => s.reload);
  const step = usePvDesign((s) => s.step);
  const direction = usePvDesign((s) => s.direction);
  const setStep = usePvDesign((s) => s.setStep);
  const welcomed = usePvDesign((s) => s.welcomed);
  useEffect(() => reload(), [reload]);
  const r = useMemo(() => computeDesign(d), [d]);
  const done = stepStatus(d, r);
  // Passi con un problema da correggere (pallino rosso nell'elenco).
  const bad = STEPS.map((_, i) => (i === 4 && r.checks.some((c) => c.ok === false)) || (i === 6 && (!r.dc.ok || !r.ac.ok)));
  const go = (n: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
    document.getElementById('pv-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  if (!welcomed) {
    return (
      <div id="pv-scroll" className="pv-scope min-h-0 flex-1 overflow-y-auto">
        <Welcome />
      </div>
    );
  }
  const n = step + 1;
  const progress = done.filter(Boolean).length / STEPS.length;
  return (
    <div id="pv-scroll" className="pv-scope min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-[85rem] gap-5 px-4 pb-24 pt-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:pb-8 xl:grid-cols-[12.5rem_minmax(0,1fr)_18rem]">
        <StepNav step={step} done={done} bad={bad} progress={progress} go={go} />
        <div className="min-w-0 space-y-4">
          <div key={step} className={direction > 0 ? 'pv-step-fwd' : 'pv-step-back'}>
            {step === 0 && <HouseStep n={n} />}
            {step === 1 && <RoofStep n={n} />}
            {step === 2 && <SiteStep n={n} />}
            {step === 3 && <ConsumptionStep n={n} />}
            {step === 4 && <GeneratorStep n={n} r={r} />}
            {step === 5 && <BatteryStep n={n} />}
            {step === 6 && <CablesStep n={n} r={r} />}
            {step === 7 && <View3DStep n={n} />}
            {step === 8 && <YieldStep n={n} r={r} />}
            {step === 9 && <CostStep n={n} r={r} />}
            {step === 10 && <FinalStep n={n} r={r} go={go} />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => go(step - 1)}
              disabled={step === 0}
              className="flex min-w-0 items-center gap-1 rounded-md px-3 py-2 text-[0.78125rem] text-slate-300 transition-colors hover:bg-slate-800 disabled:invisible"
            >
              <ChevronLeft size={15} className="shrink-0" /> <span className="truncate">{STEPS[step - 1] ?? ''}</span>
            </button>
            {step < STEPS.length - 1 && (
              <button
                onClick={() => go(step + 1)}
                className="group flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-[0.8125rem] font-semibold text-slate-950 shadow-[0_6px_18px_-6px_rgba(245,158,11,0.6)] transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.98]"
              >
                Avanti: {STEPS[step + 1]} <ChevronRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
        <Summary r={r} />
      </div>
      <MobileSummary r={r} />
    </div>
  );
}

/** Passi completati (spunta verde nell'elenco). */
function stepStatus(d: PvDesign, r: DesignResults): boolean[] {
  const roof = d.roof.footprint.length >= 3;
  return [
    d.location.lat !== null,
    roof,
    d.site.hDay.some((h) => h > 0),
    d.consumption.annualKWh > 0,
    !r.checks.some((c) => c.ok === false),
    d.batteryKWh > 0 || d.consumption.annualKWh > 0,
    r.dc.ok && r.ac.ok,
    roof,
    r.yield.productionKWh > 0,
    r.economics.total > 0,
    false,
  ];
}

function StepNav({ step, done, bad, progress, go }: { step: number; done: boolean[]; bad: boolean[]; progress: number; go: (n: number) => void }) {
  const expert = usePvDesign((s) => s.expert);
  const setExpert = usePvDesign((s) => s.setExpert);
  const list = useRef<HTMLOListElement>(null);
  // Su schermi stretti l'elenco scorre in orizzontale: si porta in vista il passo attivo.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const ol = list.current;
    if (!el || !ol || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollTo({ left: el.offsetLeft - ol.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
  }, [step]);
  return (
    <nav className="min-w-0 lg:col-span-2 xl:sticky xl:top-5 xl:col-span-1 xl:self-start" aria-label="Passi della progettazione">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-400">
          <Sun size={18} />
          <span className="text-[0.8125rem] font-semibold text-amber-300">Progetta FV</span>
        </div>
        <span className="text-[0.71875rem] tabular-nums text-slate-400">
          Passo {step + 1} di {STEPS.length}
        </span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Completamento del progetto">
        <div className="pv-progress h-full rounded-full bg-amber-400" style={{ transform: `scaleX(${Math.max(0.03, progress)})` }} />
      </div>
      <ol ref={list} className="relative flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] xl:flex-col xl:overflow-visible">
        {STEPS.map((t, i) => (
          <li key={t} className="shrink-0">
            <button
              onClick={() => go(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.78125rem] transition-colors ${i === step ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
            >
              <span
                key={bad[i] ? 'bad' : done[i] ? 'ok' : 'n'}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65625rem] font-bold tabular-nums ${bad[i] ? 'pv-pop bg-red-500/25 text-red-200' : done[i] ? 'pv-pop bg-emerald-500/20 text-emerald-300' : i === step ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}
                aria-label={bad[i] ? 'da correggere' : done[i] ? 'completato' : undefined}
              >
                {bad[i] ? '!' : done[i] ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{t}</span>
            </button>
          </li>
        ))}
      </ol>
      <label className="mt-3 hidden cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[0.75rem] text-slate-400 hover:text-slate-200 xl:flex">
        <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} className="accent-amber-500" />
        Mostra tutte le opzioni
      </label>
    </nav>
  );
}

const Loading = () => <div className="flex h-[26.25rem] items-center justify-center rounded-lg border border-slate-800 text-[0.75rem] text-slate-400">Caricamento…</div>;

// ------------------------------------------------------------------ benvenuto

function Welcome() {
  const setWelcomed = usePvDesign((s) => s.setWelcomed);
  const setStep = usePvDesign((s) => s.setStep);
  const setExpert = usePvDesign((s) => s.setExpert);
  const start = (step: number, expert = false) => {
    setExpert(expert);
    setStep(step);
    setWelcomed(true);
  };
  const stages: [ReactNode, string, string][] = [
    [<MapIcon key="m" size={16} />, 'Trovi la casa e disegni il tetto', 'Sulla foto satellitare: bastano l\'indirizzo e quattro clic sugli angoli.'],
    [<PencilRuler key="p" size={16} />, 'Il programma dimensiona l\'impianto', 'Quanti moduli ci stanno, quale inverter, quali cavi e protezioni.'],
    [<Wallet key="w" size={16} />, 'Vedi produzione, costi e rientro', 'Mese per mese, con la vista 3D della casa e una relazione in PDF.'],
  ];
  return (
    <div className="mx-auto flex min-h-full max-w-[55rem] flex-col justify-center px-5 py-10">
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="pv-step-fwd">
          <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-white">Progettiamo insieme il tuo impianto fotovoltaico</h1>
          <p className="mt-3 max-w-[56ch] text-[0.875rem] leading-relaxed text-slate-300">
            Ti guido passo per passo, anche se è la prima volta. Ogni valore ha già un punto di partenza ragionevole: puoi cambiarlo quando vuoi, e i risultati si aggiornano subito.
          </p>
          <ol className="mt-6 space-y-4">
            {stages.map(([icon, title, text], i) => (
              <li key={title} className="pv-step-fwd flex gap-3" style={{ animationDelay: `${120 + i * 90}ms` }}>
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">{icon}</span>
                <span>
                  <span className="block text-[0.875rem] font-semibold text-slate-100">{title}</span>
                  <span className="block text-[0.8125rem] leading-snug text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={() => start(0)}
              className="group flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-[0.875rem] font-semibold text-slate-950 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.7)] transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.98]"
            >
              <Home size={17} /> Inizia dalla mia casa <ChevronRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
            <button onClick={() => start(2)} className="rounded-lg px-4 py-3 text-[0.8125rem] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
              Salto la mappa, inserisco i dati a mano
            </button>
          </div>
          <p className="mt-4 text-[0.75rem] text-slate-500">
            Ci vogliono circa 10 minuti.{' '}
            <button onClick={() => start(0, true)} className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200">
              Ho esperienza: mostrami subito tutte le opzioni
            </button>
          </p>
        </div>
        <WelcomeArt />
      </div>
    </div>
  );
}

/** Illustrazione del benvenuto: il sole sale e i moduli sul tetto si accendono uno dopo l'altro. */
function WelcomeArt() {
  const cells = Array.from({ length: 8 }, (_, i) => i);
  return (
    <svg viewBox="0 0 280 200" className="mx-auto w-full max-w-[17.5rem]" role="img" aria-label="Una casa con i moduli fotovoltaici sul tetto illuminati dal sole">
      <path d="M 30 118 Q 140 -20 250 118" fill="none" stroke="#334155" strokeDasharray="3 5" />
      <g className="pv-sun">
        <circle r="13" fill="#fbbf24" />
        <circle r="20" fill="#fbbf24" fillOpacity="0.18" />
      </g>
      {[0, 1, 2].map((i) => (
        <line key={i} x1={150 + i * 16} y1={58} x2={128 + i * 18} y2={104} stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" className="pv-ray" style={{ animationDelay: `${1.4 + i * 0.12}s` }} />
      ))}
      <path d="M 60 196 V 140 H 220 V 196 Z" fill="#e7dcc8" fillOpacity="0.92" />
      <path d="M 48 142 L 140 92 L 232 142 Z" fill="#b5532c" />
      <rect x="126" y="160" width="26" height="36" rx="2" fill="#7c5a3a" />
      <rect x="78" y="156" width="26" height="20" rx="2" fill="#93c5fd" fillOpacity="0.55" />
      <rect x="176" y="156" width="26" height="20" rx="2" fill="#93c5fd" fillOpacity="0.55" />
      {cells.map((i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        // Moduli sulla falda: parallelogrammi che seguono la pendenza del tetto.
        const x = 98 + col * 21 - row * 9;
        const y = 120 + row * 10 - col * 0;
        return (
          <path
            key={i}
            d={`M ${x} ${y} l 18 -9.8 l 7 0 l -18 9.8 Z`}
            transform={`translate(${col * 1.5} ${col * -1.6 + row * 6})`}
            className="pv-cell"
            style={{ animationDelay: `${1.6 + i * 0.09}s` }}
            stroke="#93c5fd"
            strokeWidth="0.6"
          />
        );
      })}
      <path d="M 0 196 H 280" stroke="#475569" />
    </svg>
  );
}

// ------------------------------------------------------------------ 1. la casa

function HouseStep({ n }: { n: number }) {
  const name = usePvDesign((x) => x.design.name);
  const loc = usePvDesign((x) => x.design.location);
  const up = useUpdate();
  return (
    <Step
      n={n}
      title="La casa"
      intro="Trova la casa sulla foto satellitare e disegna il contorno del tetto: da qui ricavo latitudine, clima, superficie, falde e orientamento."
      help={
        <>
          Scrivi l'indirizzo e premi <b>Cerca</b>, scegli il risultato giusto, poi premi <b>Disegna la pianta del tetto</b> e clicca gli angoli del tetto uno dopo l'altro. Per una casa
          rettangolare bastano 4 clic.
        </>
      }
    >
      <Grid>
        <div className="col-span-2">
          <FieldLabel label="Nome del progetto">
            <TextInput value={name} onChange={(v) => up((d) => ({ ...d, name: v }))} />
          </FieldLabel>
        </div>
        <div className="col-span-2 min-w-0 self-end text-[0.75rem] leading-snug text-slate-400">
          {loc.lat !== null ? (
            <>
              Posizione:{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {f(loc.lat, 5)}, {f(loc.lon ?? 0, 5)}
              </span>
              {loc.address && (
                <span className="block truncate text-slate-500" title={loc.address}>
                  {loc.address}
                </span>
              )}
            </>
          ) : (
            'Posizione non ancora scelta.'
          )}
        </div>
      </Grid>
      <Suspense fallback={<Loading />}>
        <RoofMap />
      </Suspense>
    </Step>
  );
}

// ------------------------------------------------------------------ 2. il tetto

function RoofStep({ n }: { n: number }) {
  const d = usePvDesign((x) => x.design);
  const up = useUpdate();
  const setRoof = (patch: Partial<PvDesign['roof']>) => up((x) => ({ ...x, roof: { ...x.roof, ...patch } }));
  const r = roofLayout(d);
  const flat = d.roof.type === 'piano';
  return (
    <Step
      n={n}
      title="Il tetto"
      intro={
        <>
          Il tipo di copertura e la <Term k="falda">falda</Term> su cui posare i moduli. La forma del tetto è ricostruita dalla pianta che hai disegnato.
        </>
      }
      help="Guarda la foto: se il tetto ha un colmo al centro è «a due falde»; se scende da tutti e quattro i lati è «a padiglione». Poi scegli la falda più soleggiata: ti propongo già quella più rivolta a sud."
    >
      {!r && (
        <p className="rounded-lg bg-amber-500/[0.09] px-3 py-2.5 text-[0.78125rem] text-amber-100">
          Non hai ancora disegnato la pianta del tetto (passo 1). Puoi farlo ora oppure inserire inclinazione e orientamento a mano nel passo «Clima e ombre».
        </p>
      )}
      <Grid>
        <div className="col-span-2">
          <FieldLabel label="Tipo di tetto">
            <Select value={d.roof.type} options={Object.keys(ROOF_TYPES) as RoofType[]} format={(t) => ROOF_TYPES[t]} onChange={(t) => setRoof({ type: t, slope: -1 })} />
          </FieldLabel>
        </div>
        {flat ? (
          <Num
            label="Inclinazione dei telai"
            value={d.site.tilt}
            onChange={(v) => up((x) => ({ ...x, site: { ...x.site, tilt: v } }))}
            suffix="°"
            min={0}
            max={45}
            hint="Sui tetti piani di solito 10–30°: più è alta, più distanti devono essere le file"
          />
        ) : (
          <Num label="Pendenza delle falde" value={d.roof.pitch} onChange={(v) => setRoof({ pitch: v })} suffix="°" min={3} max={60} hint="Un tetto in coppi o tegole ha di solito 15–35° (circa 30–70%)" />
        )}
        <Num label="Altezza della gronda" value={d.roof.heightM} onChange={(v) => setRoof({ heightM: v })} suffix="m" min={2.5} max={40} step={0.5} hint="Altezza da terra del bordo basso del tetto: circa 3 m per piano" />
      </Grid>
      <More label="Distanza dai bordi e posa dei moduli">
        <Grid>
          <Num label="Distanza dai bordi" value={d.roof.setbackM} onChange={(v) => setRoof({ setbackM: v })} suffix="m" min={0} max={3} step={0.1} hint="Spazio libero lungo gronda, colmo e bordi laterali" />
          <FieldLabel label="Posa dei moduli">
            <Select
              value={d.roof.orientation}
              options={['verticale', 'orizzontale'] as const}
              format={(o) => (o === 'verticale' ? 'In verticale' : 'In orizzontale')}
              onChange={(o) => setRoof({ orientation: o })}
            />
          </FieldLabel>
        </Grid>
      </More>
      {r && (
        <>
          <div>
            <h3 className="mb-2 text-[0.8125rem] font-semibold text-slate-200">Su quale falda metto i moduli?</h3>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Falda per i moduli">
              {r.geo.slopes.map((s, i) => {
                const sel = i === d.roof.slope;
                const good = Math.abs(s.azimuth) <= 45;
                return (
                  <button
                    key={i}
                    role="radio"
                    aria-checked={sel}
                    onClick={() => setRoof({ slope: i })}
                    className={`rounded-lg border px-3 py-2.5 text-left text-[0.75rem] transition-[border-color,background-color] duration-200 ${sel ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-slate-100">
                      {s.label}
                      {sel && <Check size={15} className="pv-pop text-amber-300" />}
                    </div>
                    <div className="mt-0.5 text-slate-400">
                      {f(s.tilt)}° di pendenza ·{' '}
                      <span className={good ? 'text-emerald-300' : Math.abs(s.azimuth) <= 100 ? 'text-amber-200' : 'text-red-300'}>
                        {good ? 'ottima esposizione' : Math.abs(s.azimuth) <= 100 ? 'esposizione discreta' : 'poco sole'}
                      </span>
                      {sel && ` · ci stanno ${r.layout.panels.length} moduli`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Pianta" value={`${f(r.geo.footprintM2, 0)} m²`} sub={`${f(r.geo.rect.length, 1)} × ${f(r.geo.rect.width, 1)} m`} />
            <Kpi label={flat ? 'Superficie del tetto' : 'Superficie della falda'} value={`${f(r.layout.slopeM2, 0)} m²`} />
            <Kpi label="Moduli che ci stanno" value={<Animated value={r.layout.panels.length} format={(v) => f(v)} />} sub={`fino a ${f((r.layout.panels.length * d.module.moduleWp) / 1000, 2)} kWp`} />
            <Kpi
              label={flat ? 'Distanza tra le file' : 'Altezza del colmo'}
              value={flat ? `${f(r.layout.rowPitch, 2)} m` : `${f(d.roof.heightM + r.geo.rise, 1)} m`}
              sub={flat ? `sole a ${f(r.layout.winterSunDeg, 1)}° il 21/12` : 'da terra'}
            />
          </div>
          <p className="text-[0.71875rem] leading-snug text-slate-500">
            {flat
              ? "Sul tetto piano i moduli guardano verso il lato dell'edificio più vicino al sud; le file sono distanziate perché a mezzogiorno del 21 dicembre una fila non faccia ombra alla successiva."
              : 'Disposizione a griglia con file parallele alla gronda. Camini, lucernari e antenne non sono considerati: controlla sul posto e, se serve, aumenta la distanza dai bordi.'}
          </p>
        </>
      )}
    </Step>
  );
}

// ------------------------------------------------------------------ 3. clima e ombre

function SiteStep({ n }: { n: number }) {
  const hasRoof = usePvDesign((x) => x.design.roof.footprint.length >= 3);
  const hasLoc = usePvDesign((x) => x.design.location.lat !== null);
  const s = usePvDesign((x) => x.design.site);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['site']>) => up((d) => ({ ...d, site: { ...d.site, ...patch } }));
  const yearH = s.hDay.reduce((a, h, i) => a + h * (MONTH_DAYS[i] ?? 30), 0);
  return (
    <Step
      n={n}
      title="Clima e ombre"
      intro={
        <>
          Quanto sole arriva (<Term k="irraggiamento">irraggiamento</Term>), che temperature ci sono e quante <Term k="ombre">ombre</Term> cadono sui moduli.
        </>
      }
      help={
        hasLoc
          ? 'Hai scelto la casa sulla mappa: il clima è già stimato dalla sua latitudine. Ti resta solo da indicare le ombre, se ce ne sono.'
          : 'Scegli la zona più vicina alla casa e, se non hai disegnato il tetto, indica inclinazione e orientamento dei moduli.'
      }
    >
      <Grid>
        <div className="col-span-2">
          <FieldLabel label="Clima" hint="Ordine di grandezza per l'Italia. Per un progetto vero servono i dati del sito (UNI 10349 o PVGIS).">
            <Select
              value={s.presetId}
              options={[...(hasLoc ? ['auto'] : []), ...SITES.map((x) => x.id), 'custom']}
              format={(id) => (id === 'auto' ? 'Stimato dalla posizione della casa' : (SITES.find((x) => x.id === id)?.label ?? 'Dati personalizzati'))}
              onChange={(id) => {
                const p = SITES.find((x) => x.id === id);
                if (p) set({ presetId: id, ...(hasLoc ? {} : { latitude: p.latitude }), hDay: [...p.hDay], tMean: [...p.tMean], tMin: p.tMin, tMax: p.tMax });
                else set({ presetId: id });
              }}
            />
          </FieldLabel>
        </div>
        <Num label={<Term k="ombre">Ombreggiamento</Term>} value={s.shadingPct} onChange={(v) => set({ shadingPct: v })} suffix="%" min={0} max={60} step={0.5} />
        {hasLoc ? (
          <div className="self-end text-[0.75rem] text-slate-400">
            Latitudine <span className="font-mono tabular-nums text-slate-200">{f(s.latitude, 3)}° N</span>
          </div>
        ) : (
          <Num label="Latitudine" value={s.latitude} onChange={(v) => set({ latitude: v, presetId: s.presetId === 'auto' ? 'custom' : s.presetId })} suffix="°N" min={30} max={60} step={0.1} hint="Milano 45,5; Roma 41,9; Palermo 38,1" />
        )}
        {hasRoof ? (
          <div className="col-span-2 self-end text-[0.75rem] text-slate-400">
            Moduli inclinati di <span className="font-mono text-slate-200">{f(s.tilt)}°</span>, rivolti a {compassName(s.azimuth)} (<Term k="azimut">azimut</Term>{' '}
            <span className="font-mono text-slate-200">{f(s.azimuth)}°</span>): dal tetto disegnato.
          </div>
        ) : (
          <>
            <Num label="Inclinazione dei moduli" value={s.tilt} onChange={(v) => set({ tilt: v })} suffix="°" min={0} max={90} hint="0° = orizzontali, 90° = verticali. In Italia il massimo annuo si ha con circa 30°." />
            <Num label={<Term k="azimut">Orientamento</Term>} value={s.azimuth} onChange={(v) => set({ azimuth: v })} suffix="°" min={-180} max={180} hint="0° = sud, −90° = est, +90° = ovest, 180° = nord" />
            <Num label="Superficie disponibile" value={s.roofM2} onChange={(v) => set({ roofM2: v })} suffix="m²" min={0} hint="0 = non verificare" />
          </>
        )}
      </Grid>
      <More label={`Temperature, montaggio e dati mensili (sole sull'orizzontale: ${f(yearH)} kWh/m² all'anno)`}>
        <Grid>
          <Num label="Temperatura minima" value={s.tMin} onChange={(v) => set({ tMin: v, presetId: 'custom' })} suffix="°C" min={-40} max={20} hint="La più bassa prevedibile: con il freddo la tensione dei moduli sale" />
          <Num label="Temperatura massima" value={s.tMax} onChange={(v) => set({ tMax: v, presetId: 'custom' })} suffix="°C" min={20} max={55} hint="La più alta prevedibile: con il caldo i moduli rendono meno" />
          <Num label="Albedo del suolo" value={s.albedo} onChange={(v) => set({ albedo: v })} min={0} max={0.9} step={0.05} hint="Quanto il terreno riflette la luce: erba 0,2; cemento 0,3; neve fresca 0,8" />
          <div className="col-span-2">
            <FieldLabel label="Montaggio dei moduli" hint="I moduli poco ventilati si scaldano di più e rendono un po' meno">
              <Select value={s.mounting} options={Object.keys(MOUNTINGS) as MountingId[]} format={(m) => MOUNTINGS[m].label} onChange={(m) => set({ mounting: m })} />
            </FieldLabel>
          </div>
        </Grid>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-[0.6875rem]">
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
                  ['hDay', 'Sole kWh/m² al giorno', 0.1],
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
      </More>
    </Step>
  );
}

// ------------------------------------------------------------------ 4. consumi

function ConsumptionStep({ n }: { n: number }) {
  const c = usePvDesign((x) => x.design.consumption);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['consumption']>) => up((d) => ({ ...d, consumption: { ...d.consumption, ...patch } }));
  return (
    <Step
      n={n}
      title="Consumi della casa"
      intro="Quanta energia usi in un anno e in quali ore: conta molto, perché l'energia più conveniente è quella che usi mentre i moduli producono."
      help="Somma i kWh delle bollette degli ultimi 12 mesi (la voce «consumi» o «energia prelevata»). Se non li hai sotto mano, un valore di riferimento per una famiglia tipo è 2.700 kWh all'anno."
    >
      <Grid>
        <Num label="Consumo annuo" value={c.annualKWh} onChange={(v) => set({ annualKWh: v })} suffix="kWh" min={100} max={50000} step={100} hint="La somma dei consumi delle bollette di un anno" />
        <Num label="Potenza della fornitura" value={c.contractKW} onChange={(v) => set({ contractKW: v })} suffix="kW" min={1} max={30} step={0.5} hint="Si legge in bolletta: «potenza impegnata», di solito 3 kW" />
        <div className="col-span-2">
          <FieldLabel label="Quando si consuma">
            <Select
              value={c.profile}
              options={['sera', 'uniforme', 'giorno', 'manuale'] as LoadProfileId[]}
              format={(p) => LOAD_PROFILES[p].label}
              onChange={(p) => set({ profile: p, ...(p === 'manuale' && c.profile !== 'manuale' ? { customWeights: [...LOAD_PROFILES[c.profile].weights] } : {}) })}
            />
          </FieldLabel>
        </div>
      </Grid>
      {c.profile === 'manuale' ? (
        <div key="manual" className="pv-step-fwd">
          <LoadProfileEditor weights={c.customWeights} annualKWh={c.annualKWh} onChange={(w) => set({ customWeights: w })} />
        </div>
      ) : (
        <p className="text-[0.75rem] text-slate-400">
          Vuoi indicare tu le ore?{' '}
          <button onClick={() => set({ profile: 'manuale', customWeights: [...LOAD_PROFILES[c.profile].weights] })} className="font-medium text-sky-300 underline decoration-sky-700 underline-offset-2 hover:text-sky-200">
            Disegna i consumi ora per ora
          </button>
        </p>
      )}
    </Step>
  );
}

// ------------------------------------------------------------------ 5. moduli e inverter

function GeneratorStep({ n, r }: { n: number; r: DesignResults }) {
  const d = usePvDesign((x) => x.design);
  const up = useUpdate();
  const [note, setNote] = useState<string | null>(null);
  const setMod = (patch: Partial<PvDesign['module']>) => up((x) => ({ ...x, module: { ...x.module, ...patch } }));
  const setInv = (patch: Partial<PvDesign['inverter']>) => up((x) => ({ ...x, inverter: { ...x.inverter, ...patch } }));
  const propose = () => {
    const p = proposeSizing(d, INVERTERS);
    if (!p) {
      setNote('Non trovo una configurazione valida con questo modulo: prova a sceglierne un altro o a ridurre la distanza dai bordi del tetto.');
      return;
    }
    const inv = INVERTERS.find((i) => i.id === p.inverterId)!;
    up((x) => ({ ...x, modulesPerString: p.modulesPerString, strings: p.strings, inverter: { ...inv } }));
    setNote(
      `${p.note} Ho scelto ${p.strings} ${p.strings > 1 ? 'stringhe' : 'stringa'} da ${p.modulesPerString} moduli con l'inverter «${inv.label}».${p.modulesPerString * p.strings !== p.targetModules ? ' È la configurazione più vicina che supera tutte le verifiche.' : ''}`,
    );
  };
  return (
    <Step
      n={n}
      title="Moduli e inverter"
      intro={
        <>
          I moduli collegati in fila formano una <Term k="stringa">stringa</Term>; le stringhe entrano negli ingressi <Term k="mppt">MPPT</Term> dell'
          <Term k="inverter">inverter</Term>.
        </>
      }
      help="Premi il pulsante qui sotto: scelgo io moduli e inverter adatti ai tuoi consumi e al tuo tetto. Poi controlla che il riquadro delle verifiche sia verde."
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={propose}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-[0.8125rem] font-semibold text-slate-950 shadow-[0_6px_18px_-6px_rgba(245,158,11,0.6)] transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.98]"
        >
          <Wand2 size={15} /> Proponi il dimensionamento
        </button>
        <span className="text-[0.75rem] text-slate-400">Cerca la configurazione che produce in un anno circa quanto consumi.</span>
      </div>
      {note && (
        <p key={note} className="pv-pop-in rounded-lg bg-amber-500/[0.09] px-3 py-2.5 text-[0.78125rem] leading-relaxed text-amber-100">
          {note}
        </p>
      )}
      <Grid>
        <div className="col-span-2">
          <FieldLabel label="Modulo">
            <Select
              value={MODULES.find((m) => m.id === d.module.id)?.id ?? d.module.id}
              options={MODULES.map((m) => m.id)}
              format={(id) => MODULES.find((m) => m.id === id)?.label ?? id}
              onChange={(id) => up((x) => ({ ...x, module: { ...MODULES.find((m) => m.id === id)! } }))}
            />
          </FieldLabel>
        </div>
        <Num label="Moduli per stringa" value={d.modulesPerString} onChange={(v) => up((x) => ({ ...x, modulesPerString: Math.round(v) }))} min={1} max={40} hint="Quanti moduli sono collegati in fila" />
        <Num label="Stringhe" value={d.strings} onChange={(v) => up((x) => ({ ...x, strings: Math.round(v) }))} min={1} max={12} hint="Quante file di moduli entrano nell'inverter" />
        <div className="col-span-2">
          <FieldLabel label={<Term k="inverter">Inverter</Term>}>
            <Select
              value={d.inverter.id}
              options={INVERTERS.map((i) => i.id)}
              format={(id) => INVERTERS.find((i) => i.id === id)?.label ?? id}
              onChange={(id) => up((x) => ({ ...x, inverter: { ...INVERTERS.find((i) => i.id === id)! }, batteryKWh: INVERTERS.find((i) => i.id === id)!.hybrid ? x.batteryKWh : 0 }))}
            />
          </FieldLabel>
        </div>
        <div className="col-span-2 self-end text-[0.75rem] leading-snug text-slate-400">
          {isHybrid(d) && d.batteryKWh > 0 ? `Con batteria da ${f(d.batteryKWh, 1)} kWh.` : 'Senza batteria.'} L'accumulo si sceglie nel prossimo passo.
        </div>
      </Grid>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={<Term k="kwp">Potenza di picco</Term>} value={<Animated value={peakW(d) / 1000} format={(v) => `${f(v, 2)} kWp`} />} sub={`${moduleCount(d)} moduli`} />
        <Kpi label="Superficie dei moduli" value={`${f(moduleCount(d) * d.module.areaM2, 1)} m²`} />
        <Kpi label="Tensione della stringa" value={`${f(d.modulesPerString * d.module.vmp)} V`} sub="in funzionamento, a 25 °C" />
        <Kpi label={<Term k="mppt">Stringhe per MPPT</Term>} value={`${stringsPerMppt(d)}`} sub={`${d.inverter.mppt} ingressi`} />
      </div>
      <CheckSummary checks={r.checks} onFix={propose} />
      <More label="Dati di targa di modulo e inverter">
        <Grid>
          <Num label="Potenza modulo" value={d.module.moduleWp} onChange={(v) => setMod({ moduleWp: v })} suffix="Wp" min={50} max={800} />
          <Num label="Vmp" value={d.module.vmp} onChange={(v) => setMod({ vmp: v })} suffix="V" min={5} max={100} step={0.1} hint="Tensione nel punto di massima potenza" />
          <Num label="Imp" value={d.module.imp} onChange={(v) => setMod({ imp: v })} suffix="A" min={1} max={25} step={0.01} hint="Corrente nel punto di massima potenza" />
          <Num label="Voc" value={d.module.voc} onChange={(v) => setMod({ voc: v })} suffix="V" min={5} max={100} step={0.1} hint="Tensione a vuoto" />
          <Num label="Isc" value={d.module.isc} onChange={(v) => setMod({ isc: v })} suffix="A" min={1} max={25} step={0.01} hint="Corrente di cortocircuito" />
          <Num label="Coeff. Voc" value={d.module.tcVoc} onChange={(v) => setMod({ tcVoc: v })} suffix="%/°C" min={-1} max={0} step={0.01} />
          <Num label="Coeff. Pmax" value={d.module.tcPmax} onChange={(v) => setMod({ tcPmax: v })} suffix="%/°C" min={-1} max={0} step={0.01} />
          <Num label="NOCT" value={d.module.noct} onChange={(v) => setMod({ noct: v })} suffix="°C" min={35} max={60} hint="Temperatura delle celle in condizioni di funzionamento normali" />
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
      </More>
    </Step>
  );
}

// ------------------------------------------------------------------ 6. cavi e protezioni

const SECTION_OPTS = ['auto', 2.5, 4, 6, 10, 16] as const;

function CablesStep({ n, r }: { n: number; r: DesignResults }) {
  const c = usePvDesign((x) => x.design.cables);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['cables']>) => up((d) => ({ ...d, cables: { ...d.cables, ...patch } }));
  const sec = (v: number | null) => (v === null ? 'auto' : v);
  const p = r.protection;
  const results: [boolean | null, string, string][] = [
    [r.dc.ok, `Cavi dal tetto all'inverter: ${r.dc.section} mm²`, `perdita ${f(r.dc.dropPct, 2)}%`],
    [r.ac.ok, `Linea dall'inverter al quadro: ${r.ac.section} mm²`, `perdita ${f(r.ac.dropPct, 2)}%, interruttore da ${r.ac.inA} A`],
    [null, `Sezionatore e scaricatore lato moduli: almeno ${p.switchV} V`, p.fusesNeeded ? `servono fusibili di stringa${p.fuseA ? ` da ${p.fuseA} A` : ''}` : 'fusibili di stringa non necessari'],
  ];
  return (
    <Step
      n={n}
      title="Cavi e protezioni"
      intro={
        <>
          Scelgo le sezioni dei cavi per limitare il riscaldamento e la <Term k="caduta">caduta di tensione</Term>, poi le protezioni da installare.
        </>
      }
      help="Ti servono solo due misure: quanti metri di cavo dal tetto all'inverter e dall'inverter al quadro elettrico. Il resto lo calcolo io."
    >
      <Grid>
        <Num label="Dal tetto all'inverter" value={c.dcLengthM} onChange={(v) => set({ dcLengthM: v })} suffix="m" min={1} max={300} hint="Lunghezza del percorso del cavo, sola andata, per ogni stringa" />
        <Num label="Dall'inverter al quadro" value={c.acLengthM} onChange={(v) => set({ acLengthM: v })} suffix="m" min={1} max={200} hint="Lunghezza del percorso del cavo, sola andata" />
      </Grid>
      <ul className="space-y-1.5">
        {results.map(([ok, title, sub]) => (
          <li key={title} className="flex items-start gap-2.5 rounded-lg bg-slate-950/60 px-3 py-2.5">
            <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${ok === false ? 'bg-red-400' : ok ? 'bg-emerald-400' : 'bg-sky-400'}`} />
            <span className="text-[0.78125rem] leading-snug">
              <span className="font-medium text-slate-100">{title}</span>
              <span className="block text-slate-400">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <More label="Sezioni, posa e temperatura dei cavi">
        <Grid>
          <FieldLabel label="Sezione cavo solare">
            <Select
              value={sec(c.dcSection)}
              options={SECTION_OPTS.filter((s) => s !== 2.5)}
              format={(s) => (s === 'auto' ? `Automatica (${r.dc.section} mm²)` : `${s} mm²`)}
              onChange={(s) => set({ dcSection: s === 'auto' ? null : s })}
            />
          </FieldLabel>
          <Num label="Temperatura attorno ai cavi DC" value={c.dcAmbientC} onChange={(v) => set({ dcAmbientC: v })} suffix="°C" min={10} max={60} step={5} hint="Sul tetto, sotto i moduli, si superano facilmente i 50 °C" />
          <FieldLabel label="Sezione linea AC">
            <Select value={sec(c.acSection)} options={SECTION_OPTS} format={(s) => (s === 'auto' ? `Automatica (${r.ac.section} mm²)` : `${s} mm²`)} onChange={(s) => set({ acSection: s === 'auto' ? null : s })} />
          </FieldLabel>
          <div className="col-span-2 sm:col-span-3 xl:col-span-4">
            <FieldLabel label="Posa della linea AC">
              <Select value={c.acMethod} options={INSTALL_METHODS.map((m) => m.id)} format={(id: InstallMethod) => INSTALL_METHODS.find((m) => m.id === id)!.label} onChange={(m) => set({ acMethod: m })} />
            </FieldLabel>
          </div>
        </Grid>
      </More>
      <More label="Calcoli dei cavi e protezioni da installare">
        <div className="grid gap-2 xl:grid-cols-2">
          <Notes title={`Cavi DC: ${r.dc.section} mm², caduta ${f(r.dc.dropPct, 2)}%`} notes={r.dc.notes} ok={r.dc.ok} />
          <Notes title={`Linea AC: ${r.ac.section} mm², ${r.ac.inA} A, caduta ${f(r.ac.dropPct, 2)}%`} notes={r.ac.notes} ok={r.ac.ok} />
          <Notes title={`Protezioni lato DC${p.fusesNeeded ? ': fusibili di stringa necessari' : ''}`} notes={p.notes} />
          <Notes
            title="Protezioni lato AC"
            notes={[
              `Magnetotermico differenziale dedicato da ${r.ac.inA} A all'arrivo della linea dell'inverter. Il tipo di differenziale (A o B) dipende da cosa dichiara il costruttore sulla possibile componente continua di guasto.`,
              "Protezione di interfaccia (SPI): negli impianti piccoli è spesso integrata nell'inverter. Limiti di potenza e prescrizioni sono quelli della CEI 0-21 e del distributore (riferimento non verificato su testo).",
              'Contatore di produzione e contatore bidirezionale di scambio sono installati dal distributore secondo la pratica di connessione.',
              "Masse (cornici dei moduli, strutture metalliche, inverter) collegate all'impianto di terra con conduttori di protezione adeguati.",
            ]}
          />
        </div>
      </More>
    </Step>
  );
}

// ------------------------------------------------------------------ 7. vista 3D

function View3DStep({ n }: { n: number }) {
  return (
    <Step
      n={n}
      title="Vista 3D"
      intro="La tua casa ricostruita dalla pianta, con i moduli del progetto e il sole nel mese e nell'ora che scegli."
      help="Aggiungi gli alberi e gli edifici vicini con i pulsanti sotto la vista e cliccando sul terreno: la mappa delle ombre calcola quanta energia perdi in un anno, e con «Usa nel calcolo» la riporto nella produzione. Con il cursore dell'ora vedi dove cadono le ombre."
    >
      <Suspense fallback={<Loading />}>
        <Roof3D />
      </Suspense>
    </Step>
  );
}

// ------------------------------------------------------------------ 8. produzione

function YieldStep({ n, r }: { n: number; r: DesignResults }) {
  const y = r.yield;
  const d = usePvDesign((x) => x.design);
  const month = usePvDesign((x) => x.month);
  const setMonth = usePvDesign((x) => x.setMonth);
  const lossSum = y.losses.reduce((a, l) => a + l.kWh, 0);
  return (
    <Step
      n={n}
      title="Produzione e autoconsumo"
      intro="Quanta energia produce l'impianto ogni mese, quanta ne usi subito e quanta va in rete."
      help="Nel grafico il giallo pieno è l'energia che usi subito, il giallo chiaro quella che va in rete, l'azzurro i tuoi consumi. Clicca un mese per vedere una sua giornata tipo."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Produzione annua" value={<Animated value={y.productionKWh} format={(v) => `${f(v)} kWh`} />} sub={`${f(y.specificYield)} kWh per kWp`} />
        <Kpi label={<Term k="autoconsumo">Autoconsumo</Term>} value={<Animated value={y.selfConsumptionPct} format={(v) => `${f(v)}%`} />} sub={`${f(y.selfKWh)} kWh usati subito`} />
        <Kpi label={<Term k="autosufficienza">Autosufficienza</Term>} value={<Animated value={y.selfSufficiencyPct} format={(v) => `${f(v)}%`} />} sub="dei tuoi consumi" />
        <Kpi label={<Term k="pr">Rendimento</Term>} value={`${f(y.pr * 100, 1)}%`} sub="indice PR" />
      </div>
      <MonthChart months={y.months} selected={month} onSelect={setMonth} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[0.8125rem] font-semibold text-slate-200">Una giornata di {MONTHS[month]?.toLowerCase()}</h3>
            <select className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[0.75rem]" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mese">
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <DayChart m={y.months[month] ?? y.months[0]!} battery={isHybrid(d) && d.batteryKWh > 0} />
        </div>
        <div className="grid content-start grid-cols-2 gap-x-4 gap-y-1.5 self-start rounded-lg bg-slate-950/60 px-3 py-3 text-[0.78125rem]">
          <span className="text-slate-400">Energia usata subito</span>
          <span className="text-right font-mono tabular-nums">{f(y.selfKWh)} kWh</span>
          <span className="text-slate-400">Energia mandata in rete</span>
          <span className="text-right font-mono tabular-nums">{f(y.exportKWh)} kWh</span>
          <span className="text-slate-400">Energia presa dalla rete</span>
          <span className="text-right font-mono tabular-nums">{f(y.importKWh)} kWh</span>
          <span className="text-slate-400">Consumi totali</span>
          <span className="text-right font-mono tabular-nums">{f(y.consumptionKWh)} kWh</span>
        </div>
      </div>
      <More label="Dove si perde energia (e come cambiare le perdite)">
        <table className="w-full text-[0.75rem]">
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="py-1 text-slate-300">Energia ideale (kWp × sole sui moduli)</td>
              <td className="py-1 text-right font-mono tabular-nums text-slate-100">{f(y.idealKWh)} kWh</td>
            </tr>
            {y.losses.map((l) => (
              <tr key={l.label} className="border-b border-slate-800/60">
                <td className="py-0.5 text-slate-400">− {l.label}</td>
                <td className="py-0.5 text-right font-mono tabular-nums text-slate-400">
                  {f(l.kWh)} kWh <span className="text-slate-600">({f((l.kWh / Math.max(1, y.idealKWh)) * 100, 1)}%)</span>
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-1 font-semibold text-slate-200">Energia utile prodotta</td>
              <td className="py-1 text-right font-mono font-semibold tabular-nums text-amber-300">{f(y.idealKWh - lossSum)} kWh</td>
            </tr>
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label="Riflessione e spettro" value={d.losses.opticalPct} onChange={(v) => setLoss('opticalPct', v)} suffix="%" min={0} max={15} step={0.5} hint="Luce riflessa dal vetro con il sole basso e poca luce nelle giornate grigie" />
          <Num label="Sporcamento" value={d.losses.soilingPct} onChange={(v) => setLoss('soilingPct', v)} suffix="%" min={0} max={20} step={0.5} hint="Polvere, foglie, escrementi di uccelli" />
          <Num label="Disaccoppiamento" value={d.losses.mismatchPct} onChange={(v) => setLoss('mismatchPct', v)} suffix="%" min={0} max={10} step={0.5} hint="Moduli in serie mai perfettamente uguali" />
          <Num label="Fermi" value={d.losses.availabilityPct} onChange={(v) => setLoss('availabilityPct', v)} suffix="%" min={0} max={10} step={0.5} hint="Guasti, manutenzione, rete assente" />
        </div>
        <p className="text-[0.71875rem] leading-snug text-slate-500">
          Calcolo a passi di 15 minuti sul giorno medio di ogni mese (modello isotropo per il piano dei moduli). Il giorno medio non contiene l'alternanza di giornate serene e nuvolose:
          la produzione è un ordine di grandezza, autoconsumo e contributo della batteria risultano un po' ottimistici.
        </p>
      </More>
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
  const bar = { transition: 'y 0.5s cubic-bezier(0.16,1,0.3,1), height 0.5s cubic-bezier(0.16,1,0.3,1)' };
  return (
    <figure>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Produzione e consumi mese per mese">
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(nice * k)} y2={y(nice * k)} stroke="#1e293b" />
            <text x={pad.l - 5} y={y(nice * k) + 3} textAnchor="end" fontSize={12} fill="#94a3b8">
              {f(nice * k)}
            </text>
          </g>
        ))}
        <text x={4} y={pad.t + 2} fontSize={11} fill="#64748b">
          kWh
        </text>
        {months.map((m, i) => {
          const x0 = pad.l + i * bw;
          const w = bw * 0.36;
          return (
            <g key={i} onClick={() => onSelect(i)} className="cursor-pointer">
              <rect x={x0} y={pad.t} width={bw} height={H - pad.t - pad.b} rx={4} fill={i === selected ? '#1e293b' : 'transparent'} style={{ transition: 'fill 0.2s' }} />
              <rect x={x0 + bw * 0.12} y={y(m.productionKWh)} width={w} height={y(0) - y(m.productionKWh)} fill="#fbbf24" fillOpacity={0.35} style={bar} />
              <rect x={x0 + bw * 0.12} y={y(m.selfKWh)} width={w} height={y(0) - y(m.selfKWh)} fill="#fbbf24" style={bar} />
              <rect x={x0 + bw * 0.52} y={y(m.consumptionKWh)} width={w} height={y(0) - y(m.consumptionKWh)} fill="#38bdf8" fillOpacity={0.8} style={bar} />
              <text x={x0 + bw / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={i === selected ? '#f8fafc' : '#94a3b8'}>
                {MONTHS[i]}
              </text>
              <title>{`${MONTHS[i]}: prodotti ${f(m.productionKWh)} kWh (usati subito ${f(m.selfKWh)}), consumati ${f(m.consumptionKWh)} kWh`}</title>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#475569" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.71875rem] text-slate-300">
        <Legend cls="bg-amber-400" label="Prodotta e usata subito" />
        <Legend cls="bg-amber-400/35" label="Prodotta e mandata in rete" />
        <Legend cls="bg-sky-400/80" label="Consumi" />
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
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Produzione e consumi in una giornata tipo">
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} rx={3} fill="#0f172a" />
        {[0.5, 1].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * k)} y2={y(max * k)} stroke="#1e293b" />
            <text x={pad.l - 4} y={y(max * k) + 3} textAnchor="end" fontSize={10.5} fill="#94a3b8">
              {kw(max * k)}
            </text>
          </g>
        ))}
        <path d={pv} fill="#fbbf24" fillOpacity={0.35} stroke="#fbbf24" strokeWidth={1.2} />
        <path d={load} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
        {battery && <path d={soc} fill="none" stroke="#34d399" strokeWidth={1.2} strokeDasharray="3 2" />}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#475569" />
        {[0, 6, 12, 18, 24].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="#94a3b8">
            {t}:00
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 text-[0.6875rem] text-slate-300">
        <Legend cls="bg-amber-400/60" label="Produzione" />
        <Legend cls="bg-sky-400" label="Consumi" />
        {battery && <Legend cls="bg-emerald-400" label="Carica della batteria (0–100%)" />}
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ 9. costi

function CostStep({ n, r }: { n: number; r: DesignResults }) {
  const e = usePvDesign((x) => x.design.economics);
  const deg = usePvDesign((x) => x.design.losses.degradationPct);
  const up = useUpdate();
  const set = (patch: Partial<PvDesign['economics']>) => up((d) => ({ ...d, economics: { ...d.economics, ...patch } }));
  const ec = r.economics;
  return (
    <Step
      n={n}
      title="Costi e rientro"
      intro={
        <>
          Quanto costa l'impianto e in quanti anni si ripaga con il risparmio in bolletta, l'energia venduta e la <Term k="detrazione">detrazione fiscale</Term>.
        </>
      }
      help="I prezzi sono indicativi. Se hai già un preventivo, inserisci i suoi importi nel listino qui sotto: il rientro si aggiorna subito."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Costo totale" value={<Animated value={ec.total} format={eur} />} sub={`IVA inclusa, ${eur(ec.perKWp)} per kWp`} />
        <Kpi label={<Term k="rientro">Si ripaga in</Term>} value={ec.paybackYears === null ? 'oltre la durata' : <Animated value={ec.paybackYears} format={(v) => `${f(v, 1)} anni`} />} />
        <Kpi label="Risparmio del primo anno" value={<Animated value={ec.firstYearSaving + ec.firstYearExport} format={eur} />} sub={`di cui ${eur(ec.firstYearExport)} di energia venduta`} />
        <Kpi label="Bolletta dell'energia" value={`${eur(ec.billBefore)} → ${eur(Math.max(0, ec.billAfter))}`} sub="all'anno, senza e con impianto" />
      </div>
      <CashChart cash={ec.cashflow} />
      <Grid>
        <Num label="Prezzo dell'energia" value={e.importPrice} onChange={(v) => set({ importPrice: v })} suffix="€/kWh" min={0} max={2} step={0.01} hint="Quanto paghi in tutto per ogni kWh in bolletta (energia, rete, oneri, imposte): dividi la spesa variabile per i kWh consumati" />
        <Num label="Energia venduta" value={e.exportPrice} onChange={(v) => set({ exportPrice: v })} suffix="€/kWh" min={0} max={1} step={0.01} hint="Quanto ti pagano l'energia mandata in rete (per esempio ritiro dedicato): varia con il mercato" />
        <Num label={<Term k="detrazione">Detrazione</Term>} value={e.deductionPct} onChange={(v) => set({ deductionPct: v })} suffix="%" min={0} max={110} hint="Dipende dalle regole fiscali dell'anno e dal tipo di immobile: verificale" />
        <Num label="IVA" value={e.vatPct} onChange={(v) => set({ vatPct: v })} suffix="%" min={0} max={30} hint="Aliquota agevolata comune per gli impianti sulle abitazioni: verifica il caso specifico" />
      </Grid>
      <More label={`Da dove vengono questi valori (fonti aggiornate a ${PRICES_CHECKED})`}>
        <div className="grid gap-3 xl:grid-cols-2">
          {(
            [
              ['Prezzo dell\'energia', 'importPrice'],
              ['Energia venduta', 'exportPrice'],
              ['Detrazione', 'deduction'],
              ['IVA', 'vat'],
            ] as const
          ).map(([title, key]) => (
            <div key={key} className="rounded-lg bg-slate-950/60 px-3 py-2.5">
              <div className="mb-1 text-[0.75rem] font-semibold text-slate-200">{title}</div>
              <Sources {...ECONOMIC_SOURCES[key]} />
            </div>
          ))}
        </div>
      </More>
      <More label="Voci di spesa e listino prezzi">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32.5rem] text-[0.75rem]">
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
                  <td className="py-1 text-right font-mono tabular-nums text-slate-400">{l.id === 'misc' ? `${f(l.qty, 1)}%` : f(l.qty, l.qty % 1 ? 2 : 0)}</td>
                  <td className="py-1 text-right font-mono tabular-nums text-slate-400">{l.id === 'misc' ? '' : `${f(l.price, 2)} ${l.unit}`}</td>
                  <td className="py-1 text-right font-mono tabular-nums text-slate-100">{eur(l.total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="pt-1.5 text-slate-300">
                  Imponibile
                </td>
                <td className="pt-1.5 text-right font-mono tabular-nums">{eur(ec.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-slate-300">
                  IVA {f(e.vatPct)}%
                </td>
                <td className="text-right font-mono tabular-nums">{eur(ec.vat)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="pt-1 font-semibold text-white">
                  Totale
                </td>
                <td className="pt-1 text-right font-mono font-semibold tabular-nums text-amber-300">{eur(ec.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-500/[0.07] px-3 py-2 text-[0.75rem] text-sky-100">
          <span>
            Prezzi IVA esclusa, aggiornati a <b>{PRICES_CHECKED}</b>. Le voci senza fonte sono stime.
          </span>
          {e.prices.some((p) => p.price !== DEFAULT_PRICES.find((q) => q.id === p.id)?.price) && (
            <button
              onClick={() => set({ prices: DEFAULT_PRICES.map((q) => ({ ...q })) })}
              className="rounded-md bg-sky-400/15 px-2.5 py-1 font-semibold text-sky-100 transition-colors hover:bg-sky-400/25"
            >
              Ripristina i prezzi di {PRICES_CHECKED}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {e.prices.map((p) => {
            const src = PRICE_SOURCES[p.id];
            return (
              <div key={p.id} className="space-y-1.5">
                <Num label={p.label} value={p.price} suffix={p.unit} min={0} step={0.01} onChange={(v) => set({ prices: e.prices.map((q) => (q.id === p.id ? { ...q, price: v } : q)) })} />
                {src ? <Sources {...src} /> : <p className="text-[0.6875rem] text-slate-500">Stima, senza una fonte specifica.</p>}
              </div>
            );
          })}
        </div>
      </More>
      <More label="Altre ipotesi: durata, manutenzione, rincari">
        <Grid>
          <Num label="Anni della detrazione" value={e.deductionYears} onChange={(v) => set({ deductionYears: Math.round(v) })} min={0} max={20} />
          <Num label="Aumento annuo dell'energia" value={e.energyInflationPct} onChange={(v) => set({ energyInflationPct: v })} suffix="%" min={-10} max={20} step={0.5} />
          <Num label="Manutenzione e assicurazione" value={e.omPerYear} onChange={(v) => set({ omPerYear: v })} suffix="€/anno" min={0} max={2000} step={10} />
          <Num label="Sostituzione inverter all'anno" value={e.inverterReplaceYear} onChange={(v) => set({ inverterReplaceYear: Math.round(v) })} min={0} max={40} hint="0 = nessuna sostituzione" />
          <Num label="Durata dell'analisi" value={e.years} onChange={(v) => set({ years: Math.round(v) })} suffix="anni" min={5} max={40} />
          <Num label="Tasso di attualizzazione" value={e.discountPct} onChange={(v) => set({ discountPct: v })} suffix="%" min={0} max={15} step={0.5} hint="Quanto rendono i soldi in un investimento alternativo" />
          <Num label="Degrado annuo dei moduli" value={deg} onChange={(v) => setLoss('degradationPct', v)} suffix="%" min={0} max={3} step={0.1} />
        </Grid>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kpi label={<Term k="van">Valore attuale netto</Term>} value={eur(ec.npv)} sub={`in ${e.years} anni`} />
          <Kpi label={<Term k="lcoe">Costo dell'energia prodotta</Term>} value={`${f(ec.lcoe, 3)} €/kWh`} sub="al netto della detrazione" />
          <Kpi label="Detrazione totale" value={eur(ec.deductionTotal)} />
        </div>
      </More>
      <p className="text-[0.71875rem] leading-snug text-slate-500">
        Prezzi, aliquote, detrazioni e valore dell'energia cambiano nel tempo e da caso a caso: sostituiscili con preventivi e condizioni reali. Non sono considerati quote fisse della bolletta,
        finanziamenti, costi di connessione del distributore e variazioni di tariffa.
      </p>
    </Step>
  );
}

function CashChart({ cash }: { cash: { year: number; cumulative: number }[] }) {
  const W = 720;
  const H = 180;
  const pad = { l: 64, r: 8, t: 10, b: 22 };
  const lo = Math.min(0, ...cash.map((c) => c.cumulative));
  const hi = Math.max(0, ...cash.map((c) => c.cumulative));
  const n = cash.length - 1;
  const x = (k: number) => pad.l + (k / Math.max(1, n)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const bw = ((W - pad.l - pad.r) / Math.max(1, n)) * 0.7;
  return (
    <figure>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Soldi spesi e recuperati anno per anno">
        {[lo, 0, hi].map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#64748b' : '#1e293b'} />
            <text x={pad.l - 5} y={y(v) + 3} textAnchor="end" fontSize={12} fill="#94a3b8">
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
            rx={1.5}
            fill={c.cumulative >= 0 ? '#34d399' : '#f87171'}
            fillOpacity={0.78}
            style={{ transition: 'y 0.5s cubic-bezier(0.16,1,0.3,1), height 0.5s cubic-bezier(0.16,1,0.3,1), fill 0.3s' }}
          >
            <title>{`Anno ${c.year}: ${eur(c.cumulative)}`}</title>
          </rect>
        ))}
        {cash
          .filter((c) => c.year % 5 === 0)
          .map((c) => (
            <text key={c.year} x={x(c.year)} y={H - 6} textAnchor="middle" fontSize={12} fill="#94a3b8">
              {c.year === 0 ? 'oggi' : `anno ${c.year}`}
            </text>
          ))}
      </svg>
      <figcaption className="mt-1 text-[0.71875rem] text-slate-400">Soldi spesi (in rosso) e recuperati anno per anno: quando le barre diventano verdi l'impianto si è ripagato.</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ 10. riepilogo

function FinalStep({ n, r, go }: { n: number; r: DesignResults; go: (n: number) => void }) {
  const d = usePvDesign((x) => x.design);
  const snapshot = usePvDesign((x) => x.snapshot);
  const lay = roofLayout(d);
  const todo: [string, number][] = [];
  if (d.location.lat === null) todo.push(['Scegli la posizione della casa sulla mappa.', 0]);
  if (!lay) todo.push(['Disegna la pianta del tetto: da lì ricavo falde, orientamento e numero di moduli.', 0]);
  if (r.checks.some((c) => c.ok === false)) todo.push(['Ci sono verifiche di moduli e inverter non superate.', 4]);
  if (!r.dc.ok || !r.ac.ok) todo.push(['Rivedi le sezioni dei cavi.', 6]);
  if (!snapshot && lay) todo.push(['Facoltativo: salva una vista 3D da mettere nella relazione.', 7]);
  return (
    <Step n={n} title="Riepilogo" intro="Il tuo impianto in breve, cosa manca e i documenti da scaricare.">
      {todo.length > 0 ? (
        <ul className="space-y-1.5">
          {todo.map(([t, s]) => (
            <li key={t} className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/[0.09] px-3 py-2 text-[0.78125rem] text-amber-100">
              {t}
              <button onClick={() => go(s)} className="shrink-0 rounded-md bg-amber-400/15 px-2.5 py-1 text-[0.75rem] font-semibold text-amber-200 transition-colors hover:bg-amber-400/25">
                Vai al passo {s + 1}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-emerald-500/[0.09] px-3 py-2.5 text-[0.78125rem] text-emerald-100">Il progetto è completo: puoi scaricare la relazione o aprirlo nel laboratorio.</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={<Term k="kwp">Potenza</Term>} value={`${f(peakW(d) / 1000, 2)} kWp`} sub={`${moduleCount(d)} moduli`} />
        <Kpi label="Produzione annua" value={`${f(r.yield.productionKWh)} kWh`} sub={`copre il ${f((r.yield.productionKWh / Math.max(1, r.yield.consumptionKWh)) * 100)}% dei consumi`} />
        <Kpi label="Costo totale" value={eur(r.economics.total)} sub={`${eur(r.economics.perKWp)} per kWp`} />
        <Kpi label={<Term k="rientro">Si ripaga in</Term>} value={payback(r.economics.paybackYears)} />
      </div>
      {snapshot && <img src={snapshot} alt="Vista 3D della casa con i moduli" className="w-full rounded-lg border border-slate-800" />}
      <SummaryActions r={r} />
    </Step>
  );
}

// ------------------------------------------------------------------ riepilogo laterale

function SummaryActions({ r }: { r: DesignResults }) {
  const d = usePvDesign((x) => x.design);
  const reset = usePvDesign((x) => x.reset);
  const openProject = useStore((s) => s.openProject);
  const setMode = useStore((s) => s.setMode);
  const [busy, setBusy] = useState(false);
  const pdf = async () => {
    setBusy(true);
    try {
      const { exportPvDesignPdf } = await import('../pvdesign/pdf');
      exportPvDesignPdf(d, r, usePvDesign.getState().snapshot);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <button
        onClick={pdf}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2.5 text-[0.78125rem] font-semibold text-slate-950 transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.98] disabled:opacity-60"
      >
        <FileDown size={15} /> {busy ? 'Preparo la relazione…' : 'Scarica la relazione PDF'}
      </button>
      <button
        onClick={() => {
          if (!window.confirm('Il progetto aperto nel laboratorio sarà sostituito da quello generato. Se ti serve, salvalo prima nella libreria. Continuare?')) return;
          openProject(designToProject(d));
          setMode('lab');
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2.5 text-[0.78125rem] font-semibold text-white transition-colors hover:bg-slate-600"
        title="Crea nel laboratorio lo schema con generatore, inverter, cavi e protezioni di questo progetto"
      >
        <Zap size={15} /> Apri lo schema nel laboratorio
      </button>
      <button
        onClick={() => window.confirm('Ricominciare da capo? Tutti i dati del progetto fotovoltaico torneranno ai valori iniziali.') && reset()}
        className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[0.75rem] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
      >
        <RotateCcw size={13} /> Ricomincia da capo
      </button>
    </div>
  );
}

function Summary({ r }: { r: DesignResults }) {
  const d = usePvDesign((x) => x.design);
  const errors = r.checks.filter((c) => c.ok === false).length + (r.dc.ok ? 0 : 1) + (r.ac.ok ? 0 : 1);
  const warnings = r.checks.filter((c) => c.ok === null).length;
  return (
    <aside className="hidden lg:sticky lg:top-5 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:[scrollbar-width:thin]">
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div>
          <div className="text-[0.71875rem] text-slate-400">Il tuo impianto</div>
          <h2 className="truncate text-[0.875rem] font-semibold text-white" title={d.name}>
            {d.name}
          </h2>
        </div>
        <dl className="text-[0.78125rem]">
          <FlashRow label={<Term k="kwp">Potenza</Term>} value={peakW(d) / 1000} format={(v) => `${f(v, 2)} kWp`} />
          <FlashRow label="Moduli" text={`${moduleCount(d)} da ${d.module.moduleWp} Wp`} />
          <FlashRow label={<Term k="inverter">Inverter</Term>} text={`${f(d.inverter.pacW / 1000, 1)} kW${isHybrid(d) && d.batteryKWh > 0 ? ` + ${f(d.batteryKWh, 1)} kWh` : ''}`} />
          <div className="my-2 h-px bg-slate-800" />
          <FlashRow label="Produzione" value={r.yield.productionKWh} format={(v) => `${f(v)} kWh/anno`} />
          <FlashRow label="Copre i consumi al" value={(r.yield.productionKWh / Math.max(1, r.yield.consumptionKWh)) * 100} format={(v) => `${f(v)}%`} />
          <FlashRow label={<Term k="autoconsumo">Autoconsumo</Term>} value={r.yield.selfConsumptionPct} format={(v) => `${f(v)}%`} />
          <FlashRow label={<Term k="autosufficienza">Autosufficienza</Term>} value={r.yield.selfSufficiencyPct} format={(v) => `${f(v)}%`} />
          <div className="my-2 h-px bg-slate-800" />
          <FlashRow label="Costo totale" value={r.economics.total} format={eur} />
          <FlashRow label={<Term k="rientro">Si ripaga in</Term>} value={r.economics.paybackYears ?? -1} format={(v) => (r.economics.paybackYears === null ? 'oltre la durata' : `${f(v, 1)} anni`)} />
        </dl>
        <div
          key={errors ? 'e' : warnings ? 'w' : 'ok'}
          className={`pv-pop-in rounded-lg px-3 py-2 text-[0.75rem] leading-snug ${errors ? 'bg-red-500/10 text-red-200' : warnings ? 'bg-amber-500/10 text-amber-100' : 'bg-emerald-500/10 text-emerald-200'}`}
        >
          {errors ? `${errors === 1 ? 'Una verifica non superata' : `${errors} verifiche non superate`}: guarda i passi con il pallino rosso.` : warnings ? `Funziona; ${warnings === 1 ? 'un aspetto' : `${warnings} aspetti`} da valutare.` : 'Tutte le verifiche di calcolo sono superate.'}
        </div>
        <SummaryActions r={r} />
        <p className="text-[0.6875rem] leading-snug text-slate-500">
          Studio di fattibilità con modelli semplificati e dati indicativi: non sostituisce il progetto di un tecnico abilitato né la verifica delle norme CEI applicabili.
        </p>
      </div>
    </aside>
  );
}

/** Su schermi stretti: i tre numeri principali sempre visibili in fondo. */
function MobileSummary({ r }: { r: DesignResults }) {
  const d = usePvDesign((x) => x.design);
  const step = usePvDesign((x) => x.step);
  const setStep = usePvDesign((x) => x.setStep);
  return (
    <div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 py-2.5 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-[45rem] items-center justify-between gap-3 text-[0.75rem]">
        <div className="flex min-w-0 gap-4 tabular-nums">
          <span>
            <span className="block text-[0.65625rem] text-slate-500">Potenza</span>
            <span className="font-mono text-slate-100">
              <Animated value={peakW(d) / 1000} format={(v) => `${f(v, 2)} kWp`} />
            </span>
          </span>
          <span>
            <span className="block text-[0.65625rem] text-slate-500">Produzione</span>
            <span className="font-mono text-slate-100">
              <Animated value={r.yield.productionKWh} format={(v) => `${f(v)} kWh`} />
            </span>
          </span>
          <span className="hidden min-[400px]:block">
            <span className="block text-[0.65625rem] text-slate-500">Si ripaga in</span>
            <span className="font-mono text-slate-100">{payback(r.economics.paybackYears)}</span>
          </span>
        </div>
        {step !== STEPS.length - 1 && (
          <button onClick={() => setStep(STEPS.length - 1)} className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1.5 text-[0.71875rem] font-semibold text-slate-200 hover:bg-slate-700">
            Riepilogo
          </button>
        )}
      </div>
    </div>
  );
}

function useUpdate() {
  return usePvDesign((s) => s.update);
}
