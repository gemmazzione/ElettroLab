import { Maximize2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { deviceShortCircuit } from '../engine/measure';
import type { ComponentInstance } from '../model/types';
import { magneticBand, thermalModelOf, thermalSetting } from '../protection/curves';
import { selectivity } from '../protection/selectivity';
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
  const sel = useMemo(() => (comp.params.kind === 'mcb' || comp.params.kind === 'rcbo' || comp.params.kind === 'fuse' ? selectivity(project, comp) : null), [project, comp]);
  if (pr.kind !== 'mcb' && pr.kind !== 'rcbo' && pr.kind !== 'rcd' && pr.kind !== 'fuse') return null;

  const live = running && result && result.ok;
  const point = live && (pr.kind === 'mcb' || pr.kind === 'rcbo' || pr.kind === 'fuse') ? { current: protectedCurrent(result, comp), heat } : null;
  const residual = live && (pr.kind === 'rcd' || pr.kind === 'rcbo') ? (result.residual.get(comp.id) ?? 0) : null;
  const selective = (pr.kind === 'rcd' || pr.kind === 'rcbo') && !!pr.p.selective;
  // Interruttori regolabili: curva riferita a Ir, fascia magnetica dalla soglia Im.
  const ref = pr.kind === 'mcb' ? thermalSetting(pr.p) : pr.kind === 'rcbo' ? pr.p.in : 0;
  const band: [number, number] | undefined =
    pr.kind === 'mcb' && pr.p.im ? (magneticBand(pr.p).map((v) => (v * pr.p.in) / ref) as [number, number]) : undefined;
  // Curva della protezione a monte (solo interruttori): per leggere la selettività sul grafico.
  const upP = sel?.up.params;
  const other =
    upP && (upP.kind === 'mcb' || upP.kind === 'rcbo')
      ? (() => {
          const r = upP.kind === 'mcb' ? thermalSetting(upP.p) : upP.p.in;
          return {
            label: `${sel!.up.label} (${upP.kind === 'mcb' && upP.p.im ? `Ir ${r} A` : `${upP.p.curve}${upP.p.in}`})`,
            refA: r,
            band: magneticBand(upP.p).map((v) => (v * upP.p.in) / r) as [number, number],
            model: upP.kind === 'mcb' ? thermalModelOf(upP.p) : thermalModelOf({}),
          };
        })()
      : undefined;

  const charts = (w: number, h: number) => (
    <div className="space-y-4">
      {pr.kind === 'fuse' && <FuseChart inA={pr.p.in} current={point ? point.current : null} melt={melt} iccA={icc} width={w} height={h} />}
      {(pr.kind === 'mcb' || pr.kind === 'rcbo') && (
        <div>
          {pr.kind === 'rcbo' && <div className="mb-1 text-[0.6875rem] font-semibold text-slate-300">Sganciatore magnetotermico</div>}
          <OvercurrentChart inA={ref} curve={pr.p.curve} band={band} model={pr.kind === 'mcb' ? thermalModelOf(pr.p) : undefined} other={other} point={point} iccA={icc} width={w} height={h} />
        </div>
      )}
      {(pr.kind === 'rcd' || pr.kind === 'rcbo') && (
        <div>
          {pr.kind === 'rcbo' && <div className="mb-1 text-[0.6875rem] font-semibold text-slate-300">Sganciatore differenziale</div>}
          <ResidualChart idnMa={pr.p.idn} selective={selective} residualA={residual} width={w} height={Math.round(h * 0.85)} />
        </div>
      )}
    </div>
  );

  return (
    <Section title="Curva di intervento">
      <div className="flex items-center justify-end">
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] text-slate-400 hover:bg-slate-800 hover:text-slate-100" onClick={() => setBig(true)}>
          <Maximize2 size={12} /> Ingrandisci
        </button>
      </div>
      {charts(290, 230)}
      {(pr.kind === 'mcb' || pr.kind === 'rcbo') && (
        <>
          <button className="text-[0.6875rem] text-sky-300 hover:underline" onClick={() => setTable(!table)}>
            {table ? 'Nascondi i valori' : 'Mostra i valori in tabella'}
          </button>
          {table && <OvercurrentTable inA={ref} curve={pr.p.curve} band={band} />}
        </>
      )}
      {sel && (
        <p className={`text-[0.71875rem] leading-snug ${sel.total ? 'text-emerald-300/90' : 'text-amber-200'}`}>
          {sel.text}
        </p>
      )}
      <p className="text-[0.65625rem] leading-snug text-slate-500">
        Curva del modello del simulatore, costruita sui punti convenzionali della norma di prodotto: non è la curva del costruttore. Il punto bianco mostra la corrente attuale e il tempo d'intervento previsto tenendo conto della memoria termica{pr.kind === 'fuse' ? ' (per il fusibile: del consumo già accumulato dalla cartuccia)' : ''}.
      </p>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" onMouseDown={() => setBig(false)}>
          <div className="max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <h2 className="text-[0.875rem] font-semibold text-slate-100">Curva di intervento · {comp.label}</h2>
              <button className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-800" onClick={() => setBig(false)}>
                <X size={16} />
              </button>
            </div>
            {charts(Math.max(300, Math.min(640, window.innerWidth - 110)), 400)}
            {(pr.kind === 'mcb' || pr.kind === 'rcbo') && <OvercurrentTable inA={ref} curve={pr.p.curve} band={band} />}
          </div>
        </div>
      )}
    </Section>
  );
}
