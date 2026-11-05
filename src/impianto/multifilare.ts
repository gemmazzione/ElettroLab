import { f, type LineResult, type PlantResult } from './calc';
import type { Plant } from './model';
import type { Diagram, Prim, Wire } from './unifilare';

/**
 * Schema multifilare di un quadro: ogni conduttore disegnato con il suo colore (fasi, neutro blu, PE giallo-verde).
 * Sbarre in alto, interruttore generale (o sezionatore del sottoquadro) a sinistra, differenziali di gruppo con la
 * loro sbarra, poi per ogni linea i poli dell'interruttore e dell'eventuale differenziale, il cavo e l'utilizzatore
 * con i suoi morsetti. Il PE scende tratteggiato dalla sua sbarra a ogni utilizzatore.
 */

const STEP = 10;
const BUS_Y0 = 70;
const BUS_DY = 11;
const LEFT = 140;
const Y_GROUP = 150;
const Y_SUB0 = 185;
const Y_BRK = 225;
const Y_RCD = 268;
const Y_LOAD = 380;

/** Conduttori di una linea, in ordine (fasi poi neutro). */
function wiresOf(lr: LineResult, monoSupply: boolean): Wire[] {
  const l = lr.line;
  if (l.phases === 3) return l.withNeutral || lr.sub ? ['L1', 'L2', 'L3', 'N'] : ['L1', 'L2', 'L3'];
  if (monoSupply) return ['L1', 'N'];
  return [`L${lr.phase ?? 1}` as Wire, 'N'];
}

const label = (w: Wire, mono: boolean) => (mono && w === 'L1' ? 'L' : w);

