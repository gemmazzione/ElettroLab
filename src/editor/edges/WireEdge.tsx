import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { abs } from '../../engine/complex';
import { WIRE_COLOR_HEX, WIRE_STROKE_FOR_SECTION } from '../../model/constants';
import { useStore } from '../../store/projectStore';
import { fmtCurrent } from '../../ui/format';

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
      {showLabels && flowing && !broken && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded bg-slate-950/90 px-1 font-mono text-[9px] leading-[13px] text-amber-200 ring-1 ring-slate-700"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {fmtCurrent(current)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { wire: WireEdge };
