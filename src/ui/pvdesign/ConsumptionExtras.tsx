import { Car, FileUp, Flame, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { EV_KWH_PER_KM, f } from '../../pvdesign/calc';
import type { PvDesign } from '../../pvdesign/design';
import { parseLoadCsv } from '../../pvdesign/loadCsv';
import { usePvDesign } from '../../pvdesign/store';
import { Grid, More, Num } from './kit';

type Consumption = PvDesign['consumption'];

/** Importa la curva di carico scaricata dal portale del distributore. */
export function MeasuredImport({ c, set }: { c: Consumption; set: (patch: Partial<Consumption>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const read = async (file: File) => {
    setError('');
    if (file.size > 20_000_000) return setError('Il file è troppo grande (oltre 20 MB).');
    const r = parseLoadCsv(await file.text());
    if (!r) return setError('Non ho trovato almeno una settimana di consumi nel file. Serve il CSV della curva di carico, con data e valori orari o al quarto d\'ora.');
    set({ measured: r.measured, annualKWh: r.annualKWh, measuredSource: `${file.name} · ${r.days} giorni${r.months < 12 ? `, ${r.months} mesi su 12 (gli altri ricavati dai presenti)` : ''}` });
  };

  if (c.measured) {
    return (
      <div className="pv-pop-in flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2.5 text-[0.78125rem] text-slate-200">
        <FileUp size={16} className="mt-0.5 shrink-0 text-emerald-300" />
        <div className="min-w-0 flex-1">
          <b>Uso i consumi reali del tuo contatore</b>
          <span className="block truncate text-[0.71875rem] text-slate-400" title={c.measuredSource}>
            {c.measuredSource}
          </span>
        </div>
        <button onClick={() => set({ measured: null, measuredSource: '' })} className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.71875rem] text-slate-400 hover:bg-slate-800 hover:text-white">
          <X size={13} /> Togli
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-slate-950/60 px-3 py-2.5 text-[0.75rem] text-slate-300">
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void read(file);
        }}
      />
      <button onClick={() => input.current?.click()} className="flex items-center gap-1.5 font-medium text-sky-300 hover:text-sky-200">
        <FileUp size={15} /> Importa i consumi reali (file CSV del distributore)
      </button>
      <span className="mt-1 block text-[0.71875rem] text-slate-400">
        Nell'area clienti del distributore (per esempio e-distribuzione, Areti, Unareti) puoi scaricare la «curva di carico» del tuo contatore: i consumi ora per ora o ogni quarto d'ora. Con quel file il
        calcolo usa le tue ore reali invece di un profilo tipo. Il file resta nel browser.
      </span>
      {error && (
        <span role="alert" className="mt-1.5 block text-[0.71875rem] text-rose-300">
          {error}
        </span>
      )}
    </div>
  );
}

/** Consumi che arriveranno: pompa di calore e auto elettrica. */
export function FutureLoads({ c, set }: { c: Consumption; set: (patch: Partial<Consumption>) => void }) {
  const evKWh = c.evKm * EV_KWH_PER_KM;
  const on = c.heatPumpKWh > 0 || c.evKm > 0;
  const expert = usePvDesign((s) => s.expert);
  return (
    <More label={`Consumi in più in futuro (pompa di calore, auto elettrica)${on ? ` · +${f(c.heatPumpKWh + evKWh)} kWh` : ''}`} defaultOpen={on || expert}>
      <p className="text-[0.71875rem] text-slate-400">Se pensi di aggiungerli nei prossimi anni, conviene dimensionare l'impianto già adesso: si sommano ai consumi di oggi.</p>
      <Grid>
        <Num
          label={
            <span className="flex items-center gap-1">
              <Flame size={12} className="text-orange-300" /> Pompa di calore
            </span>
          }
          value={c.heatPumpKWh}
          onChange={(v) => set({ heatPumpKWh: v })}
          suffix="kWh/anno"
          min={0}
          max={20000}
          step={100}
          hint="Riscaldamento elettrico: per una casa di 100 m² ben isolata servono circa 2.000–3.500 kWh all'anno. Il consumo si distribuisce nei mesi freddi, di più al mattino e alla sera."
        />
        <Num
          label={
            <span className="flex items-center gap-1">
              <Car size={12} className="text-sky-300" /> Auto elettrica
            </span>
          }
          value={c.evKm}
          onChange={(v) => set({ evKm: v })}
          suffix="km/anno"
          min={0}
          max={60000}
          step={500}
          hint={`Circa ${EV_KWH_PER_KM.toLocaleString('it-IT')} kWh per km: 10.000 km sono circa ${f(10000 * EV_KWH_PER_KM)} kWh.`}
        />
        {c.evKm > 0 && (
          <div className="col-span-2 flex flex-wrap items-center gap-2 text-[0.75rem] text-slate-300" role="radiogroup" aria-label="Quando ricarichi l'auto">
            Ricarico l'auto:
            {(['sera', 'giorno'] as const).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={c.evCharge === k}
                onClick={() => set({ evCharge: k })}
                className={`rounded-md border px-2.5 py-1 ${c.evCharge === k ? 'border-sky-400 bg-sky-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                {k === 'sera' ? 'di sera (19–23)' : 'di giorno (10–16)'}
              </button>
            ))}
            <span className="w-full text-[0.71875rem] text-slate-400">Ricaricare di giorno, quando i moduli producono, fa usare molta più energia solare.</span>
          </div>
        )}
      </Grid>
    </More>
  );
}
