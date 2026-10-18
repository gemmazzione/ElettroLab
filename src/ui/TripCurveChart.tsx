import { useMemo, useState, type ReactNode } from 'react';
import { MAGNETIC_BAND, MAGNETIC_TRIP_S, residualTripTime, thermalTripTime } from '../protection/curves';
import type { TripCurve } from '../model/types';
import { fmt } from './format';

/**
 * Grafici tempo-corrente generati dagli stessi modelli che decidono gli interventi nel simulatore.
 * Assi logaritmici; un solo asse per grandezza; colori validati sullo sfondo scuro dell'app.
 */

const C = {
  surface: '#0f172a',
  grid: '#1e293b',
  axis: '#475569',
  text: '#cbd5e1',
  muted: '#94a3b8',
  thermal: '#3987e5',
  magnetic: '#d95926',
  icc: '#9085e9',
  point: '#f8fafc',
};

const PAD = { l: 46, r: 12, t: 12, b: 34 };

function logScale(min: number, max: number, a: number, b: number) {
  const l0 = Math.log10(min);
  const l1 = Math.log10(max);
  return {
    to: (v: number) => a + ((Math.log10(Math.min(max, Math.max(min, v))) - l0) / (l1 - l0)) * (b - a),
    from: (px: number) => 10 ** (l0 + ((px - a) / (b - a)) * (l1 - l0)),
  };
}

export function fmtTime(t: number): string {
  if (!Number.isFinite(t)) return 'nessun intervento';
  if (t < 1) return `${fmt(t * 1000, 0)} ms`;
  if (t < 120) return `${fmt(t, t < 10 ? 1 : 0)} s`;
  if (t < 7200) return `${fmt(t / 60, 1)} min`;
  return `${fmt(t / 3600, 1)} h`;
}

const T_TICKS: [number, string][] = [
  [0.01, '10 ms'],
  [0.1, '0,1 s'],
  [1, '1 s'],
  [10, '10 s'],
  [60, '1 min'],
  [600, '10 min'],
  [3600, '1 h'],
];

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      <span>{label}</span>
    </span>
  );
}

export interface TripPoint {
  /** Corrente attuale [A] */
  current: number;
  /** Stato termico attuale (H) */
  heat: number;
}

