import type { NodeProps } from '@xyflow/react';
import { Activity, AirVent, CookingPot, Droplets, Flame, Lightbulb, Plug, Power, Refrigerator, Sun, WashingMachine, Zap } from 'lucide-react';
import { memo } from 'react';
import { deviceCurrent } from '../../engine/simulate';
import { TERMINAL_Y_BOTTOM, TERMINAL_Y_TOP } from '../../model/geometry';
import { H_TRIP } from '../../protection/curves';
import type { TripCause } from '../../protection/stepper';

const TRIP_LABEL: Record<TripCause, string> = { termico: 'scatto termico', magnetico: 'scatto magnetico', differenziale: 'scatto diff.', prova: 'prova T', fusione: 'fusibile fuso' };
import { componentHeight, componentWidth, getTerminals } from '../../model/terminals';
import type { ComponentInstance, LoadCategory } from '../../model/types';
import { meterPower, useStore } from '../../store/projectStore';
import { fmt, fmtCurrent, fmtPower } from '../../ui/format';
import { DinDeviceSvg } from '../svg/DinDeviceSvg';
import { TerminalHandle } from './TerminalHandle';

export type CompNodeData = { componentId: string };

function useComponent(id: string): ComponentInstance | undefined {
  return useStore((s) => s.project.components.find((c) => c.id === id));
}

/** Il componente è collegato con almeno un conduttore al componente selezionato. */
function useLinkedToSelection(id: string): boolean {
  return useStore((s) => {
    const sel = s.selection?.type === 'component' ? s.selection.id : null;
    if (!sel || sel === id) return false;
    const a = `${sel}:`;
    const b = `${id}:`;
    return s.project.wires.some((w) => (w.from.startsWith(a) && w.to.startsWith(b)) || (w.from.startsWith(b) && w.to.startsWith(a)));
  });
}

function useHasIssue(id: string): 'errore' | 'attenzione' | null {
  return useStore((s) => {
    let level: 'errore' | 'attenzione' | null = null;
    for (const i of s.issues) {
      if (!i.componentIds.includes(id)) continue;
      if (i.severity === 'errore') return 'errore';
      if (i.severity === 'attenzione') level = 'attenzione';
    }
    return level;
  });
}

function IssueDot({ level }: { level: 'errore' | 'attenzione' | null }) {
  if (!level) return null;
  return (
    <span
      className={`absolute -right-1.5 -top-1.5 z-10 h-3 w-3 rounded-full ring-2 ring-slate-900 ${level === 'errore' ? 'bg-red-500' : 'bg-amber-400'}`}
      title={level === 'errore' ? 'Errori rilevati: vedi Verifiche' : 'Avvisi: vedi Verifiche'}
    />
  );
}

/** Dispositivo modulare su guida DIN. */
export const DinNode = memo(function DinNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const showLabels = useStore((s) => s.showLabels);
  const toggle = useStore((s) => s.toggleComponent);
  const current = useStore((s) => (s.result ? deviceCurrent(s.result, id) : 0));
  const running = useStore((s) => s.running);
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  const tripped = useStore((s) => s.prot[id]?.tripped);
  const spdOver = useStore((s) => !!(s.result && s.result.ok && s.result.alerts.some((a) => a.code === 'SPD_TOV' && a.componentIds.includes(id))));
  const heat = useStore((s) => s.prot[id]?.heat ?? 0);
  const melt = useStore((s) => Math.max(0, ...(s.prot[id]?.melt ?? []).filter((m) => m < 1)));
  const testRcd = useStore((s) => s.testRcd);
  const meterP = useStore((s) => {
    const c = s.project.components.find((x) => x.id === id);
    return c ? meterPower(s.result, c) : 0;
  });
  const meterE = useStore((s) => s.meterEnergy[id]);
  if (!comp) return null;
  const w = componentWidth(comp);
  const residual = comp.params.kind === 'rcd' || comp.params.kind === 'rcbo';
  const isFuse = comp.params.kind === 'fuse';
  const heatPct = isFuse ? Math.min(100, melt * 100) : Math.min(100, (heat / H_TRIP) * 100);
  const blown = isFuse && !!comp.blown?.length;
  const terms = getTerminals(comp);
  const hasLever = comp.params.kind !== 'bar' && comp.params.kind !== 'spd' && comp.params.kind !== 'meter';
  return (
    <div className={`relative rounded-[3px] ${selected ? 'node-selected' : linked ? 'node-linked' : ''}`} style={{ width: w, height: componentHeight(comp) }}>
      <IssueDot level={issue} />
      <DinDeviceSvg
        comp={comp}
        width={w}
        terminals={terms}
        showLabels={showLabels}
        tripped={!!tripped || spdOver}
        onToggle={hasLever ? () => toggle(id) : undefined}
        onTest={residual ? () => testRcd(id) : undefined}
        meter={comp.params.kind === 'meter' && running ? { p: meterP, fwd: meterE?.fwd ?? 0, rev: meterE?.rev ?? 0 } : null}
      />
      {running && (comp.params.kind === 'mcb' || comp.params.kind === 'rcbo' || isFuse) && heatPct > 1 && (
        <div className="pointer-events-none absolute bottom-[30px] left-[3px] right-[3px] h-[3px] rounded bg-slate-500/50" title={isFuse ? 'Consumo della cartuccia' : 'Stato termico'}>
          <div className={`h-full rounded ${heatPct > 80 ? 'bg-red-500' : 'bg-orange-400'}`} style={{ width: `${heatPct}%` }} />
        </div>
      )}
      {tripped && (
        <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-amber-500 px-1 text-[8.5px] font-bold uppercase leading-[13px] text-slate-950">
          {TRIP_LABEL[tripped]}
        </div>
      )}
      {blown && (
        <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-red-600 px-1 text-[8.5px] font-bold uppercase leading-[13px] text-white">
          {TRIP_LABEL.fusione}
        </div>
      )}
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={t.side === 'top' ? TERMINAL_Y_TOP : TERMINAL_Y_BOTTOM} ownerLabel={comp.label} />
      ))}
      {running && hasLever && current > 0.005 && (
        <div className="pointer-events-none absolute left-1/2 top-[100px] -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/85 px-1 font-mono text-[9px] leading-[14px] text-amber-300">
          {fmtCurrent(current)}
        </div>
      )}
    </div>
  );
});

