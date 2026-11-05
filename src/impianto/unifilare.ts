import { f, fA, type LineResult, type PlantResult } from './calc';
import type { Plant } from './model';

/**
 * Schema unifilare di un quadro come elenco di primitive grafiche, disegnate sia nell'interfaccia (SVG) sia nella
 * relazione PDF: arrivo (punto di consegna o linea dal quadro a monte), interruttore generale, sbarre, differenziali
 * di gruppo con la loro sbarra e una colonna per linea con interruttore, differenziale proprio, cavo e utilizzatore.
 */

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; bold?: boolean }
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
  const out: string[] = [''];
  for (const w of s.split(/\s+/)) {
    const cur = out[out.length - 1]!;
    if ((cur + ' ' + w).trim().length <= n) out[out.length - 1] = (cur + ' ' + w).trim();
    else out.push(w);
  }
  if (out.length > 2) return [out[0]!, `${out.slice(1).join(' ').slice(0, n - 1)}…`];
  return out;
}

const tone = (s: LineResult['status']) => (s === 'info' ? 'ok' : s);

export function singleLine(p: Plant, r: PlantResult, boardId = ''): Diagram {
  const board = r.boards.find((b) => b.id === boardId) ?? r.boards[0]!;
  // Linee dello stesso differenziale di gruppo affiancate
  const key = (x: LineResult) => (x.line.rcdGroup ? `0${x.line.rcdGroup}` : '1');
  const order = [...board.lines].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const n = Math.max(1, order.length);
  const width = Math.max(560, LEFT + n * COL + 20);
  const prims: Prim[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, bold = false) => prims.push({ t: 'line', x1, y1, x2, y2, bold });
  const T = (x: number, y: number, s: string, size = 9, more: Partial<Extract<Prim, { t: 'text' }>> = {}) => prims.push({ t: 'text', x, y, s, size, ...more });
  const sx = 60;
  const feeder = board.feeder;

  if (feeder) {
    // Sottoquadro: arrivo dalla linea del quadro a monte
    L(sx, 6, sx, 92);
    T(sx + 8, 20, `Da ${feeder.tag} · ${feeder.designation} · ${f(feeder.line.lengthM, 0)} m`, 9, { bold: true });
    T(sx + 8, 32, `Icc al quadro ${fA(r.lines.find((x) => x.boardId === boardId)?.iccOriginA ?? 0)} · ΔV ${f(feeder.dropTotPct, 1)}%`, 8, { muted: true });
    prims.push({ t: 'rect', x: sx - 14, y: 92, w: 28, h: 30 });
    T(sx, 111, 'IMS', 8, { anchor: 'middle', bold: true });
    T(sx + 22, 104, `${board.name}`, 9, { bold: true });
    T(sx + 22, 116, 'sezionatore generale', 8, { muted: true });
  } else {
    if (p.supply.kind === 'cabina') {
      L(sx, 6, sx, 22);
      prims.push({ t: 'circle', cx: sx, cy: 32, r: 11 });
      prims.push({ t: 'circle', cx: sx, cy: 46, r: 11 });
      T(sx + 18, 30, `TR ${p.supply.kva} kVA`, 9, { bold: true });
      T(sx + 18, 42, `ucc ${f(p.supply.ukPct, 1)}% · MT/BT · TN-S`, 8, { muted: true });
      L(sx, 57, sx, 92);
    } else {
      prims.push({ t: 'rect', x: sx - 16, y: 14, w: 32, h: 24 });
      T(sx, 30, 'kWh', 8, { anchor: 'middle' });
      T(sx + 22, 24, `Contatore ${f(p.supply.contractKW, 1)} kW`, 9, { bold: true });
      T(sx + 22, 36, p.supply.kind === 'bt-mono' ? '230 V monofase · TT' : '400 V trifase · TT', 8, { muted: true });
      L(sx, 38, sx, 92);
    }
    const m = r.main;
    T(sx + 6, 70, m.section ? `${m.parallel > 1 ? `${m.parallel}×` : ''}${p.supply.kind === 'bt-mono' ? '3G' : '5G'}${f(m.section, 0)} · ${f(p.feeder.lengthM, 0)} m` : 'cavo —', 8, { muted: true });
    prims.push({ t: 'rect', x: sx - 14, y: 92, w: 28, h: 30, tone: tone(m.status) });
    T(sx, 111, m.inA ? `${m.inA}` : '—', 9, { anchor: 'middle', bold: true });
    T(sx + 22, 104, 'QG generale', 9, { bold: true });
    T(sx + 22, 116, m.inA ? `In ${m.inA} A · ${m.icuKA ?? '—'} kA${p.mainRcdMa ? ` · Δ ${p.mainRcdMa} mA${p.mainRcdS ? ' S' : ''}` : ''}` : '', 8, { muted: true });
  }
  L(sx, 122, sx, 150);

  const xOf = (i: number) => LEFT + i * COL + COL / 2;
  const x0 = xOf(0);
  const x1 = xOf(n - 1);
  L(Math.min(sx, x0), 150, Math.max(x1, sx), 150, true);
  T(sx + 6, 162, feeder ? (feeder.line.phases === 1 ? 'sbarre L-N' : 'sbarre L1-L2-L3-N') : p.supply.kind === 'bt-mono' ? 'sbarre L-N' : 'sbarre L1-L2-L3-N', 7, { muted: true });

  // Differenziali di gruppo: cerchio sulle sbarre e sbarra secondaria sopra le linee del gruppo
  const groupIds = [...new Set(order.map((x) => x.line.rcdGroup).filter(Boolean))];
  for (const gid of groupIds) {
    const idx = order.map((x, i) => (x.line.rcdGroup === gid ? i : -1)).filter((i) => i >= 0);
    const g = r.groups.find((x) => x.group.id === gid);
    const a = xOf(idx[0]!);
    const b = xOf(idx[idx.length - 1]!);
    const c = (a + b) / 2;
    L(c, 150, c, 160);
    prims.push({ t: 'circle', cx: c, cy: 169, r: 9 });
    T(c, 172, 'Δ', 8, { anchor: 'middle' });
    T(c + 13, 166, g ? `${g.group.idnMa} mA ${g.group.type}${g.group.s ? ' S' : ''}` : '', 7, { muted: true });
    T(c + 13, 175, g ? `${g.poles}P ${g.inA} A` : '', 7, { muted: true });
    L(c, 178, c, 188);
    L(Math.min(a, c) - 6, 188, Math.max(b, c) + 6, 188, true);
  }

  order.forEach((lr, i) => {
    const x = xOf(i);
    const l = lr.line;
    L(x, l.rcdGroup ? 188 : 150, x, 198);
    prims.push({ t: 'rect', x: x - 13, y: 198, w: 26, h: 28, tone: tone(lr.status) });
    T(x, 216, lr.inA ? `${lr.inA > 63 ? '' : l.curve}${lr.inA}` : '—', 9, { anchor: 'middle', bold: true });
    T(x + 16, 206, lr.tag, 8, { muted: true });
    T(x + 16, 217, l.phases === 3 ? (l.withNeutral ? '4P' : '3P') : '1P+N', 7, { muted: true });
    let y = 226;
    if (!l.rcdGroup && l.rcdMa) {
      L(x, y, x, 236);
      prims.push({ t: 'circle', cx: x, cy: 245, r: 9 });
      T(x, 248, 'Δ', 8, { anchor: 'middle' });
      T(x + 13, 244, `${l.rcdMa} mA${l.kind === 'sottoquadro' && l.rcdS ? ' S' : ''}`, 7, { muted: true });
      T(x + 13, 253, `tipo ${l.rcdType}`, 7, { muted: true });
      y = 254;
    }
    L(x, y, x, 348);
    T(x - 4, 332, `${lr.designation} · ${f(l.lengthM, 0)} m`, 8, { rot: true, muted: true });
    T(x + 11, 332, `ΔV ${f(lr.dropTotPct, 1)}%${lr.phase ? ` · L${lr.phase}` : ''}`, 7, { rot: true, muted: true });
    if (lr.sub) {
      prims.push({ t: 'rect', x: x - 10, y: 348, w: 20, h: 12 });
      T(x, 357, 'Q', 7, { anchor: 'middle' });
    } else {
      L(x - 7, 348, x + 7, 348);
      L(x - 7, 348, x, 358);
      L(x + 7, 348, x, 358);
    }
    wrap(l.name).forEach((s, k) => T(x, 372 + k * 11, s, 8, { anchor: 'middle' }));
    T(x, 398, lr.sub ? `${f(lr.sub.simultaneousW / 1000, 1)} kW contemp.` : `${f(l.powerW / 1000, l.powerW >= 10000 ? 0 : 1)} kW${l.bathroom ? ' · bagno' : ''}`, 7, { anchor: 'middle', muted: true });
  });
  return { width, height: 408, prims };
}
