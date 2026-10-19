import { Maximize2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { deviceShortCircuit } from '../engine/measure';
import type { ComponentInstance } from '../model/types';
import { protectedCurrent } from '../protection/stepper';
import { useStore } from '../store/projectStore';
import { Section } from './fields';
import { FuseChart, OvercurrentChart, OvercurrentTable, ResidualChart } from './TripCurveChart';

/** Grafici tempo-corrente del dispositivo selezionato, con punto di lavoro in tempo reale. */
export function TripCurveSection({ comp }: { comp: ComponentInstance }) {
  const project = useStore((s) => s.project);
  const result = useStore((s) => s.result);
  const running = useStore((s) => s.running);
  const heat = useStore((s) => s.prot[comp.id]?.heat ?? 0);
  const melt = useStore((s) => Math.max(0, ...(s.prot[comp.id]?.melt ?? []).filter((m) => m < 1)));
  const [big, setBig] = useState(false);
  const [table, setTable] = useState(false);
  const pr = comp.params;
  const icc = useMemo(() => deviceShortCircuit(project, comp), [project, comp]);
  if (pr.kind !== 'mcb' && pr.kind !== 'rcbo' && pr.kind !== 'rcd' && pr.kind !== 'fuse') return null;

  const live = running && result && result.ok;
  const point = live && (pr.kind === 'mcb' || pr.kind === 'rcbo' || pr.kind === 'fuse') ? { current: protectedCurrent(result, comp), heat } : null;
  const residual = live && (pr.kind === 'rcd' || pr.kind === 'rcbo') ? (result.residual.get(comp.id) ?? 0) : null;
  const selective = pr.kind === 'rcd' && pr.p.selective;

  const charts = (w: number, h: number) => (
    <div className="space-y-4">
      {pr.kind === 'fuse' && <FuseChart inA={pr.p.in} current={point ? point.current : null} melt={melt} iccA={icc} width={w} height={h} />}
      {(pr.kind === 'mcb' || pr.kind === 'rcbo') && (
        <div>
          {pr.kind === 'rcbo' && <div className="mb-1 text-[11px] font-semibold text-slate-300">Sganciatore magnetotermico</div>}
          <OvercurrentChart inA={pr.p.in} curve={pr.p.curve} point={point} iccA={icc} width={w} height={h} />
        </div>
      )}
      {(pr.kind === 'rcd' || pr.kind === 'rcbo') && (
        <div>
          {pr.kind === 'rcbo' && <div className="mb-1 text-[11px] font-semibold text-slate-300">Sganciatore differenziale</div>}
          <ResidualChart idnMa={pr.p.idn} selective={selective} residualA={residual} width={w} height={Math.round(h * 0.85)} />
        </div>
      )}
    </div>
  );

  return (
    <Section title="Curva di intervento">
      <div className="flex items-center justify-end">
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-100" onClick={() => setBig(true)}>
          <Maximize2 size={12} /> Ingrandisci
        </button>
      </div>
      {charts(290, 230)}
      {(pr.kind === 'mcb' || pr.kind === 'rcbo') && (
        <>
          <button className="text-[11px] text-sky-300 hover:underline" onClick={() => setTable(!table)}>
            {table ? 'Nascondi i valori' : 'Mostra i valori in tabella'}
          </button>
          {table && <OvercurrentTable inA={pr.p.in} curve={pr.p.curve} />}
        </>
      )}
      <p className="text-[10.5px] leading-snug text-slate-500">
        Curva del modello del simulatore, costruita sui punti convenzionali della norma di prodotto: non è la curva del costruttore. Il punto bianco mostra la corrente attuale e il tempo d'intervento previsto tenendo conto della memoria termica{pr.kind === 'fuse' ? ' (per il fusibile: del consumo già accumulato dalla cartuccia)' : ''}.
      </p>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" onMouseDown={() => setBig(false)}>
          <div className="max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <h2 className="text-[14px] font-semibold text-slate-100">Curva di intervento · {comp.label}</h2>
              <button className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-800" onClick={() => setBig(false)}>
                <X size={16} />
              </button>
            </div>
            {charts(Math.max(300, Math.min(640, window.innerWidth - 110)), 400)}
            {(pr.kind === 'mcb' || pr.kind === 'rcbo') && <OvercurrentTable inA={pr.p.in} curve={pr.p.curve} />}
          </div>
        </div>
      )}
    </Section>
  );
}
