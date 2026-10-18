import { abs, sub, type Complex } from '../engine/complex';
import type { SimResult } from '../engine/simulate';
import type { Project } from '../model/types';
import { fmt } from './format';

const PHASE_COLOR = ['#c47a3c', '#e2e8f0', '#9ca3af'];

/**
 * Diagramma fasoriale delle tensioni di fase della fornitura (vertici del triangolo)
 * e dei potenziali di neutro degli utilizzatori: un punto lontano dal centro O indica
 * lo spostamento del centro stella (neutro interrotto con carichi squilibrati).
 */
export function PhasorDiagram({ result, project }: { result: Extract<SimResult, { ok: true }>; project: Project }) {
  const size = 200;
  const c = size / 2;
  const scale = (c - 22) / 240;
  const origin = result.supply.vNC;
  const pt = (v: Complex) => ({ x: c + (v.re - origin.re) * scale, y: c - (v.im - origin.im) * scale });
  const tips = result.supply.phases.map((p) => pt(p.vC));

  const neutrals = project.components
    .filter((x) => x.params.kind === 'load')
    .map((x) => ({ comp: x, r: result.loads.get(x.id) }))
    .filter((x) => x.r?.vN && x.r.energized)
    .map((x) => ({ label: x.comp.label, v: x.r!.vN!, shift: abs(sub(x.r!.vN!, origin)) }));
  const maxShift = Math.max(0, ...neutrals.map((n) => n.shift));

  return (
    <div className="flex h-full flex-col">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full max-h-[170px] w-full">
        <circle cx={c} cy={c} r={230 * scale} fill="none" stroke="#1e293b" strokeDasharray="3 4" />
        <polygon points={tips.map((t) => `${t.x},${t.y}`).join(' ')} fill="none" stroke="#334155" />
        {tips.map((t, k) => (
          <g key={k}>
            <line x1={c} y1={c} x2={t.x} y2={t.y} stroke={PHASE_COLOR[k]} strokeWidth={2} />
            <text x={c + (t.x - c) * 1.13} y={c + (t.y - c) * 1.13 + 3} textAnchor="middle" fontSize={10} fill={PHASE_COLOR[k]} fontFamily="ui-monospace, monospace">
              L{k + 1}
            </text>
          </g>
        ))}
        <circle cx={c} cy={c} r={3} fill="#4f9cf5" />
        <text x={c + 5} y={c + 12} fontSize={9} fill="#4f9cf5" fontFamily="ui-monospace, monospace">
          N
        </text>
        {neutrals
          .filter((n) => n.shift > 2)
          .map((n) => {
            const p = pt(n.v);
            return (
              <g key={n.label}>
                <line x1={c} y1={c} x2={p.x} y2={p.y} stroke="#ef4444" strokeDasharray="3 2" />
                <circle cx={p.x} cy={p.y} r={3.5} fill="#ef4444" />
                <text x={p.x + 5} y={p.y - 4} fontSize={9} fill="#fca5a5" fontFamily="ui-monospace, monospace">
                  N′ {n.label}
                </text>
              </g>
            );
          })}
      </svg>
      <div className="text-center text-[10.5px] text-slate-400">
        {maxShift > 2 ? (
          <span className="text-red-300">Spostamento del centro stella: {fmt(maxShift, 0)} V</span>
        ) : (
          'Centro stella dei carichi coincidente con il neutro'
        )}
      </div>
    </div>
  );
}