/** Punto di consegna del distributore. */
export const SupplyNode = memo(function SupplyNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const running = useStore((s) => s.running);
  const res = useStore((s) => (s.result && s.result.ok ? s.result.supply : null));
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  if (!comp || comp.params.kind !== 'supply') return null;
  const p = comp.params.p;
  const terms = getTerminals(comp);
  const h = componentHeight(comp);
  return (
    <div
      className={`relative rounded-lg border bg-slate-800 shadow-lg ${selected ? 'node-selected border-sky-400' : linked ? 'node-linked border-amber-400' : 'border-slate-600'}`}
      style={{ width: componentWidth(comp), height: h }}
    >
      <IssueDot level={issue} />
      <div className="flex items-center gap-1.5 border-b border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200">
        <Zap size={13} className={running ? 'text-amber-400' : 'text-slate-500'} />
        {comp.label} · Contatore
        <span className={`ml-auto h-2 w-2 rounded-full ${running ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400' : 'bg-slate-600'}`} />
      </div>
      <div className="mx-2.5 mt-1.5 rounded bg-[#0d1a12] px-2 py-1 font-mono text-[11px] leading-4 text-emerald-300">
        {running && res ? (
          res.phases.length === 3 ? (
            <>
              {res.phases.map((ph) => (
                <div key={ph.phase}>
                  L{ph.phase} {fmt(ph.v, 1)} V · {fmtCurrent(ph.i)}
                </div>
              ))}
              <div>
                N {fmtCurrent(res.iN)} · {res.p < -1 ? `◄ immette ${fmtPower(-res.p)}` : fmtPower(res.p)}
              </div>
            </>
          ) : (
            <>
              <div>
                {fmt(res.v, 1)} V · {fmtCurrent(res.i)}
              </div>
              <div className={res.p < -1 ? 'text-amber-300' : undefined}>{res.p < -1 ? `◄ immette ${fmtPower(-res.p)}` : fmtPower(res.p)}</div>
            </>
          )
        ) : (
          <>
            <div className="text-emerald-700">
              {p.phases === 3 ? `${Math.round(p.voltage * Math.sqrt(3))}/${p.voltage} V 3F+N` : `${p.voltage} V`} · {p.frequency} Hz · TT
            </div>
            <div className="text-emerald-700">{p.contractKW} kW impegnati</div>
          </>
        )}
      </div>
      <div className="absolute bottom-[18px] left-0 right-0 flex text-[9px] font-mono text-slate-400">
        {terms.map((t) => (
          <span key={t.key} className="absolute -translate-x-1/2" style={{ left: t.x }}>
            {t.label}
          </span>
        ))}
      </div>
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={h - 6} ownerLabel={comp.label} />
      ))}
    </div>
  );
});

