import { BatteryCharging, Check, ExternalLink, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { acPowerW, batteryAdvice, batteryPowerW, f, withBattery } from '../../pvdesign/calc';
import type { PriceSource } from '../../pvdesign/data';
import { batteryActive, isBusiness, isHybrid } from '../../pvdesign/design';
import { usePvDesign } from '../../pvdesign/store';
import { Animated, Kpi, More, Num, Step, Term } from './kit';

const eur = (v: number) => `${f(v)} €`;

/** Passo «Accumulo»: scelta della batteria con la capacità consigliata e il confronto tra le capacità. */
export function BatteryStep({ n }: { n: number }) {
  const d = usePvDesign((x) => x.design);
  const up = usePvDesign((x) => x.update);
  const advice = useMemo(() => batteryAdvice(d), [d]);
  const choose = (kWh: number) => up((x) => withBattery(x, kWh));
  const current = batteryActive(d) ? d.batteryKWh : 0;
  const biz = isBusiness(d);
  const rec = advice.options.find((o) => o.kWh === advice.recommended)!;
  const base = advice.options[0]!;
  const custom = current > 0 && !advice.options.some((o) => o.kWh === current);
  return (
    <Step
      n={n}
      title="Accumulo"
      intro={
        <>
          Una batteria conserva l'energia prodotta di giorno e non usata, per restituirla la sera e la notte.{' '}
          {biz ? "In un'azienda di solito è un sistema di accumulo collegato in alternata, con il suo convertitore." : <>Serve un <Term k="ibrido">inverter ibrido</Term>.</>}
        </>
      }
      help={`Ti consiglio la capacità oltre la quale ogni kWh in più resterebbe quasi sempre inutilizzato. La batteria aumenta l'energia che usi ${biz ? 'in azienda' : 'in casa'}, ma di solito allunga un po' il rientro: scegli tu.`}
    >
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
              <Sparkles size={18} />
            </span>
            <div>
              <div className="text-[0.75rem] text-emerald-200/80">Accumulo consigliato</div>
              <div className="text-[1.125rem] font-semibold text-white">{advice.recommended > 0 ? `${f(advice.recommended, 1)} kWh` : 'Nessuna batteria'}</div>
            </div>
          </div>
          {current !== advice.recommended && (
            <button
              onClick={() => choose(advice.recommended)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-[0.8125rem] font-semibold text-emerald-950 transition-[background-color,transform] hover:bg-emerald-400 active:scale-[0.98]"
            >
              {advice.recommended > 0 ? `Usa ${f(advice.recommended, 1)} kWh` : 'Togli la batteria'}
            </button>
          )}
        </div>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-emerald-50/90">{advice.reason}</p>
      </div>

      <div>
        <h3 className="mb-2 text-[0.8125rem] font-semibold text-slate-200">Confronta le capacità</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Capacità della batteria">
          {advice.options.map((o) => {
            const sel = o.kWh === current;
            const isRec = o.kWh === advice.recommended;
            return (
              <button
                key={o.kWh}
                role="radio"
                aria-checked={sel}
                onClick={() => choose(o.kWh)}
                className={`relative rounded-lg border px-3 py-2.5 text-left transition-[border-color,background-color] duration-200 ${sel ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
              >
                {isRec && <span className="absolute -top-2 right-2 rounded-full bg-emerald-500 px-1.5 py-px text-[0.625rem] font-bold text-emerald-950">consigliato</span>}
                <div className="flex items-center justify-between gap-1 text-[0.875rem] font-semibold text-white">
                  {o.kWh === 0 ? 'Nessuna' : `${f(o.kWh, 1)} kWh`}
                  {sel && <Check size={15} className="pv-pop text-amber-300" />}
                </div>
                <div className="mt-1 space-y-0.5 text-[0.71875rem] leading-snug text-slate-400">
                  <div>
                    autosufficienza <span className="font-mono text-slate-200">{f(o.selfSufficiencyPct)}%</span>
                  </div>
                  <div>{o.kWh === 0 ? 'nessuna spesa in più' : <>spesa in più <span className="font-mono text-slate-200">{eur(o.extraCost)}</span></>}</div>
                  <div>
                    si ripaga in <span className="font-mono text-slate-200">{o.paybackYears === null ? 'oltre la durata' : `${f(o.paybackYears, 1)} anni`}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <AutonomyBars options={advice.options} current={current} recommended={advice.recommended} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Batteria scelta" value={current > 0 ? `${f(current, 1)} kWh` : 'nessuna'} sub={current > 0 ? `potenza ${f(batteryPowerW(d) / 1000, 1)} kW` : undefined} />
        <Kpi label={<Term k="autosufficienza">Autosufficienza</Term>} value={<Animated value={(advice.options.find((o) => o.kWh === current) ?? rec).selfSufficiencyPct} format={(v) => `${f(v)}%`} />} sub={`senza batteria ${f(base.selfSufficiencyPct)}%`} />
        <Kpi label={<Term k="autoconsumo">Autoconsumo</Term>} value={`${f((advice.options.find((o) => o.kWh === current) ?? rec).selfConsumptionPct)}%`} sub={`senza batteria ${f(base.selfConsumptionPct)}%`} />
        <Kpi label={<Term k="inverter">Inverter</Term>} value={`${f(acPowerW(d) / 1000, 1)} kW`} sub={isHybrid(d) ? 'ibrido, gestisce la batteria' : biz ? 'accumulo collegato in alternata' : 'senza batteria'} />
      </div>

      {current > 0 && (
        <p className="flex items-start gap-2 text-[0.75rem] leading-snug text-slate-400">
          <BatteryCharging size={15} className="mt-0.5 shrink-0 text-emerald-300" />
          {biz
            ? `Accumulo collegato in alternata con il suo convertitore, potenza circa ${f(batteryPowerW(d) / 1000, 1)} kW. Il listino usa il prezzo per kWh delle batterie per aziende.`
            : `Con la batteria uso l'inverter ibrido «${d.inverter.label}». Le verifiche di stringa del passo «Moduli e inverter» tengono conto di questo inverter.`}
        </p>
      )}

      <More label="Capacità diversa da quelle proposte">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Capacità della batteria" value={current} onChange={(v) => choose(v)} suffix="kWh" min={0} max={biz ? 5000 : 40} step={biz ? 5 : 0.5} hint="0 = senza accumulo. Capacità nominale: ne uso il 90% per non scaricarla del tutto." />
        </div>
        {custom && <p className="text-[0.75rem] text-slate-400">Capacità personalizzata: {f(current, 1)} kWh.</p>}
      </More>
      <p className="text-[0.71875rem] leading-snug text-slate-500">
        Il calcolo usa il giorno medio di ogni mese: non vede le settimane nuvolose, quindi nella realtà l'autosufficienza è più bassa, soprattutto in inverno. Batteria: 90% della
        capacità utilizzabile, rendimento di andata e ritorno 90%, potenza circa 0,5 kW per kWh (valori indicativi).
      </p>
    </Step>
  );
}

/** Autosufficienza al crescere della batteria: dove la curva si appiattisce, la capacità in più serve poco. */
function AutonomyBars({ options, current, recommended }: { options: { kWh: number; selfSufficiencyPct: number }[]; current: number; recommended: number }) {
  const W = 720;
  const H = 150;
  const pad = { l: 36, r: 8, t: 14, b: 24 };
  const bw = (W - pad.l - pad.r) / options.length;
  const y = (v: number) => H - pad.b - (v / 100) * (H - pad.t - pad.b);
  return (
    <figure className="mt-3">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Autosufficienza in funzione della capacità della batteria">
        {[50, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#1e293b" />
            <text x={pad.l - 5} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#94a3b8">
              {v}%
            </text>
          </g>
        ))}
        {options.map((o, i) => {
          const x = pad.l + i * bw + bw * 0.2;
          const w = bw * 0.6;
          const fill = o.kWh === current ? '#fbbf24' : o.kWh === recommended ? '#34d399' : '#475569';
          return (
            <g key={o.kWh}>
              <rect x={x} y={y(o.selfSufficiencyPct)} width={w} height={y(0) - y(o.selfSufficiencyPct)} rx={3} fill={fill} style={{ transition: 'y 0.5s cubic-bezier(0.16,1,0.3,1), height 0.5s cubic-bezier(0.16,1,0.3,1), fill 0.3s' }} />
              <text x={x + w / 2} y={y(o.selfSufficiencyPct) - 4} textAnchor="middle" fontSize={11} fill="#e2e8f0">
                {f(o.selfSufficiencyPct)}%
              </text>
              <text x={x + w / 2} y={H - 7} textAnchor="middle" fontSize={12} fill="#94a3b8">
                {o.kWh === 0 ? 'nessuna' : `${f(o.kWh, 1)} kWh`}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-[0.71875rem] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> scelta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" /> consigliata
        </span>
        <span>Autosufficienza: quota dei consumi coperta dal fotovoltaico.</span>
      </figcaption>
    </figure>
  );
}

/** Elenco di fonti con link, data e dato riportato. */
export function Sources({ why, sources }: { why?: string; sources: PriceSource[] }) {
  return (
    <div className="space-y-1 text-[0.71875rem] leading-snug text-slate-400">
      {why && <p>{why}</p>}
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-300 underline decoration-sky-800 underline-offset-2 hover:text-sky-200">
              {s.label}
              <ExternalLink size={11} />
            </a>{' '}
            <span className="text-slate-500">({s.date})</span>: {s.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
