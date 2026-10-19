import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { abs } from '../../engine/complex';
import { WIRE_COLOR_HEX, WIRE_STROKE_FOR_SECTION } from '../../model/constants';
import { useStore } from '../../store/projectStore';
import { fmt, fmtCurrent } from '../../ui/format';

const flowingComb = (running: boolean, current: number) => running && current > 0.005;

export type WireEdgeData = { wireId: string };

/** Conduttore: il colore è l'identificazione reale del conduttore, lo spessore segue la sezione. */
export const WireEdge = memo(function WireEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const wireId = (props.data as WireEdgeData).wireId;
  const wire = useStore((s) => s.project.wires.find((w) => w.id === wireId));
  const current = useStore((s) => {
    if (!s.result || !s.result.ok) return 0;
    const i = s.result.wireI.get(wireId);
    return i ? abs(i) : 0;
  });
  const showLabels = useStore((s) => s.showLabels);
  const showLengths = useStore((s) => s.showLengths);
  const running = useStore((s) => s.running);
  const hasError = useStore((s) => s.issues.some((i) => i.severity === 'errore' && i.wireIds.includes(wireId)));
  const broken = useStore((s) => (s.project.faults ?? []).some((f) => f.type === 'open-wire' && f.targetId === wireId && !f.hidden));
  const clamped = useStore((s) => s.clampTarget?.kind === 'wire' && s.clampTarget.id === wireId);
  if (!wire) return null;

  const [path, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 6,
    offset: 16,
  });
  if (wire.comb) {
    // Pettine: barra in rame sopra i morsetti d'ingresso, un livello per dente (fase sotto, neutro sopra).
    const off = 10 + wire.comb.pin * 6;
    const yb = Math.min(sourceY, targetY) - off;
    const bar = `M${sourceX},${sourceY} V${yb} H${targetX} V${targetY}`;
    const midX = (sourceX + targetX) / 2;
    return (
      <>
        {selected && <path d={bar} fill="none" stroke="#38bdf8" strokeOpacity={0.6} strokeWidth={9} />}
        {hasError && !selected && <path d={bar} fill="none" stroke="#ef4444" strokeOpacity={0.45} strokeWidth={8} />}
        <path d={bar} fill="none" stroke="#7c3f12" strokeWidth={5} strokeLinejoin="round" />
        <BaseEdge
          id={props.id}
          path={bar}
          style={{ stroke: broken ? '#64748b' : '#d4824a', strokeWidth: 3, strokeDasharray: broken ? '4 5' : undefined, strokeLinejoin: 'round' }}
          interactionWidth={10}
        />
        {flowingComb(running, current) && <path d={bar} fill="none" stroke="#fde68a" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="2 8" className="wire-flow" pointerEvents="none" />}
        {(showLengths || (showLabels && flowingComb(running, current))) && !broken && (
          <EdgeLabelRenderer>
            <div
              className="pointer-events-none absolute whitespace-nowrap rounded bg-slate-950/90 px-1 font-mono text-[8.5px] leading-[12px] ring-1 ring-amber-800/60"
              style={{ transform: `translate(-50%, -100%) translate(${midX}px, ${yb - 2}px)` }}
            >
              {showLengths && <span className="text-orange-200">pettine {wire.conductor}</span>}
              {showLengths && showLabels && flowingComb(running, current) && <span className="text-slate-500"> · </span>}
              {showLabels && flowingComb(running, current) && <span className="text-amber-200">{fmtCurrent(current)}</span>}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
  const width = WIRE_STROKE_FOR_SECTION[wire.section];
  const color = WIRE_COLOR_HEX[wire.color];
  const flowing = running && current > 0.005;

  return (
    <>
      {selected && <path d={path} fill="none" stroke="#38bdf8" strokeOpacity={0.55} strokeWidth={width + 7} />}
      {hasError && !selected && <path d={path} fill="none" stroke="#ef4444" strokeOpacity={0.45} strokeWidth={width + 6} />}
      <path d={path} fill="none" stroke="#e2e8f0" strokeOpacity={wire.color === 'nero' ? 0.45 : 0.18} strokeWidth={width + 1.6} />
      {clamped && <path d={path} fill="none" stroke="#facc15" strokeWidth={width + 9} strokeOpacity={0.45} strokeDasharray="3 3" />}
      <BaseEdge
        id={props.id}
        path={path}
        style={{ stroke: color, strokeWidth: width, strokeDasharray: broken ? '5 7' : undefined, opacity: broken ? 0.55 : 1 }}
        interactionWidth={14}
      />
      {wire.color === 'giallo-verde' && (
        <path d={path} fill="none" stroke="#facc15" strokeWidth={width} strokeDasharray="7 7" pointerEvents="none" />
      )}
      {flowing && (
        <path d={path} fill="none" stroke="#fde68a" strokeOpacity={0.5} strokeWidth={Math.max(1, width / 2.5)} strokeDasharray="2 10" className="wire-flow" pointerEvents="none" />
      )}
      {broken && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded bg-red-600 px-1 text-[9px] font-bold leading-[13px] text-white"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            ✕ interrotto
          </div>
        </EdgeLabelRenderer>
      )}
      {!broken && ((showLabels && flowing) || showLengths) && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute whitespace-nowrap rounded bg-slate-950/90 px-1 font-mono text-[9px] leading-[13px] ring-1 ring-slate-700"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {showLengths && (
              <span className="text-sky-200" title="Sezione e lunghezza del conduttore">
                {wire.section} mm² · {fmt(wire.length, wire.length < 1 ? 2 : wire.length % 1 ? 1 : 0)} m
              </span>
            )}
            {showLengths && showLabels && flowing && <span className="text-slate-500"> · </span>}
            {showLabels && flowing && <span className="text-amber-200">{fmtCurrent(current)}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { wire: WireEdge };