/** Impianto di terra: dispersore e collettore. */
export const EarthNode = memo(function EarthNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  if (!comp || comp.params.kind !== 'earth') return null;
  const terms = getTerminals(comp);
  const w = componentWidth(comp);
  return (
    <div
      className={`relative rounded-lg border bg-slate-800 shadow-lg ${selected ? 'node-selected border-sky-400' : linked ? 'node-linked border-amber-400' : 'border-slate-600'}`}
      style={{ width: w, height: componentHeight(comp) }}
    >
      <IssueDot level={issue} />
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={6} ownerLabel={comp.label} />
      ))}
      <div className="pt-4 text-center font-mono text-[9px] text-green-400">PE</div>
      <svg width={w} height={44} viewBox={`0 0 ${w} 44`} className="block">
        <line x1={w / 2} y1={0} x2={w / 2} y2={16} stroke="#22c55e" strokeWidth={2} />
        <line x1={w / 2 - 22} y1={16} x2={w / 2 + 22} y2={16} stroke="#cbd5e1" strokeWidth={2} />
        <line x1={w / 2 - 14} y1={23} x2={w / 2 + 14} y2={23} stroke="#cbd5e1" strokeWidth={2} />
        <line x1={w / 2 - 6} y1={30} x2={w / 2 + 6} y2={30} stroke="#cbd5e1" strokeWidth={2} />
      </svg>
      <div className="text-center text-[11px] font-semibold text-slate-200">{comp.label} · Dispersore</div>
      <div className="text-center font-mono text-[10px] text-slate-400">RA = {fmt(comp.params.p.ra, 0)} Ω</div>
    </div>
  );
});

const LOAD_ICON: Record<LoadCategory, typeof Plug> = {
  illuminazione: Lightbulb,
  prese: Plug,
  cucina: CookingPot,
  scaldabagno: Droplets,
  climatizzazione: AirVent,
  lavaggio: WashingMachine,
  refrigerazione: Refrigerator,
  riscaldamento: Flame,
  generico: Activity,
};

/** Utilizzatore alimentato da una conduttura in partenza dal quadro. */
export const LoadNode = memo(function LoadNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const running = useStore((s) => s.running);
  const res = useStore((s) => (s.result && s.result.ok ? s.result.loads.get(id) : undefined));
  const toggleLoad = useStore((s) => s.toggleLoad);
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  const faultCount = useStore((s) => (s.project.faults ?? []).filter((f) => f.targetId === id && !f.hidden).length);
  const touch = useStore((s) => (s.result && s.result.ok ? (s.result.touchV.get(id) ?? null) : null));
  const clampOn = useStore((s) => s.clampTarget?.kind === 'line' && s.clampTarget.id === id);
  if (!comp || comp.params.kind !== 'load') return null;
  const p = comp.params.p;
  const Icon = LOAD_ICON[p.category];
  const terms = getTerminals(comp);
  const working = running && !!res && res.i > 0.001;
  return (
    <div
      className={`relative rounded-lg border bg-slate-800 shadow-lg ${selected ? 'node-selected border-sky-400' : linked ? 'node-linked border-amber-400' : 'border-slate-600'}`}
      style={{ width: componentWidth(comp), height: componentHeight(comp) }}
    >
      <IssueDot level={issue} />
      {faultCount > 0 && (
        <div className="absolute -left-2 -top-2 z-10 flex h-5 items-center gap-0.5 rounded-full bg-red-600 px-1.5 text-[9px] font-bold text-white ring-2 ring-slate-900" title="Guasti attivi su questa linea">
          <Zap size={10} /> {faultCount}
        </div>
      )}
      {clampOn && <div className="pointer-events-none absolute inset-[-5px] rounded-xl border-2 border-dashed border-yellow-400" />}
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={6} ownerLabel={comp.label} />
      ))}
      <div className="flex pt-3.5 font-mono text-[9px] text-slate-400">
        {terms.map((t) => (
          <span key={t.key} className="absolute -translate-x-1/2" style={{ left: t.x }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 px-2.5">
        <Icon size={20} className={working ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.6)]' : 'text-slate-500'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold text-slate-100">{p.name}</div>
          <div className="font-mono text-[10px] text-slate-400">
            {comp.label} · {p.phases === 3 ? '3F · ' : ''}
            {(p.cosPhi ?? 1) < 1 ? `cos φ ${fmt(p.cosPhi ?? 1, 2)} · ` : ''}
            {fmtPower(p.powerW)} · {p.cableSection} mm² · {p.cableLength} m
          </div>
        </div>
        <button
          className={`nodrag flex h-6 w-6 items-center justify-center rounded border ${p.on ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-600 text-slate-500'}`}
          title={p.on ? 'Spegni l\'utilizzatore' : 'Accendi l\'utilizzatore'}
          onClick={(e) => {
            e.stopPropagation();
            toggleLoad(id);
          }}
        >
          <Power size={13} />
        </button>
      </div>
      <div className="mx-2.5 mt-2 rounded bg-slate-950/70 px-2 py-1 font-mono text-[10px] leading-4">
        {!running ? (
          <span className="text-slate-500">non alimentato</span>
        ) : res && res.energized && res.phaseV ? (
          <span className={working ? 'text-amber-200' : 'text-slate-300'}>
            {res.phaseV.map((v, k) => (
              <span key={k} className="block">
                L{k + 1} {fmt(v, 1)} V · {fmtCurrent(res.phaseI![k]!)}
              </span>
            ))}
            {fmtPower(res.p)}
          </span>
        ) : res && res.energized ? (
          <span className={working ? 'text-amber-200' : 'text-slate-300'}>
            {fmt(res.v, 1)} V · {fmtCurrent(res.i)} · {fmtPower(res.p)}
          </span>
        ) : (
          <span className="text-slate-500">0 V — senza tensione</span>
        )}
      </div>
      {running && touch !== null && touch > 50 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded bg-red-600 px-2 py-0.5 text-center text-[10px] font-bold text-white">
          ⚠ Massa a {fmt(touch, 0)} V verso terra
        </div>
      )}
    </div>
  );
});

