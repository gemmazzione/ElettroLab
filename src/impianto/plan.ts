import type { DeviceKind, Plant, PlanDevice, Room } from './model';

/**
 * Planimetria del progetto: dai punti disegnati nei locali si ricavano le lunghezze stimate delle linee
 * (percorso a L dal quadro, punto dopo punto, più le risalite), il numero di punti per locale e le linee
 * che arrivano in un bagno. Stima per il progetto di massima: i percorsi reali seguono le canalizzazioni.
 */

/** Risalita verticale per punto [m]: i punti luce arrivano al soffitto, gli altri a circa un metro dal pavimento. */
const rise = (k: DeviceKind, heightM: number) => (k === 'luce' || k === 'emergenza' ? heightM : 1.2);

export const roomAt = (p: Plant, x: number, y: number): Room | null =>
  p.plan.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;

export const boardPos = (p: Plant, boardId: string) => p.plan.boards[boardId] ?? p.plan.boards[''] ?? { x: 0, y: 0 };

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export interface LineRoute {
  lineId: string;
  devices: PlanDevice[];
  /** Lunghezza stimata del cavo [m] */
  lengthM: number;
  /** La linea arriva in un bagno */
  bathroom: boolean;
}

/** Percorso stimato di una linea: dal suo quadro al punto più vicino, poi di punto in punto (vicino più vicino). */
export function lineRoute(p: Plant, lineId: string): LineRoute | null {
  const line = p.lines.find((l) => l.id === lineId);
  if (!line) return null;
  const start = boardPos(p, line.boardId);
  // Sottoquadro: dal quadro a monte alla posizione del sottoquadro
  if (line.kind === 'sottoquadro' && p.plan.boards[line.id]) {
    return { lineId, devices: [], lengthM: Math.round(manhattan(start, p.plan.boards[line.id]!) + 2 * 1.5), bathroom: false };
  }
  const devs = p.plan.devices.filter((d) => d.lineId === lineId);
  if (!devs.length) return null;
  let cur = start;
  let len = 0;
  const left = [...devs];
  while (left.length) {
    left.sort((a, b) => manhattan(cur, a) - manhattan(cur, b));
    const d = left.shift()!;
    len += manhattan(cur, d) + 2 * rise(d.kind, p.plan.heightM);
    cur = d;
  }
  const bathroom = devs.some((d) => roomAt(p, d.x, d.y)?.type === 'bagno');
  return { lineId, devices: devs, lengthM: Math.max(1, Math.round(len)), bathroom };
}

export function routes(p: Plant): LineRoute[] {
  return p.lines.map((l) => lineRoute(p, l.id)).filter((x): x is LineRoute => x !== null);
}

/** Aggiorna lunghezze e bagni delle linee che hanno punti in planimetria. */
export function applyPlan(p: Plant): Plant {
  const rs = new Map(routes(p).map((r) => [r.lineId, r]));
  return { ...p, lines: p.lines.map((l) => (rs.has(l.id) ? { ...l, lengthM: rs.get(l.id)!.lengthM, bathroom: rs.get(l.id)!.devices.length ? rs.get(l.id)!.bathroom : l.bathroom } : l)) };
}

export interface RoomCount {
  room: Room;
  counts: Partial<Record<DeviceKind, number>>;
  areaM2: number;
}

export function roomCounts(p: Plant): RoomCount[] {
  return p.plan.rooms.map((room) => {
    const counts: Partial<Record<DeviceKind, number>> = {};
    for (const d of p.plan.devices) if (roomAt(p, d.x, d.y)?.id === room.id) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    return { room, counts, areaM2: room.w * room.h };
  });
}

/** Dimensioni del disegno [m], con un margine attorno. */
export function planExtent(p: Plant): { w: number; h: number } {
  let w = 12;
  let h = 8;
  for (const r of p.plan.rooms) {
    w = Math.max(w, r.x + r.w + 1);
    h = Math.max(h, r.y + r.h + 1);
  }
  for (const d of p.plan.devices) {
    w = Math.max(w, d.x + 1);
    h = Math.max(h, d.y + 1);
  }
  for (const b of Object.values(p.plan.boards)) {
    w = Math.max(w, b.x + 1);
    h = Math.max(h, b.y + 1);
  }
  return { w: Math.ceil(w), h: Math.ceil(h) };
}
