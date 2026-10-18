import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { deviceCurrent } from '../engine/simulate';
import { H_TRIP } from '../protection/curves';
import { PhasorDiagram } from './PhasorDiagram';
import { analyzeCircuits } from '../graph/netGraph';
import { isResidualDevice, isSwitchingDevice } from '../model/terminals';
import { useStore } from '../store/projectStore';
import { SeverityIcon } from './PropertiesPanel';
import { fmt, fmtCurrent, fmtPower, fmtTime } from './format';

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[10.5px] text-slate-500">{label}</div>
      <div className="font-mono text-[17px] leading-6 text-emerald-300">{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const running = useStore((s) => s.running);
  const result = useStore((s) => s.result);
  const project = useStore((s) => s.project);
  const events = useStore((s) => s.events);
  const select = useStore((s) => s.select);
  const prot = useStore((s) => s.prot);
  const faultCount = useStore((s) => (s.project.faults ?? []).length);
  const [open, setOpen] = useState(true);
  if (!running) return null;

  const header = (
    <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">
      {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />} Dashboard di simulazione
      {faultCount > 0 && <span className="rounded bg-red-600 px-1.5 normal-case tracking-normal text-white">{faultCount} {faultCount === 1 ? 'guasto inserito' : 'guasti inseriti'}</span>}
      {result && result.ok && result.alerts.some((a) => a.severity === 'errore') && (
        <span className="rounded bg-red-500/20 px-1.5 normal-case tracking-normal text-red-300">guasto in corso</span>
      )}
    </button>
  );

  if (!result || !result.ok) {
    return (
      <div className="shrink-0 border-t border-slate-800 bg-slate-900">
        {header}
        {open && <div className="p-4 text-[12px] text-amber-300">{result ? result.reason : 'Calcolo in corso…'}</div>}
      </div>
    );
  }

  const circuits = analyzeCircuits(project);
  const tri = result.supply.phases.length === 3;
  const devices = project.components.filter((c) => isSwitchingDevice(c.params.kind));

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900">
      {header}
      {open && (
        <div className="overflow-x-auto"><div className={`grid h-[250px] gap-3 p-3 ${tri ? 'min-w-[1280px] grid-cols-[250px_220px_1.25fr_1fr_1fr]' : 'min-w-[1040px] grid-cols-[250px_1.25fr_1fr_1fr]'}`}>
          <div className="grid grid-cols-2 content-start gap-2">
            {tri ? (
              <>
                <Kpi label="U12 · U23 · U31" value={`${result.supply.lineV.map((u) => fmt(u, 0)).join('·')}`} sub="tensioni concatenate [V]" />
                <Kpi label="I1 · I2 · I3" value={result.supply.phases.map((p) => fmt(p.i, 1)).join('·')} sub={`neutro ${fmtCurrent(result.supply.iN)}`} />
              </>
            ) : (
              <>
                <Kpi label="Tensione al contatore" value={`${fmt(result.supply.v, 1)} V`} sub="L-N ai morsetti" />
                <Kpi label="Corrente totale" value={fmtCurrent(result.supply.i)} />
              </>
            )}
            <Kpi label="Potenza attiva" value={fmtPower(result.supply.p)} sub={`cos φ ${fmt(result.supply.pf, 3)}`} />
            <Kpi label="Impedenza impianto" value={result.supply.zExt === null ? '∞' : `${fmt(result.supply.zExt, 2)} Ω`} sub="vista dalla fornitura" />
          </div>

          {tri && (
            <div className="min-h-0 rounded-md border border-slate-800 p-1.5">
              <div className="mb-0.5 text-[10.5px] text-slate-500">Diagramma fasoriale</div>
              <PhasorDiagram result={result} project={project} />
            </div>
          )}

          <div className="min-h-0 overflow-y-auto rounded-md border border-slate-800">
            <table className="w-full text-[11.5px]">
              <thead className="sticky top-0 bg-slate-900 text-left text-[10.5px] text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Circuito</th>
                  {tri && <th className="px-2 py-1 font-medium">Fase</th>}
                  <th className="px-2 py-1 text-right font-medium">V</th>
                  <th className="px-2 py-1 text-right font-medium">I</th>
                  <th className="px-2 py-1 text-right font-medium">P</th>
                  <th className="px-2 py-1 text-right font-medium">ΔV</th>
                </tr>
              </thead>
              <tbody className="whitespace-nowrap font-mono">
                {circuits.map((c) => {
                  const load = project.components.find((x) => x.id === c.loadId)!;
                  const r = result.loads.get(c.loadId);
                  const name = load.params.kind === 'load' ? load.params.p.name : load.label;
                  return (
                    <tr key={c.loadId} className="cursor-pointer border-t border-slate-800/70 hover:bg-slate-800/50" onClick={() => select({ type: 'component', id: c.loadId })}>
                      <td className="px-2 py-1 font-sans text-slate-200">
                        {name} <span className="text-slate-500">{load.label}</span>
                      </td>
                      {tri && (
                        <td className="px-2 py-1 text-slate-400">{c.threePhase ? '3F' : c.phases[0] ? `L${c.phases[0]}` : '—'}</td>
                      )}
                      <td className="px-2 py-1 text-right text-slate-300">{r?.energized ? fmt(r.v, 1) : '—'}</td>
                      <td className="px-2 py-1 text-right text-amber-200">{r ? fmtCurrent(r.i) : '—'}</td>
                      <td className="px-2 py-1 text-right text-slate-300">{r ? fmtPower(r.p) : '—'}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{r?.energized ? `${fmt(r.dropPct, 1)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-md border border-slate-800">
            <table className="w-full text-[11.5px]">
              <thead className="sticky top-0 bg-slate-900 text-left text-[10.5px] text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Dispositivo</th>
                  <th className="px-2 py-1 font-medium">Stato</th>
                  <th className="px-2 py-1 text-right font-medium">I</th>
                  <th className="px-2 py-1 text-right font-medium">I/In</th>
                  <th className="px-2 py-1 text-right font-medium">Termico</th>
                </tr>
              </thead>
              <tbody className="whitespace-nowrap font-mono">
                {devices.map((d) => {
                  const i = deviceCurrent(result, d.id);
                  const inom = 'in' in d.params.p ? d.params.p.in : 0;
                  return (
                    <tr key={d.id} className="cursor-pointer border-t border-slate-800/70 hover:bg-slate-800/50" onClick={() => select({ type: 'component', id: d.id })}>
                      <td className="px-2 py-1 text-slate-200">
                        {d.label}
                        {isResidualDevice(d.params.kind) && (
                          <span className="ml-1 text-[10px] text-slate-500">IΔ {fmt((result.residual.get(d.id) ?? 0) * 1000, 1)} mA</span>
                        )}
                      </td>
                      <td className={`px-2 py-1 font-sans ${prot[d.id]?.tripped ? 'font-semibold text-amber-300' : d.closed ? 'text-red-300' : 'text-emerald-300'}`}>
                        {prot[d.id]?.tripped ? `scattato (${prot[d.id]!.tripped})` : d.closed ? 'chiuso' : 'aperto'}
                      </td>
                      <td className="px-2 py-1 text-right text-amber-200">{fmtCurrent(i)}</td>
                      <td className={`px-2 py-1 text-right ${inom && i > inom ? 'text-red-300' : 'text-slate-400'}`}>{inom ? `${fmt((i / inom) * 100, 0)}%` : '—'}</td>
                      <td className="px-2 py-1 text-right text-slate-400">
                        {d.params.kind === 'mcb' || d.params.kind === 'rcbo' ? `${fmt(Math.min(999, ((prot[d.id]?.heat ?? 0) / H_TRIP) * 100), 0)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-800 px-2 py-1.5 text-[10.5px] text-slate-500">Termico: stato termico in % della soglia di intervento (memoria termica). Velocità del tempo selezionabile nella barra superiore.</div>
          </div>

          <div className="flex min-h-0 flex-col rounded-md border border-slate-800">
            <div className="border-b border-slate-800 px-2 py-1 text-[10.5px] text-slate-500">Registro eventi (tempo simulato)</div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {[...events].reverse().map((e) => (
                <div key={e.id} className="flex gap-2 px-1 py-0.5 text-[11px]">
                  <span className="shrink-0 font-mono text-slate-500">{fmtTime(e.t)}</span>
                  <SeverityIcon s={e.level} size={12} />
                  <span className={e.level === 'errore' ? 'text-red-300' : e.level === 'attenzione' ? 'text-amber-200' : 'text-slate-300'}>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