/** Pulsante a parete: clic per inviare un impulso (contatto chiuso per circa 0,35 s). */
export const ButtonNode = memo(function ButtonNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const press = useStore((s) => s.pressButton);
  const running = useStore((s) => s.running);
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  if (!comp || comp.params.kind !== 'button') return null;
  const terms = getTerminals(comp);
  return (
    <div
      className={`relative rounded-lg border bg-slate-800 shadow-lg ${selected ? 'node-selected border-sky-400' : linked ? 'node-linked border-amber-400' : 'border-slate-600'}`}
      style={{ width: componentWidth(comp), height: componentHeight(comp) }}
    >
      <IssueDot level={issue} />
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={6} ownerLabel={comp.label} />
      ))}
      <div className="flex pt-3.5 font-mono text-[9px] text-slate-400">
        {terms.map((t) => (
          <span key={t.key} className="absolute -translate-x-1/2" style={{ left: t.x }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 px-2.5">
        <button
          className={`nodrag flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-transform active:scale-90 ${
            comp.closed ? 'border-amber-300 bg-amber-400 text-slate-900' : 'border-slate-400 bg-slate-200 text-slate-700 hover:bg-white'
          }`}
          title={running ? 'Premi il pulsante' : 'Avvia la simulazione per usare il pulsante'}
          onClick={(e) => {
            e.stopPropagation();
            press(id);
          }}
        >
          ●
        </button>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-slate-100">{comp.params.p.name}</div>
          <div className="font-mono text-[10px] text-slate-400">
            {comp.label} · {comp.closed ? 'premuto' : 'NA'}
          </div>
        </div>
      </div>
    </div>
  );
});

/** Generatore fotovoltaico: griglia di moduli con il punto di lavoro attuale. */
export const PvArrayNode = memo(function PvArrayNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const running = useStore((s) => s.running);
  const res = useStore((s) => (s.result && s.result.ok ? s.result.pvArrays.get(id) : undefined));
  const irr = useStore((s) => s.project.pv?.irradiance ?? 1000);
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  if (!comp || comp.params.kind !== 'pv-array') return null;
  const p = comp.params.p;
  const terms = getTerminals(comp);
  const w = componentWidth(comp);
  const h = componentHeight(comp);
  const n = Math.max(1, Math.round(p.modulesPerString));
  const cols = Math.min(n, 8);
  const lit = irr > 0;
  return (
    <div
      className={`relative rounded-lg border bg-slate-800 shadow-lg ${selected ? 'node-selected border-sky-400' : linked ? 'node-linked border-amber-400' : 'border-slate-600'}`}
      style={{ width: w, height: h }}
    >
      <IssueDot level={issue} />
      <div className="flex items-center gap-1.5 border-b border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
        <Sun size={13} className={lit ? 'text-amber-300' : 'text-slate-500'} />
        <span className="truncate">
          {comp.label} · {p.name}
        </span>
        <span className="ml-auto font-mono text-[9.5px] font-normal text-slate-400">{fmt(irr, 0)} W/m²</span>
      </div>
      <div className="mx-2.5 mt-1.5 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} title={`${p.strings} × ${n} moduli da ${p.moduleWp} Wp`}>
        {Array.from({ length: Math.min(n * p.strings, 16) }, (_, k) => (
          <div
            key={k}
            className="h-[15px] rounded-[2px] border border-sky-300/30"
            style={{ background: lit ? 'linear-gradient(135deg,#1e3a8a,#1d4ed8 60%,#60a5fa)' : '#172036' }}
          />
        ))}
      </div>
      <div className="mx-2.5 mt-1.5 rounded bg-slate-950/70 px-2 py-0.5 font-mono text-[10px] leading-4 text-slate-300">
        {fmt((p.moduleWp * n * p.strings) / 1000, 2)} kWp · {p.strings}×{n}
        {running && res ? (
          <span className={res.pOut > 1 ? 'text-amber-200' : 'text-slate-400'}>
            {' '}
            · {res.pOut > 1 ? `${fmtPower(res.pOut)} DC` : `Voc ${fmt(res.voc, 0)} V`}
          </span>
        ) : null}
      </div>
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={h - 6} ownerLabel={comp.label} />
      ))}
      {terms.map((t) => (
        <span key={`l-${t.key}`} className="absolute -translate-x-1/2 font-mono text-[9px] text-slate-400" style={{ left: t.x, top: h - 24 }}>
          {t.label}
        </span>
      ))}
    </div>
  );
});