/** Curva d'intervento di un magnetotermico: termico (modello) + fascia magnetica della curva. */
export function OvercurrentChart({
  inA,
  curve,
  point,
  iccA,
  width = 290,
  height = 230,
}: {
  inA: number;
  curve: TripCurve;
  point?: TripPoint | null;
  iccA?: number | null;
  width?: number;
  height?: number;
}) {
  const X_MIN = 1;
  const X_MAX = 100;
  const T_MIN = 0.005;
  const T_MAX = 10000;
  const x = logScale(X_MIN, X_MAX, PAD.l, width - PAD.r);
  const y = logScale(T_MIN, T_MAX, height - PAD.b, PAD.t);
  const [lo, hi] = MAGNETIC_BAND[curve];
  const [hover, setHover] = useState<number | null>(null);

  // Curva termica da freddo, fino alla soglia magnetica certa; poi intervento magnetico.
  const path = useMemo(() => {
    const pts: string[] = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      // campionamento più fitto vicino alla soglia termica, dove la curva sale verso l'asintoto
      const r = 1.3 + (hi - 1.3) * (i / n) ** 3;
      const t = thermalTripTime(0, r);
      if (!Number.isFinite(t)) continue;
      if (t > T_MAX) {
        if (!pts.length) pts.push(`M${x.to(r).toFixed(1)},${y.to(T_MAX).toFixed(1)}`);
        continue;
      }
      pts.push(`${pts.length ? 'L' : 'M'}${x.to(r).toFixed(1)},${y.to(t).toFixed(1)}`);
    }
    const tHi = thermalTripTime(0, hi);
    pts.push(`L${x.to(hi).toFixed(1)},${y.to(Math.min(tHi, T_MAX)).toFixed(1)}`);
    pts.push(`L${x.to(hi).toFixed(1)},${y.to(MAGNETIC_TRIP_S).toFixed(1)}`);
    pts.push(`L${x.to(X_MAX).toFixed(1)},${y.to(MAGNETIC_TRIP_S).toFixed(1)}`);
    return pts.join(' ');
  }, [curve, width, height]);

  const ratioNow = point ? point.current / inA : null;
  const tNow = point && ratioNow !== null ? (ratioNow >= hi ? MAGNETIC_TRIP_S : thermalTripTime(point.heat, ratioNow)) : null;
  const tHover = hover === null ? null : hover >= hi ? MAGNETIC_TRIP_S : thermalTripTime(0, hover);

  const xTicks = [1, 2, 5, 10, 20, 50, 100];
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;

  return (
    <div className="select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Curva d'intervento ${curve}${inA}: termico da 1,3·In, magnetico certo da ${hi}·In`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * width;
          if (px < PAD.l || px > width - PAD.r) return setHover(null);
          setHover(x.from(px));
        }}
      >
        <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill={C.surface} />
        {/* griglia */}
        {T_TICKS.map(([t]) => (
          <line key={`gt${t}`} x1={PAD.l} x2={width - PAD.r} y1={y.to(t)} y2={y.to(t)} stroke={C.grid} strokeWidth={1} />
        ))}
        {xTicks.map((r) => (
          <line key={`gx${r}`} y1={PAD.t} y2={height - PAD.b} x1={x.to(r)} x2={x.to(r)} stroke={C.grid} strokeWidth={1} />
        ))}
        {/* fascia magnetica della curva */}
        <rect x={x.to(lo)} y={PAD.t} width={x.to(hi) - x.to(lo)} height={plotH} fill={C.magnetic} opacity={0.16} />
        <line x1={x.to(lo)} x2={x.to(lo)} y1={PAD.t} y2={height - PAD.b} stroke={C.magnetic} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={x.to(hi)} x2={x.to(hi)} y1={PAD.t} y2={height - PAD.b} stroke={C.magnetic} strokeWidth={1} strokeDasharray="3 3" />
        {/* punti convenzionali CEI EN 60898-1 */}
        <line x1={x.to(2.55)} x2={x.to(2.55)} y1={y.to(60)} y2={y.to(1)} stroke={C.muted} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
        <circle cx={x.to(1.45)} cy={y.to(3600)} r={4} fill="none" stroke={C.muted} strokeWidth={1.5} />
        <path d={`M${x.to(1.13) - 4},${y.to(3600) - 4} l8,8 m0,-8 l-8,8`} stroke={C.muted} strokeWidth={1.5} />
        {/* curva del modello */}
        <path d={path} fill="none" stroke={C.thermal} strokeWidth={2} strokeLinejoin="round" />
        {/* Icc presunta */}
        {iccA && iccA / inA >= X_MIN && (
          <g>
            <line x1={x.to(iccA / inA)} x2={x.to(iccA / inA)} y1={PAD.t} y2={height - PAD.b} stroke={C.icc} strokeWidth={2} />
            <text x={x.to(iccA / inA) - 3} y={PAD.t + 10} textAnchor="end" fontSize={9} fill={C.text}>
              Icc
            </text>
          </g>
        )}
        {/* punto di lavoro attuale */}
        {ratioNow !== null && ratioNow > 0.02 && (
          <g>
            <line x1={x.to(ratioNow)} x2={x.to(ratioNow)} y1={PAD.t} y2={height - PAD.b} stroke={C.point} strokeWidth={1} strokeDasharray="2 3" />
            {tNow !== null && Number.isFinite(tNow) && tNow <= T_MAX && (
              <circle cx={x.to(ratioNow)} cy={y.to(Math.max(tNow, T_MIN))} r={5} fill={C.point} stroke={C.surface} strokeWidth={2} />
            )}
          </g>
        )}
        {/* crosshair */}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x.to(hover)} x2={x.to(hover)} y1={PAD.t} y2={height - PAD.b} stroke={C.text} strokeWidth={1} opacity={0.5} />
            {tHover !== null && Number.isFinite(tHover) && tHover <= T_MAX && (
              <circle cx={x.to(hover)} cy={y.to(tHover)} r={4} fill={C.thermal} stroke={C.surface} strokeWidth={2} />
            )}
          </g>
        )}
        {/* assi */}
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={height - PAD.b} stroke={C.axis} />
        <line x1={PAD.l} x2={width - PAD.r} y1={height - PAD.b} y2={height - PAD.b} stroke={C.axis} />
        {T_TICKS.map(([t, l]) => (
          <text key={`yt${t}`} x={PAD.l - 4} y={y.to(t) + 3} textAnchor="end" fontSize={8.5} fill={C.muted}>
            {l}
          </text>
        ))}
        {xTicks.map((r) => (
          <text key={`xt${r}`} x={x.to(r)} y={height - PAD.b + 12} textAnchor="middle" fontSize={8.5} fill={C.muted}>
            {r}
          </text>
        ))}
        <text x={PAD.l + plotW / 2} y={height - 6} textAnchor="middle" fontSize={9} fill={C.text}>
          Corrente in multipli di In (In = {inA} A)
        </text>
      </svg>
      <div className="mt-1 min-h-[16px] font-mono text-[10.5px] text-slate-200">
        {hover !== null ? (
          <>
            {fmt(hover, 2)}·In = {fmt(hover * inA, 1)} A → {hover >= hi ? `magnetico, ${fmtTime(MAGNETIC_TRIP_S)}` : hover >= lo ? `termico ${fmtTime(tHover ?? Infinity)} (magnetico incerto)` : fmtTime(tHover ?? Infinity)}
          </>
        ) : ratioNow !== null && point ? (
          <>
            Ora: {fmt(point.current, 2)} A = {fmt(ratioNow, 2)}·In · {tNow !== null && Number.isFinite(tNow) ? `intervento tra ${fmtTime(tNow)}` : 'nessun intervento'}
          </>
        ) : (
          <span className="text-slate-500">Passa con il mouse sul grafico per leggere i tempi.</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-300">
        <LegendItem swatch={<span className="inline-block h-0.5 w-4" style={{ background: C.thermal }} />} label="Modello (da freddo)" />
        <LegendItem
          swatch={<span className="inline-block h-3 w-3 rounded-sm" style={{ background: C.magnetic, opacity: 0.35 }} />}
          label={`Fascia magnetica ${curve} (${lo}–${hi}·In)`}
        />
        {iccA ? <LegendItem swatch={<span className="inline-block h-3 w-0.5" style={{ background: C.icc }} />} label="Icc presunta" /> : null}
        {point ? <LegendItem swatch={<span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-50" />} label="Punto di lavoro" /> : null}
        <LegendItem swatch={<span className="text-slate-400">○ ×</span>} label="1,45·In <1 h · 1,13·In ≥1 h" />
      </div>
    </div>
  );
}

/** Intervento del differenziale in funzione di IΔ/IΔn (tempi massimi di norma usati dal simulatore). */
export function ResidualChart({
  idnMa,
  selective,
  residualA,
  width = 290,
  height = 200,
}: {
  idnMa: number;
  selective: boolean;
  residualA?: number | null;
  width?: number;
  height?: number;
}) {
  const X_MIN = 0.1;
  const X_MAX = 20;
  const T_MIN = 0.01;
  const T_MAX = 2;
  const x = logScale(X_MIN, X_MAX, PAD.l, width - PAD.r);
  const y = logScale(T_MIN, T_MAX, height - PAD.b, PAD.t);
  const idn = idnMa / 1000;
  const [hover, setHover] = useState<number | null>(null);
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.b - PAD.t;
  // gradini dei tempi massimi: da 1 a 2·IΔn, da 2 a 5·IΔn, oltre 5·IΔn
  const seg = (a: number, b: number, t: number) => `M${x.to(a)},${y.to(t)} L${x.to(b)},${y.to(t)}`;
  const t1 = residualTripTime(idn, idn, selective);
  const t2 = residualTripTime(2 * idn, idn, selective);
  const t5 = residualTripTime(5 * idn, idn, selective);
  const path = `${seg(1, 2, t1)} L${x.to(2)},${y.to(t2)} ${seg(2, 5, t2).replace('M', 'L')} L${x.to(5)},${y.to(t5)} L${x.to(X_MAX)},${y.to(t5)}`;
  const ratioNow = residualA !== null && residualA !== undefined ? residualA / idn : null;
  const tAt = (m: number) => (m < 0.5 ? Infinity : m < 1 ? NaN : residualTripTime(m * idn, idn, selective));
  const yTicks: [number, string][] = [
    [0.01, '10 ms'],
    [0.04, '40 ms'],
    [0.15, '150 ms'],
    [0.3, '300 ms'],
    [1, '1 s'],
  ];

  return (
    <div className="select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Intervento del differenziale da ${idnMa} mA: nessun intervento sotto 0,5·IΔn, intervento certo da IΔn`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * width;
          if (px < PAD.l || px > width - PAD.r) return setHover(null);
          setHover(x.from(px));
        }}
      >
        <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill={C.surface} />
        {yTicks.map(([t]) => (
          <line key={`g${t}`} x1={PAD.l} x2={width - PAD.r} y1={y.to(t)} y2={y.to(t)} stroke={C.grid} />
        ))}
        {/* zona di incertezza 0,5-1·IΔn */}
        <rect x={x.to(0.5)} y={PAD.t} width={x.to(1) - x.to(0.5)} height={plotH} fill={C.magnetic} opacity={0.16} />
        <text x={(x.to(0.5) + x.to(1)) / 2} y={PAD.t + 12} textAnchor="middle" fontSize={8.5} fill={C.text}>
          incerto
        </text>
        <text x={(x.to(X_MIN) + x.to(0.5)) / 2} y={PAD.t + 12} textAnchor="middle" fontSize={8.5} fill={C.muted}>
          non interviene
        </text>
        <line x1={x.to(1)} x2={x.to(1)} y1={PAD.t} y2={height - PAD.b} stroke={C.thermal} strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={C.thermal} strokeWidth={2} />
        {ratioNow !== null && ratioNow > X_MIN && (
          <g>
            <line x1={x.to(ratioNow)} x2={x.to(ratioNow)} y1={PAD.t} y2={height - PAD.b} stroke={C.point} strokeDasharray="2 3" />
            {ratioNow >= 1 && <circle cx={x.to(ratioNow)} cy={y.to(tAt(ratioNow))} r={5} fill={C.point} stroke={C.surface} strokeWidth={2} />}
          </g>
        )}
        {hover !== null && <line x1={x.to(hover)} x2={x.to(hover)} y1={PAD.t} y2={height - PAD.b} stroke={C.text} opacity={0.5} pointerEvents="none" />}
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={height - PAD.b} stroke={C.axis} />
        <line x1={PAD.l} x2={width - PAD.r} y1={height - PAD.b} y2={height - PAD.b} stroke={C.axis} />
        {yTicks.map(([t, l]) => (
          <text key={t} x={PAD.l - 4} y={y.to(t) + 3} textAnchor="end" fontSize={8.5} fill={C.muted}>
            {l}
          </text>
        ))}
        {[0.1, 0.5, 1, 2, 5, 10, 20].map((m) => (
          <text key={m} x={x.to(m)} y={height - PAD.b + 12} textAnchor="middle" fontSize={8.5} fill={C.muted}>
            {fmt(m, m < 1 ? 1 : 0)}
          </text>
        ))}
        <text x={PAD.l + plotW / 2} y={height - 6} textAnchor="middle" fontSize={9} fill={C.text}>
          Corrente differenziale in multipli di IΔn ({idnMa} mA)
        </text>
      </svg>
      <div className="mt-1 min-h-[16px] font-mono text-[10.5px] text-slate-200">
        {hover !== null ? (
          <>
            {fmt(hover, 2)}·IΔn = {fmt(hover * idnMa, hover * idnMa < 10 ? 1 : 0)} mA →{' '}
            {hover < 0.5 ? 'non deve intervenire' : hover < 1 ? 'intervento possibile, non garantito' : `intervento entro ${fmtTime(tAt(hover))}`}
          </>
        ) : ratioNow !== null && residualA !== null && residualA !== undefined ? (
          <>
            Ora: IΔ = {fmt(residualA * 1000, 1)} mA = {fmt(ratioNow, 2)}·IΔn
          </>
        ) : (
          <span className="text-slate-500">Tempi massimi di norma {selective ? '(selettivo S)' : '(tipo generale)'}.</span>
        )}
      </div>
    </div>
  );
}

/** Valori della curva in forma di tabella (accessibilità e lettura precisa). */
export function OvercurrentTable({ inA, curve }: { inA: number; curve: TripCurve }) {
  const [lo, hi] = MAGNETIC_BAND[curve];
  const rows = [1.13, 1.3, 1.45, 2, 2.55, 3, lo, hi, 20, 50].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  return (
    <table className="mt-2 w-full text-[10.5px]">
      <thead className="text-left text-slate-500">
        <tr>
          <th className="font-medium">I/In</th>
          <th className="font-medium">Corrente</th>
          <th className="font-medium">Tempo (modello, da freddo)</th>
        </tr>
      </thead>
      <tbody className="font-mono text-slate-300">
        {rows.map((r) => (
          <tr key={r}>
            <td>{fmt(r, 2)}</td>
            <td>{fmt(r * inA, 1)} A</td>
            <td>{r >= hi ? `magnetico ${fmtTime(MAGNETIC_TRIP_S)}` : `${fmtTime(thermalTripTime(0, r))}${r >= lo ? ' (o magnetico)' : ''}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

