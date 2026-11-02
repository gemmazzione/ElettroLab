import { AlertTriangle, Gauge } from 'lucide-react';
import { f, type DesignResults } from '../../pvdesign/calc';
import { INCENTIVE_SOURCES, MONTHS } from '../../pvdesign/data';
import { DEDUCTION_RATES, deductionRate, type PvDesign, type TaxYear } from '../../pvdesign/design';
import { incentiveOptions, loanPlan, monthlyBills, powerAdvice, POWER_COSTS, scenarios } from '../../pvdesign/money';
import { usePvDesign } from '../../pvdesign/store';
import { Sources } from './BatteryStep';
import { Grid, More, Num } from './kit';

const eur = (v: number) => `${f(v)} €`;
const payback = (y: number | null) => (y === null ? 'oltre la durata' : `${f(y, 1)} anni`);
type SetEcon = (patch: Partial<PvDesign['economics']>) => void;

const chip = (on: boolean) => `rounded-md border px-2.5 py-1 text-left ${on ? 'border-amber-400 bg-amber-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`;

/** Anno della spesa, tipo di immobile e IRPEF: fissano l'aliquota e quanto della detrazione si recupera davvero. */
export function DeductionSettings({ r, set }: { r: DesignResults; set: SetEcon }) {
  const e = usePvDesign((s) => s.design.economics);
  const ec = r.economics;
  const auto = deductionRate(e.taxYear, e.mainHome);
  const pick = (patch: { taxYear?: TaxYear; mainHome?: boolean }) => {
    const y = patch.taxYear ?? e.taxYear;
    const m = patch.mainHome ?? e.mainHome;
    set({ ...patch, deductionPct: deductionRate(y, m) });
  };
  const rate = e.deductionYears > 0 ? ec.deductionTotal / e.deductionYears : 0;
  return (
    <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-[0.8125rem] font-semibold text-white">La tua detrazione</div>
      <div className="flex flex-wrap gap-2 text-[0.75rem]" role="radiogroup" aria-label="Quando paghi l'impianto">
        {(Object.keys(DEDUCTION_RATES) as TaxYear[]).map((k) => (
          <button key={k} role="radio" aria-checked={e.taxYear === k} onClick={() => pick({ taxYear: k })} className={chip(e.taxYear === k)}>
            {DEDUCTION_RATES[k].label}
            <span className="block text-[0.6875rem] text-slate-500">
              {DEDUCTION_RATES[k].main}% prima casa, {DEDUCTION_RATES[k].other}% altri
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[0.75rem]" role="radiogroup" aria-label="Tipo di immobile">
        {[true, false].map((m) => (
          <button key={String(m)} role="radio" aria-checked={e.mainHome === m} onClick={() => pick({ mainHome: m })} className={chip(e.mainHome === m)}>
            {m ? 'Abitazione principale, sono proprietario' : 'Seconda casa, in affitto o familiare convivente'}
          </button>
        ))}
      </div>
      {e.deductionPct !== auto && (
        <p className="text-[0.71875rem] text-amber-200/90">
          Hai impostato a mano il {f(e.deductionPct)}%; con queste scelte sarebbe il {auto}%.{' '}
          <button onClick={() => set({ deductionPct: auto })} className="font-semibold underline underline-offset-2">
            Usa {auto}%
          </button>
        </p>
      )}
      <Grid>
        <Num
          label="IRPEF che paghi in un anno"
          value={e.taxPerYear}
          onChange={(v) => set({ taxPerYear: Math.max(0, v) })}
          suffix="€"
          min={0}
          max={200000}
          step={100}
          hint="L'imposta netta dell'ultima dichiarazione (730: rigo «IRPEF netta»). 0 = non considerarla"
        />
      </Grid>
      {ec.deductionLost > 1 ? (
        <p className="flex gap-2 rounded-lg bg-amber-500/[0.08] px-3 py-2 text-[0.75rem] text-amber-100">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
          <span>
            La rata è di {eur(rate)} all'anno ma paghi {eur(e.taxPerYear)} di IRPEF: perdi <b>{eur(ec.deductionLost)}</b> di detrazione. Valuta se un altro familiare con più IRPEF può sostenere la spesa, o
            un'agevolazione diversa qui sotto.
          </span>
        </p>
      ) : (
        e.taxPerYear > 0 && rate > 0 && <p className="text-[0.71875rem] text-emerald-300/90">La tua IRPEF copre tutta la rata di {eur(rate)}: recuperi l'intera detrazione.</p>
      )}
    </div>
  );
}

/** Le agevolazioni possibili, una accanto all'altra. */
export function IncentiveCompare({ r }: { r: DesignResults }) {
  const d = usePvDesign((s) => s.design);
  const opts = incentiveOptions(d, r.yield);
  const best = opts.reduce((a, x) => (x.npv > a.npv ? x : a));
  return (
    <section className="space-y-2" aria-labelledby="pv-compare-incentives">
      <div>
        <h3 id="pv-compare-incentives" className="text-[0.9375rem] font-semibold text-white">
          Quale agevolazione conviene
        </h3>
        <p className="text-[0.75rem] text-slate-400">Lo stesso impianto con le strade possibili. Il Conto Termico non c'è: per le case vale solo insieme a una pompa di calore.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-[0.75rem]">
          <thead>
            <tr className="border-b border-slate-700 text-left text-slate-500">
              <th className="py-1 font-medium">Strada</th>
              <th className="whitespace-nowrap py-1 text-right font-medium">Spendi subito</th>
              <th className="whitespace-nowrap py-1 text-right font-medium">Detrazione</th>
              <th className="whitespace-nowrap py-1 text-right font-medium">CER in 20 anni</th>
              <th className="whitespace-nowrap py-1 text-right font-medium">Si ripaga in</th>
              <th className="whitespace-nowrap py-1 text-right font-medium">Guadagno attualizzato</th>
            </tr>
          </thead>
          <tbody>
            {opts.map((o) => (
              <tr key={o.id} className={`border-b border-slate-800/60 ${o.id === best.id ? 'bg-emerald-500/[0.07]' : ''}`}>
                <td className="py-1.5 pr-2">
                  <div className={`font-medium ${o.id === best.id ? 'text-emerald-200' : 'text-slate-200'}`}>
                    {o.label}
                    {o.current && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-px text-[0.625rem] font-semibold text-amber-200">il tuo progetto</span>}
                    {o.id === best.id && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-px text-[0.625rem] font-semibold text-emerald-200">conviene di più</span>}
                  </div>
                  <div className="text-[0.6875rem] text-slate-500">{o.note}</div>
                </td>
                <td className="whitespace-nowrap py-1.5 text-right font-mono tabular-nums text-slate-300">{eur(o.upfront)}</td>
                <td className="whitespace-nowrap py-1.5 text-right font-mono tabular-nums text-slate-300">{o.deduction > 0 ? eur(o.deduction) : '–'}</td>
                <td className="whitespace-nowrap py-1.5 text-right font-mono tabular-nums text-slate-300">{o.cer20 > 0 ? eur(o.cer20) : '–'}</td>
                <td className="whitespace-nowrap py-1.5 text-right font-mono tabular-nums text-slate-200">{payback(o.paybackYears)}</td>
                <td className={`whitespace-nowrap py-1.5 text-right font-mono tabular-nums ${o.npv >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{eur(o.npv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.6875rem] text-slate-500">
        «Guadagno attualizzato» è il valore attuale netto in {d.economics.years} anni. La detrazione tiene conto dell'IRPEF indicata; la CER usa la quota condivisa e la tariffa impostate nella sezione
        della comunità energetica.
      </p>
    </section>
  );
}

/** Il rientro con ipotesi prudenti, attese e favorevoli. */
export function ScenarioRange({ r }: { r: DesignResults }) {
  const d = usePvDesign((s) => s.design);
  const sc = scenarios(d, r.yield);
  const pb = sc.map((s) => s.economics.paybackYears);
  return (
    <div className="space-y-1.5">
      <div className="text-[0.75rem] text-slate-300">
        Il rientro va da <b className="text-white">{payback(pb[2] ?? null)}</b> con ipotesi favorevoli a <b className="text-white">{payback(pb[0] ?? null)}</b> con ipotesi prudenti.
      </div>
      <div className="grid grid-cols-3 gap-2">
        {sc.map((s) => (
          <div key={s.id} className={`rounded-lg px-2.5 py-2 ${s.id === 'atteso' ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : 'bg-slate-950/60'}`}>
            <div className="text-[0.6875rem] font-semibold text-slate-300">{s.label}</div>
            <div className="font-mono text-[0.9375rem] font-semibold tabular-nums text-white">{payback(s.economics.paybackYears)}</div>
            <div className={`font-mono text-[0.6875rem] tabular-nums ${s.economics.npv >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{eur(s.economics.npv)} in {d.economics.years} anni</div>
            <div className="mt-0.5 text-[0.625rem] leading-tight text-slate-500">{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rata del prestito contro il risparmio di ogni mese. */
export function LoanPanel({ r, set }: { r: DesignResults; set: SetEcon }) {
  const e = usePvDesign((s) => s.design.economics);
  const l = loanPlan(e, r.economics);
  const setLoan = (patch: Partial<PvDesign['economics']['loan']>) => set({ loan: { ...e.loan, ...patch } });
  const diff = l.monthlyBenefit - l.monthly;
  return (
    <More label={`Se lo paghi con un finanziamento${e.loan.enabled ? ` · rata ${eur(l.monthly)} al mese` : ''}`} defaultOpen={e.loan.enabled || undefined}>
      <label className="flex cursor-pointer items-center gap-2.5 text-[0.78125rem] text-slate-200">
        <input type="checkbox" className="accent-amber-500" checked={e.loan.enabled} onChange={(ev) => setLoan({ enabled: ev.target.checked })} />
        Pago l'impianto con un prestito
      </label>
      {e.loan.enabled && (
        <div className="pv-pop-in space-y-2.5">
          <Grid>
            <Num label="Quota finanziata" value={e.loan.pct} onChange={(v) => setLoan({ pct: v })} suffix="%" min={0} max={100} step={5} hint={`${eur(l.financed)} della spesa`} />
            <Num label="TAN" value={e.loan.tanPct} onChange={(v) => setLoan({ tanPct: v })} suffix="%" min={0} max={20} step={0.1} hint="Il tasso dell'offerta che hai ricevuto: 7% è solo una stima" />
            <Num label="Durata" value={e.loan.years} onChange={(v) => setLoan({ years: Math.max(1, Math.round(v)) })} suffix="anni" min={1} max={20} />
          </Grid>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-[0.6875rem] text-slate-400">Rata del prestito</div>
              <div className="font-mono text-[1rem] font-semibold tabular-nums text-white">{eur(l.monthly)}/mese</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-[0.6875rem] text-slate-400">Risparmio medio del primo anno</div>
              <div className="font-mono text-[1rem] font-semibold tabular-nums text-white">{eur(l.monthlyBenefit)}/mese</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-[0.6875rem] text-slate-400">Interessi in tutto</div>
              <div className="font-mono text-[1rem] font-semibold tabular-nums text-white">{eur(l.interest)}</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-[0.6875rem] text-slate-400">Saldo positivo dopo</div>
              <div className="font-mono text-[1rem] font-semibold tabular-nums text-white">{l.paybackYears === 0 ? 'da subito' : payback(l.paybackYears)}</div>
            </div>
          </div>
          <p className={`rounded-lg px-3 py-2 text-[0.75rem] ${diff >= 0 ? 'bg-emerald-500/[0.08] text-emerald-100' : 'bg-amber-500/[0.08] text-amber-100'}`}>
            {diff >= 0
              ? `Già dal primo anno il risparmio supera la rata di ${eur(diff)} al mese: l'impianto si paga da solo.`
              : `Nel primo anno la rata supera il risparmio di ${eur(-diff)} al mese: è la cifra da mettere di tasca tua finché dura il prestito (la rata della detrazione arriva una volta all'anno con la dichiarazione).`}
          </p>
        </div>
      )}
    </More>
  );
}

/** Spesa per l'energia mese per mese, senza e con l'impianto. */
export function MonthlyBills({ r }: { r: DesignResults }) {
  const d = usePvDesign((s) => s.design);
  const m = monthlyBills(d, r.yield, r.economics);
  const W = 720;
  const H = 190;
  const pad = { l: 52, r: 6, t: 10, b: 22 };
  const hi = Math.max(1, ...m.map((x) => x.before));
  const lo = Math.min(0, ...m.map((x) => x.after));
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const cw = (W - pad.l - pad.r) / 12;
  const bw = cw * 0.34;
  return (
    <figure className="space-y-1">
      <figcaption className="text-[0.8125rem] font-semibold text-white">La bolletta mese per mese</figcaption>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spesa per l'energia di ogni mese senza e con l'impianto">
        {[lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#64748b' : '#1e293b'} />
            <text x={pad.l - 5} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#94a3b8">
              {eur(v)}
            </text>
          </g>
        ))}
        {m.map((x, i) => {
          const cx = pad.l + cw * i + cw / 2;
          return (
            <g key={i}>
              <rect x={cx - bw - 1} y={y(x.before)} width={bw} height={y(0) - y(x.before)} rx={1.5} fill="#f87171" fillOpacity={0.75}>
                <title>{`${MONTHS[i]}: ${eur(x.before)} senza impianto`}</title>
              </rect>
              <rect x={cx + 1} y={Math.min(y(0), y(x.after))} width={bw} height={Math.abs(y(x.after) - y(0))} rx={1.5} fill={x.after < 0 ? '#34d399' : '#38bdf8'} fillOpacity={0.85}>
                <title>{`${MONTHS[i]}: ${eur(x.after)} con l'impianto`}</title>
              </rect>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={12} fill="#94a3b8">
                {MONTHS[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[0.71875rem] text-slate-400">
        <span className="text-red-300">Rosso</span>: senza impianto. <span className="text-sky-300">Azzurro</span>: con l'impianto, tolti l'energia venduta e l'eventuale incentivo CER;{' '}
        <span className="text-emerald-300">verde</span> quando il mese chiude in attivo. Solo la parte a consumo: le quote fisse restano. D'inverno il sole è poco e il risparmio cala; la rata della
        detrazione non è inclusa.
      </p>
    </figure>
  );
}

/** Controllo della potenza del contatore con pompa di calore e auto elettrica. */
export function PowerCheck({ c }: { c: PvDesign['consumption'] }) {
  const a = powerAdvice(c);
  if (!a) return null;
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${a.raise ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-slate-800 bg-slate-950/40'}`}>
      <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-white">
        <Gauge size={16} className={a.raise ? 'text-amber-300' : 'text-emerald-300'} />
        {a.raise ? `Il contatore da ${f(c.contractKW, 1)} kW potrebbe non bastare` : `Il contatore da ${f(c.contractKW, 1)} kW basta`}
      </div>
      <ul className="space-y-0.5 text-[0.75rem] text-slate-300">
        {a.items.map((x) => (
          <li key={x.label} className="flex justify-between gap-3">
            <span>{x.label}</span>
            <span className="font-mono tabular-nums">{f(x.kW, 1)} kW</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-slate-700/60 pt-0.5 font-semibold text-white">
          <span>Tutto acceso insieme (stima)</span>
          <span className="font-mono tabular-nums">{f(a.peakKW, 1)} kW</span>
        </li>
      </ul>
      {a.raise ? (
        <p className="text-[0.75rem] leading-snug text-amber-100">
          Consigliati <b>{f(a.suggestedKW, 1)} kW</b> (il contatore regge il 10% in più). L'aumento costa circa <b>{eur(a.oneOff)}</b> una volta e {eur(a.yearlyExtra)} all'anno in più in bolletta, IVA
          esclusa. In alternativa, un gestore dei carichi rallenta la ricarica dell'auto quando la casa consuma molto: così puoi restare più in basso.
        </p>
      ) : (
        <p className="text-[0.75rem] text-slate-400">Con i carichi indicati la potenza attuale è sufficiente, con il 10% di tolleranza del contatore.</p>
      )}
      <p className="text-[0.6875rem] text-slate-500">
        Stima indicativa: ogni casa ha i suoi carichi. Costi 2026: {f(POWER_COSTS.perKWUpTo6, 2)} €/kW fino a 6 kW, {f(POWER_COSTS.perKWOver6, 2)} €/kW oltre, {f(POWER_COSTS.paperwork)} € di pratica (maggior
        tutela; sul mercato libero decide il fornitore).
      </p>
      <Sources sources={INCENTIVE_SOURCES.power} />
    </div>
  );
}
