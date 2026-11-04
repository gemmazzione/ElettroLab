import { PlugZap } from 'lucide-react';
import { connectionInfo } from '../../pvdesign/connection';
import { usePvDesign } from '../../pvdesign/store';
import { Sources } from './BatteryStep';
import { More } from './kit';

/** Connessione alla rete e pratiche: livello di tensione, protezione di interfaccia, officina elettrica, antincendio. */
export function ConnectionPanel() {
  const d = usePvDesign((s) => s.design);
  const items = connectionInfo(d);
  return (
    <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3" aria-labelledby="pv-connection-title">
      <h3 id="pv-connection-title" className="flex items-center gap-2 text-[0.8125rem] font-semibold text-white">
        <PlugZap size={15} className="text-amber-300" /> Connessione alla rete e pratiche
      </h3>
      <ul className="space-y-1.5">
        {items.map((x) => (
          <li key={x.id} className="flex items-start gap-2.5 text-[0.78125rem] leading-snug">
            <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${x.ok ? 'bg-emerald-400' : 'bg-sky-400'}`} />
            <span>
              <span className="font-medium text-slate-100">{x.title}</span>
              <span className="block text-slate-400">{x.summary}</span>
            </span>
          </li>
        ))}
      </ul>
      <More label="Cosa comporta e fonti">
        <div className="grid gap-2 xl:grid-cols-2">
          {items.map((x) => (
            <div key={x.id} className="space-y-1.5 rounded-lg bg-slate-950/60 px-3 py-2.5">
              <div className="text-[0.75rem] font-semibold text-slate-200">{x.title}</div>
              <p className="text-[0.75rem] leading-snug text-slate-300">{x.detail}</p>
              {x.sources.length > 0 && <Sources sources={x.sources} />}
            </div>
          ))}
        </div>
      </More>
      <p className="text-[0.6875rem] text-slate-500">Indicazioni di massima: livello di tensione, protezioni e opere le stabilisce il distributore nel preventivo di connessione.</p>
    </section>
  );
}
