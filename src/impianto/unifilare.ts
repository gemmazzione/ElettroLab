import { f, type PlantResult } from './calc';
import type { Plant } from './model';

/**
 * Schema unifilare del quadro generale come elenco di primitive grafiche, disegnate sia nell'interfaccia (SVG)
 * sia nella relazione PDF: punto di consegna, linea di alimentazione, generale, sbarre e una colonna per linea
 * con interruttore, differenziale, cavo e utilizzatore.
 */

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; bold?: boolean; dash?: boolean }
  | { t: 'rect'; x: number; y: number; w: number; h: number; tone?: 'ok' | 'warn' | 'error' }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'text'; x: number; y: number; s: string; size: number; anchor?: 'start' | 'middle' | 'end'; muted?: boolean; rot?: boolean; bold?: boolean };

export interface Diagram {
  width: number;
  height: number;
  prims: Prim[];
}

const COL = 96;
const LEFT = 150;

/** Spezza un nome in righe da al più n caratteri (al massimo due righe). */
function wrap(s: string, n = 15): string[] {
  const words = s.split(/\s+/);
  const out: string[] = [''];
  for (const w of words) {
    const cur = out[out.length - 1]!;
    if ((cur + ' ' + w).trim().length <= n) out[out.length - 1] = (cur + ' ' + w).trim();
    else out.push(w);
  }
  if (out.length > 2) return [out[0]!, `${out.slice(1).join(' ').slice(0, n - 1)}…`];
  return out;
}

export function singleLine(p: Plant, r: PlantResult): Diagram {
  const n = Math.max(1, r.lines.length);
  const width = Math.max(560, LEFT + n * COL + 20);
  const prims: Prim[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, bold = false) => prims.push({ t: 'line', x1, y1, x2, y2, bold });
  const T = (x: number, y: number, s: string, size = 9, more: Partial<Extract<Prim, { t: 'text' }>> = {}) => prims.push({ t: 'text', x, y, s, size, ...more });

  // Punto di consegna
  const sx = 60;
  if (p.supply.kind === 'cabina') {
    L(sx, 6, sx, 22);
    prims.push({ t: 'circle', cx: sx, cy: 32, r: 11 });
    prims.push({ t: 'circle', cx: sx, cy: 46, r: 11 });
    T(sx + 18, 30, `TR ${p.supply.kva} kVA`, 9, { bold: true });
    T(sx + 18, 42, `ucc ${f(p.supply.ukPct, 1)}% · MT/BT`, 8, { muted: true });
    L(sx, 57, sx, 92);
  } else {
    prims.push({ t: 'rect', x: sx - 16, y: 14, w: 32, h: 24 });
    T(sx, 30, 'kWh', 8, { anchor: 'middle' });
    T(sx + 22, 24, `Contatore ${f(p.supply.contractKW, 1)} kW`, 9, { bold: true });
    T(sx + 22, 36, p.supply.kind === 'bt-mono' ? '230 V monofase · TT' : '400 V trifase · TT', 8, { muted: true });
    L(sx, 38, sx, 92);
  }
  const m = r.main;
  T(sx + 6, 70, m.section ? `${p.supply.kind === 'bt-mono' ? '3G' : '5G'}${f(m.section, 0)} · ${f(p.feeder.lengthM, 0)} m` : 'cavo —', 8, { muted: true });
  // Interruttore generale
  prims.push({ t: 'rect', x: sx - 14, y: 92, w: 28, h: 30, tone: m.status });
  T(sx, 111, m.inA ? `${m.inA}` : '—', 9, { anchor: 'middle', bold: true });
  T(sx + 22, 104, 'QG generale', 9, { bold: true });
  T(sx + 22, 116, m.inA ? `In ${m.inA} A · ${m.icuKA ?? '—'} kA` : '', 8, { muted: true });
  L(sx, 122, sx, 150);

  // Sbarre
  const x0 = LEFT + COL / 2;
  const x1 = LEFT + (n - 1) * COL + COL / 2;
  L(Math.min(sx, x0), 150, Math.max(x1, sx), 150, true);
  T(sx + 6, 162, p.supply.kind === 'bt-mono' ? 'sbarre L-N' : 'sbarre L1-L2-L3-N', 7, { muted: true });

  r.lines.forEach((lr, i) => {
    const x = LEFT + i * COL + COL / 2;
    const l = lr.line;
    L(x, 150, x, 168);
    prims.push({ t: 'rect', x: x - 13, y: 168, w: 26, h: 28, tone: lr.status });
    T(x, 186, lr.inA ? `${lr.inA > 63 ? '' : l.curve}${lr.inA}` : '—', 9, { anchor: 'middle', bold: true });
    T(x + 16, 176, `Q${i + 1}`, 8, { muted: true });
    T(x + 16, 187, l.phases === 3 ? '4P' : '1P+N', 7, { muted: true });
    let y = 196;
    if (l.rcdMa) {
      L(x, y, x, 206);
      prims.push({ t: 'circle', cx: x, cy: 215, r: 9 });
      T(x, 218, 'Δ', 8, { anchor: 'middle' });
      T(x + 13, 214, `${l.rcdMa} mA`, 7, { muted: true });
      T(x + 13, 223, `tipo ${l.rcdType}`, 7, { muted: true });
      y = 224;
    }
    L(x, y, x, 318);
    T(x - 4, 300, `${lr.designation} · ${f(l.lengthM, 0)} m`, 8, { rot: true, muted: true });
    T(x + 11, 300, `ΔV ${f(lr.dropTotPct, 1)}%${lr.phase ? ` · L${lr.phase}` : ''}`, 7, { rot: true, muted: true });
    // Utilizzatore
    L(x - 7, 318, x + 7, 318);
    L(x - 7, 318, x, 328);
    L(x + 7, 318, x, 328);
    wrap(l.name).forEach((s, k) => T(x, 342 + k * 11, s, 8, { anchor: 'middle' }));
    T(x, 368, `${f(l.powerW / 1000, l.powerW >= 10000 ? 0 : 1)} kW`, 7, { anchor: 'middle', muted: true });
  });
  return { width, height: 378, prims };
}
