import { useRef, useState, type PointerEvent } from 'react';
import { f } from '../../pvdesign/calc';
import { LOAD_PROFILES, MONTH_DAYS, MONTH_LOAD_WEIGHTS, type LoadProfileId } from '../../pvdesign/data';

/*
 * Profilo dei consumi disegnato a mano: 24 barre, una per ora, da tracciare trascinando il puntatore.
 * Le barre danno la FORMA della giornata; l'energia totale resta quella del consumo annuo, ripartita sui giorni.
 * Durante il disegno la scala delle barre è fissa (non «salta»); le etichette in kW si riferiscono alla giornata media.
 */

const W = 720;
const H = 220;
const PAD = { l: 48, r: 8, t: 12, b: 26 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

export function LoadProfileEditor({ weights, annualKWh, onChange }: { weights: number[]; annualKWh: number; onChange: (w: number[]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [scale, setScale] = useState(() => Math.max(1, ...weights) * 1.25);
  const last = useRef<{ hour: number; value: number } | null>(null);
  const w = draft ?? weights;
  const sum = w.reduce((a, b) => a + b, 0);
  // Giornata media: consumo annuo / 365. Potenza media dell'ora h = energia del giorno × peso / somma dei pesi.
  const dayKWh = annualKWh / 365;
  const kwOf = (raw: number) => (sum > 0 ? (dayKWh * raw) / sum : 0);
  const yearDays = MONTH_DAYS.reduce((a, b) => a + b, 0);
  const winter = (MONTH_LOAD_WEIGHTS[0]! * yearDays) / MONTH_LOAD_WEIGHTS.reduce((a, b, i) => a + b * MONTH_DAYS[i]!, 0);

  const point = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const hour = Math.max(0, Math.min(23, Math.floor(((x - PAD.l) / PLOT_W) * 24)));
    const value = Math.max(0, Math.min(1, (PAD.t + PLOT_H - y) / PLOT_H)) * scale;
    return { hour, value };
  };
  const paint = (base: number[], p: { hour: number; value: number }) => {
    const next = [...base];
    // Trascinando veloce si saltano delle ore: si riempiono interpolando dall'ultimo punto.
    const prev = last.current;
    if (prev && prev.hour !== p.hour) {
      const step = p.hour > prev.hour ? 1 : -1;
      for (let h = prev.hour + step; h !== p.hour; h += step) next[h] = prev.value + ((p.value - prev.value) * (h - prev.hour)) / (p.hour - prev.hour);
    }
    next[p.hour] = p.value;
    last.current = p;
    return next;
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = null;
    setDraft(paint(weights, point(e)));
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (draft) setDraft(paint(draft, point(e)));
  };
  const up = () => {
    if (draft) onChange(draft.map((v) => Math.round(v * 1000) / 1000));
    setDraft(null);
    last.current = null;
    setScale(Math.max(1, ...(draft ?? weights)) * 1.25);
  };
  const preset = (id: Exclude<LoadProfileId, 'manuale'>) => {
    const p = LOAD_PROFILES[id].weights;
    onChange([...p]);
    setScale(Math.max(...p) * 1.25);
  };
  const bw = PLOT_W / 24;
  const ticks = [0.25, 0.5, 0.75, 1];
  const share = (from: number, to: number) => (sum > 0 ? (w.slice(from, to).reduce((a, b) => a + b, 0) / sum) * 100 : 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="text-slate-400">Parti da:</span>
        {(['sera', 'uniforme', 'giorno'] as const).map((id) => (
          <button key={id} onClick={() => preset(id)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-slate-500 hover:text-white">
            {LOAD_PROFILES[id].label}
          </button>
        ))}
        <button onClick={() => onChange(Array(24).fill(1))} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-slate-500 hover:text-white">
          Costante
        </button>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="cursor-crosshair touch-none select-none rounded-md bg-slate-950/60"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label="Consumi della giornata media ora per ora: trascina per disegnarli"
      >
        {ticks.map((k) => (
          <g key={k}>
            <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + PLOT_H * (1 - k)} y2={PAD.t + PLOT_H * (1 - k)} stroke="#1e293b" />
            <text x={PAD.l - 5} y={PAD.t + PLOT_H * (1 - k) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {f(kwOf(scale * k), 2)}
            </text>
          </g>
        ))}
        <text x={4} y={PAD.t + 3} fontSize={9.5} fill="#64748b">
          kW
        </text>
        {/* Ore di sole indicative (giornata media): le barre in questa fascia sono quelle che il fotovoltaico può coprire. */}
        <rect x={PAD.l + 7 * bw} y={PAD.t} width={11 * bw} height={PLOT_H} fill="#fbbf24" fillOpacity={0.06} />
        {w.map((v, h) => {
          const bh = (Math.min(v, scale) / scale) * PLOT_H;
          return (
            <rect key={h} x={PAD.l + h * bw + 1.5} y={PAD.t + PLOT_H - bh} width={bw - 3} height={Math.max(0, bh)} rx={2} fill={h >= 7 && h < 18 ? '#fbbf24' : '#38bdf8'} fillOpacity={0.85}>
              <title>{`${h}:00–${h + 1}:00: ${f(kwOf(v), 2)} kW medi (${f(kwOf(v) * 1000)} Wh)`}</title>
            </rect>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + PLOT_H} y2={PAD.t + PLOT_H} stroke="#475569" />
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <text key={h} x={PAD.l + h * bw} y={H - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {h}
          </text>
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-4">
        <span className="text-slate-400">Giornata media</span>
        <span className="font-mono text-slate-100">{f(dayKWh, 1)} kWh</span>
        <span className="text-slate-400">Nelle ore 7–18</span>
        <span className="font-mono text-slate-100">{f(share(7, 18))}%</span>
        <span className="text-slate-400">Sera (18–24)</span>
        <span className="font-mono text-slate-100">{f(share(18, 24))}%</span>
        <span className="text-slate-400">Notte (0–7)</span>
        <span className="font-mono text-slate-100">{f(share(0, 7))}%</span>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Trascina sul grafico per disegnare quanto consumi in ogni ora: conta la forma, perché il totale resta il consumo annuo indicato sopra. In giallo le ore in cui di solito c'è
        sole. La stessa forma vale per tutti i mesi; i mesi invernali pesano di più (gennaio circa {f(winter * 100 - 100)}% sopra la media), come nei profili tipici.
      </p>
    </div>
  );
}