export function multiLine(p: Plant, r: PlantResult, boardId = ''): Diagram {
  const board = r.boards.find((b) => b.id === boardId) ?? r.boards[0]!;
  const feeder = board.feeder;
  const mono = feeder ? feeder.line.phases === 1 : p.supply.kind === 'bt-mono';
  const monoSupply = p.supply.kind === 'bt-mono';
  const busWires: Wire[] = mono ? ['L1', 'N', 'PE'] : ['L1', 'L2', 'L3', 'N', 'PE'];
  // In un sottoquadro monofase di un impianto trifase la fase è quella della linea che lo alimenta.
  const subPhase = feeder && mono && feeder.phase ? (`L${feeder.phase}` as Wire) : null;
  const busOf = (w: Wire): Wire => (subPhase && w.startsWith('L') ? 'L1' : w);
  const yBus = (w: Wire) => BUS_Y0 + busWires.indexOf(busOf(w)) * BUS_DY;
  const prims: Prim[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, wire?: Wire, dash = false) => prims.push({ t: 'line', x1, y1, x2, y2, wire, dash: dash || wire === 'PE' });
  const T = (x: number, y: number, s: string, size = 8, more: Partial<Extract<Prim, { t: 'text' }>> = {}) => prims.push({ t: 'text', x, y, s, size, ...more });
  const dot = (x: number, y: number, w: Wire) => prims.push({ t: 'circle', cx: x, cy: y, r: 2.2, dot: w });

  // Colonne: linee dello stesso differenziale di gruppo affiancate
  const key = (x: LineResult) => (x.line.rcdGroup ? `0${x.line.rcdGroup}` : '1');
  const order = [...board.lines].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const cols: { lr: LineResult; x0: number; wires: Wire[]; peX: number }[] = [];
  let x = LEFT;
  const groupX = new Map<string, number>();
  for (const lr of order) {
    // Prima linea di un gruppo: una colonna per il differenziale di gruppo
    if (lr.line.rcdGroup && !groupX.has(lr.line.rcdGroup)) {
      groupX.set(lr.line.rcdGroup, x + 12);
      x += 4 * STEP + 70;
    }
    const wires = wiresOf(lr, monoSupply);
    const w = Math.max(78, (wires.length + 1) * STEP + 46);
    cols.push({ lr, x0: x + 12, wires, peX: x + 12 + wires.length * STEP + 4 });
    x += w;
  }
  const width = Math.max(560, x + 30);

  // Arrivo e interruttore generale (o sezionatore del sottoquadro)
  const inWires = busWires.filter((w) => w !== 'PE');
  const gx = (i: number) => 30 + i * STEP;
  if (feeder) {
    T(16, 14, `Da ${feeder.tag} · ${feeder.designation} · ${f(feeder.line.lengthM, 0)} m`, 9, { bold: true });
  } else if (p.supply.kind === 'cabina') {
    T(16, 14, `Trasformatore ${p.supply.kva} kVA · TN-S`, 9, { bold: true });
  } else {
    T(16, 14, `Contatore ${f(p.supply.contractKW, 1)} kW · ${monoSupply ? '230 V' : '400 V'} · TT`, 9, { bold: true });
  }
  inWires.forEach((w, i) => {
    L(gx(i), 20, gx(i), 30, w);
    T(gx(i), 26, label(w, mono && !subPhase), 6, { anchor: 'middle', muted: true });
  });
  prims.push({ t: 'rect', x: gx(0) - 6, y: 30, w: (inWires.length - 1) * STEP + 12, h: 22, tone: feeder ? undefined : r.main.status === 'info' ? 'ok' : r.main.status });
  T(gx(inWires.length - 1) + 12, 40, feeder ? 'Sezionatore' : `Generale ${r.main.inA ?? '—'} A`, 8, { bold: true });
  T(gx(inWires.length - 1) + 12, 50, feeder ? `${board.name}` : `${r.main.icuKA ?? '—'} kA${p.mainRcdMa ? ` · Δ ${p.mainRcdMa} mA${p.mainRcdS ? ' S' : ''}` : ''}`, 7, { muted: true });
  // Dal generale alle sbarre
  inWires.forEach((w, i) => {
    L(gx(i), 52, gx(i), yBus(w), w);
    L(gx(i), yBus(w), width - 20, yBus(w), w);
    dot(gx(i), yBus(w), w);
  });
  // PE: arriva da sinistra direttamente alla sua sbarra
  L(8, yBus('PE'), width - 20, yBus('PE'), 'PE');
  T(10, yBus('PE') - 3, 'PE', 6, { muted: true });
  busWires.forEach((w) => T(width - 16, yBus(w) + 2, label(w, mono && !subPhase), 6, { muted: true }));

  // Differenziali di gruppo con la loro sbarra
  const groupBus = new Map<string, Map<Wire, number>>();
  const groups = [...new Set(order.map((o) => o.line.rcdGroup).filter(Boolean))];
  for (const gid of groups) {
    const gcols = cols.filter((c) => c.lr.line.rcdGroup === gid);
    const g = r.groups.find((x) => x.group.id === gid);
    const gw: Wire[] = g?.poles === 4 && !mono ? ['L1', 'L2', 'L3', 'N'] : [subPhase ? 'L1' : busOf(gcols[0]!.wires[0]!), 'N'];
    const gx0 = groupX.get(gid) ?? gcols[0]!.x0;
    gw.forEach((w, i) => {
      const xx = gx0 + i * STEP;
      dot(xx, yBus(w), w);
      L(xx, yBus(w), xx, Y_GROUP, w);
    });
    prims.push({ t: 'rect', x: gx0 - 6, y: Y_GROUP, w: (gw.length - 1) * STEP + 12, h: 20 });
    T(gx0 + (gw.length - 1) * STEP + 10, Y_GROUP + 9, g ? `Δ ${g.group.idnMa} mA ${g.group.type}${g.group.s ? ' S' : ''}` : 'Δ', 7, { bold: true });
    T(gx0 + (gw.length - 1) * STEP + 10, Y_GROUP + 18, g ? `${g.group.name.slice(0, 18)} · ${g.inA} A` : '', 6.5, { muted: true });
    const map = new Map<Wire, number>();
    const right = gcols[gcols.length - 1]!.x0 + 3 * STEP + 8;
    gw.forEach((w, i) => {
      const xx = gx0 + i * STEP;
      const y = Y_SUB0 + i * 7;
      L(xx, Y_GROUP + 20, xx, y, w);
      L(xx, y, right, y, w);
      map.set(w, y);
      // le linee monofase di un gruppo 4P si collegano alla loro fase
    });
    groupBus.set(gid, map);
  }

  // Linee
  for (const c of cols) {
    const { lr, x0, wires, peX } = c;
    const l = lr.line;
    const gmap = l.rcdGroup ? groupBus.get(l.rcdGroup) : undefined;
    wires.forEach((w, i) => {
      const xx = x0 + i * STEP;
      if (gmap) {
        const yy = gmap.get(busOf(w)) ?? gmap.get(w) ?? [...gmap.values()][w === 'N' ? gmap.size - 1 : 0]!;
        dot(xx, yy, w);
        L(xx, yy, xx, Y_BRK, w);
      } else {
        dot(xx, yBus(w), w);
        L(xx, yBus(w), xx, Y_BRK, w);
      }
      T(xx, Y_BRK - 4, label(w, monoSupply || !!subPhase), 5.5, { anchor: 'middle', muted: true });
    });
    const bw = (wires.length - 1) * STEP + 12;
    prims.push({ t: 'rect', x: x0 - 6, y: Y_BRK, w: bw, h: 24, tone: lr.status === 'info' ? 'ok' : lr.status });
    T(x0 - 6, Y_BRK + 33, `${lr.tag} ${lr.inA ? `${lr.inA > 63 ? 'In ' : l.curve}${lr.inA}` : '—'}`, 7.5, { bold: true });
    let y = Y_BRK + 24;
    if (!l.rcdGroup && l.rcdMa) {
      wires.forEach((w, i) => L(x0 + i * STEP, y, x0 + i * STEP, Y_RCD + 10, w));
      prims.push({ t: 'rect', x: x0 - 6, y: Y_RCD + 10, w: bw, h: 18 });
      T(x0 - 6, Y_RCD + 37, `Δ ${l.rcdMa} mA ${l.rcdType}${l.kind === 'sottoquadro' && l.rcdS ? ' S' : ''}`, 7);
      y = Y_RCD + 28;
    }
    wires.forEach((w, i) => L(x0 + i * STEP, y, x0 + i * STEP, Y_LOAD, w));
    // PE dalla sbarra all'utilizzatore
    dot(peX, yBus('PE'), 'PE');
    L(peX, yBus('PE'), peX, Y_LOAD, 'PE', true);
    T(peX + 8, Y_LOAD - 8, `${lr.designation} · ${f(l.lengthM, 0)} m`, 7, { rot: true, muted: true });
    // Utilizzatore con i morsetti
    const all: Wire[] = [...wires, 'PE'];
    prims.push({ t: 'rect', x: x0 - 6, y: Y_LOAD, w: peX - x0 + 12, h: 20 });
    all.forEach((w, i) => {
      const xx = w === 'PE' ? peX : x0 + i * STEP;
      prims.push({ t: 'circle', cx: xx, cy: Y_LOAD, r: 2.2, dot: w });
    });
    T(x0 - 2, Y_LOAD + 13, lr.sub ? '→ quadro' : l.phases === 3 ? '3~' : '1~', 7, { muted: true });
    const name = lr.sub ? `${l.name}` : l.name;
    T(x0 - 6, Y_LOAD + 32, name.length > 16 ? `${name.slice(0, 15)}…` : name, 7.5);
    T(x0 - 6, Y_LOAD + 43, lr.sub ? `${f(lr.sub.simultaneousW / 1000, 1)} kW contemp.` : `${f(l.powerW / 1000, l.powerW >= 10000 ? 0 : 1)} kW${lr.phase ? ` · L${lr.phase}` : ''}`, 6.5, { muted: true });
  }
  return { width, height: Y_LOAD + 52, prims };
}

/** Colori dei conduttori per lo schermo (tema scuro) e per la stampa. */
export const WIRE_SCREEN: Record<Wire, string> = { L1: '#b07a4a', L2: '#e2e8f0', L3: '#94a3b8', N: '#60a5fa', PE: '#a3e635' };
export const WIRE_PRINT: Record<Wire, [number, number, number]> = { L1: [140, 82, 35], L2: [20, 20, 20], L3: [130, 130, 130], N: [37, 99, 235], PE: [101, 163, 13] };