const INV_STATE_STYLE: Record<string, string> = {
  produzione: 'text-emerald-300',
  notte: 'text-slate-400',
  'rete assente': 'text-amber-300',
  'dc scollegato': 'text-slate-400',
  'polarità invertita': 'text-red-300',
  'tensione dc bassa': 'text-amber-300',
  'tensione dc eccessiva': 'text-red-300',
  'sovratensione rete': 'text-amber-300',
};

/** Inverter: ingressi DC in alto, uscita AC in basso, stato e potenza immessa. */
export const InverterNode = memo(function InverterNode({ data, selected }: NodeProps) {
  const id = (data as CompNodeData).componentId;
  const comp = useComponent(id);
  const running = useStore((s) => s.running);
  const res = useStore((s) => (s.result && s.result.ok ? s.result.inverters.get(id) : undefined));
  const issue = useHasIssue(id);
  const linked = useLinkedToSelection(id);
  if (!comp || comp.params.kind !== 'inverter') return null;
  const p = comp.params.p;
  const terms = getTerminals(comp);
  const w = componentWidth(comp);
  const h = componentHeight(comp);
  const producing = running && res?.state === 'produzione' && res.pac > 1;
  return (
    <div
      className={`relative rounded-lg border bg-slate-800 shadow-lg ${selected ? 'node-selected border-sky-400' : linked ? 'node-linked border-amber-400' : 'border-slate-600'}`}
      style={{ width: w, height: h }}
    >
      <IssueDot level={issue} />
      {terms.map((t) => (
        <TerminalHandle key={t.key} t={t} y={t.side === 'top' ? 6 : h - 6} ownerLabel={comp.label} />
      ))}
      {terms.map((t) => (
        <span key={`l-${t.key}`} className="absolute -translate-x-1/2 font-mono text-[9px] text-slate-400" style={{ left: t.x, top: t.side === 'top' ? 13 : h - 24 }}>
          {t.label}
        </span>
      ))}
      <div className="mt-7 flex items-center gap-2 px-2.5">
        <div className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded border font-mono text-[10px] leading-3 ${producing ? 'border-emerald-500/60 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>
          <span>=</span>
          <span>~</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold text-slate-100">
            {comp.label} · Inverter {fmtPower(p.pacW)}
          </div>
          <div className="font-mono text-[9.5px] text-slate-400">
            MPPT {p.mpptMinV}–{p.mpptMaxV} V{p.batteryKWh > 0 ? ` · batteria ${fmt(p.batteryKWh, 1)} kWh` : ''}
          </div>
        </div>
      </div>
      <div className="mx-2.5 mt-1.5 rounded bg-[#0d1a12] px-2 py-1 font-mono text-[10px] leading-4">
        {!running || !res ? (
          <span className="text-slate-500">spento (simulazione ferma)</span>
        ) : (
          <>
            <div className={INV_STATE_STYLE[res.state] ?? 'text-slate-300'}>{res.state === 'produzione' ? `▲ immette ${fmtPower(res.pac)}` : res.state}</div>
            {res.state === 'produzione' && (
              <div className="text-slate-400">
                DC {fmt(res.vdc, 0)} V · {fmtCurrent(res.idc)}
                {res.clipped ? ' · limitato' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export const nodeTypes = { din: DinNode, supply: SupplyNode, earth: EarthNode, load: LoadNode, button: ButtonNode, 'pv-array': PvArrayNode, inverter: InverterNode };
