import type { PvDesign } from './design';
import type { RoofGeometry, XY, XYZ } from './roof';

/*
 * Geometria della casa per la vista 3D e per il calcolo delle ombre (coordinate locali: x est, y nord, z in alto, metri).
 * Le falde sono costruite sul rettangolo che contiene la pianta, allargato della sporgenza della gronda: il piano del
 * tetto resta lo stesso, quindi i moduli posati sulla falda restano appoggiati al tetto.
 */

export const OVERHANG = 0.5;
export const PARAPET = 0.45;

export interface Opening {
  /** Centro dell'apertura sulla parete */
  center: XYZ;
  /** Normale uscente della parete (orizzontale) */
  normal: XY;
  /** Direzione lungo la parete */
  along: XY;
  w: number;
  h: number;
  door: boolean;
}

export interface HouseGeometry {
  /** Pianta delle pareti */
  base: XY[];
  walls: XYZ[][];
  gables: XYZ[][];
  roof: XYZ[][];
  /** Parapetto del tetto piano */
  parapet: XYZ[][];
  openings: Opening[];
  /** Quota del colmo (o della copertura piana) */
  top: number;
}

function rectFrame(g: RoofGeometry) {
  const { rect } = g;
  const u: XY = { x: Math.cos(rect.angle), y: Math.sin(rect.angle) };
  const v: XY = { x: -u.y, y: u.x };
  const P = (su: number, sv: number, z: number, ext = 0): XYZ => ({
    x: rect.cx + u.x * su * (rect.length / 2 + ext) + v.x * sv * (rect.width / 2 + ext),
    y: rect.cy + u.y * su * (rect.length / 2 + ext) + v.y * sv * (rect.width / 2 + ext),
    z,
  });
  const along = (k: number, z: number): XYZ => ({ x: rect.cx + u.x * k, y: rect.cy + u.y * k, z });
  return { rect, u, v, P, along };
}

const signedArea = (p: XY[]) => p.reduce((a, q, i) => a + q.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * q.y, 0) / 2;

export function houseGeometry(g: RoofGeometry, d: PvDesign): HouseGeometry {
  const H = d.roof.heightM;
  const tp = Math.tan((d.roof.pitch * Math.PI) / 180);
  const o = OVERHANG;
  const { rect, P, along } = rectFrame(g);
  const top = H + g.rise;
  const flat = d.roof.type === 'piano';
  const base: XY[] = flat ? g.local : [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)];
  const walls: XYZ[][] = base.map((p, i) => {
    const q = base[(i + 1) % base.length]!;
    return [{ ...p, z: 0 }, { ...q, z: 0 }, { ...q, z: H }, { ...p, z: H }];
  });
  let roof: XYZ[][] = [];
  let gables: XYZ[][] = [];
  let parapet: XYZ[][] = [];
  const eave = H - o * tp;
  switch (d.roof.type) {
    case 'piano':
      roof = [base.map((p) => ({ ...p, z: H }))];
      parapet = base.map((p, i) => {
        const q = base[(i + 1) % base.length]!;
        return [{ ...p, z: H }, { ...q, z: H }, { ...q, z: H + PARAPET }, { ...p, z: H + PARAPET }];
      });
      break;
    case 'due-falde': {
      const half = rect.length / 2 + o;
      roof = [
        [P(-1, 1, eave, o), P(1, 1, eave, o), along(half, top), along(-half, top)],
        [P(-1, -1, eave, o), P(1, -1, eave, o), along(half, top), along(-half, top)],
      ];
      gables = [
        [P(-1, -1, H), P(-1, 1, H), along(-rect.length / 2, top)],
        [P(1, -1, H), P(1, 1, H), along(rect.length / 2, top)],
      ];
      break;
    }
    case 'padiglione': {
      const r = Math.max(0, (rect.length - rect.width) / 2);
      roof = [
        [P(-1, 1, eave, o), P(1, 1, eave, o), along(r, top), along(-r, top)],
        [P(-1, -1, eave, o), P(1, -1, eave, o), along(r, top), along(-r, top)],
        [P(1, -1, eave, o), P(1, 1, eave, o), along(r, top)],
        [P(-1, -1, eave, o), P(-1, 1, eave, o), along(-r, top)],
      ];
      break;
    }
    case 'falda': {
      const k = Math.max(0, Math.min(3, d.roof.slope));
      const s = g.slopes[k]!;
      const side = (p: XYZ) => ((p.x - rect.cx) * s.down.x + (p.y - rect.cy) * s.down.y > 0 ? 'low' : 'high');
      const corners = [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)];
      const ext = [P(-1, -1, 0, o), P(1, -1, 0, o), P(1, 1, 0, o), P(-1, 1, 0, o)];
      roof = [ext.map((p) => ({ ...p, z: side(p) === 'low' ? eave : top + o * tp }))];
      const c = corners.map((p) => ({ ...p, z: side(p) === 'low' ? H : top }));
      for (let i = 0; i < 4; i++) {
        const a = c[i]!;
        const b = c[(i + 1) % 4]!;
        if (a.z > H && b.z > H) gables.push([{ ...a, z: H }, { ...b, z: H }, b, a]);
        else if (a.z > H) gables.push([{ ...a, z: H }, { ...b, z: H }, a]);
        else if (b.z > H) gables.push([{ ...a, z: H }, { ...b, z: H }, b]);
      }
      break;
    }
  }
  return { base, walls, gables, roof, parapet, openings: openings(base, H), top: flat ? H : top };
}

/** Finestre a intervalli regolari su ogni parete, un piano ogni 3 m; la porta sulla parete più rivolta a sud. */
function openings(base: XY[], H: number): Opening[] {
  const ccw = signedArea(base) > 0;
  const floors = Math.max(1, Math.round(H / 3));
  const out: Opening[] = [];
  let doorWall = -1;
  let best = Infinity;
  const walls = base.map((p, i) => {
    const q = base[(i + 1) % base.length]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const along = { x: (q.x - p.x) / Math.max(len, 1e-9), y: (q.y - p.y) / Math.max(len, 1e-9) };
    const normal = ccw ? { x: along.y, y: -along.x } : { x: -along.y, y: along.x };
    // La parete più rivolta a sud ha la normale con la componente nord più negativa.
    if (len > 2.5 && normal.y < best) {
      best = normal.y;
      doorWall = i;
    }
    return { p, len, along, normal };
  });
  walls.forEach((w, i) => {
    const n = Math.floor((w.len - 0.8) / 3);
    if (n < 1) return;
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < n; k++) {
        const s = (w.len * (k + 0.5)) / n;
        const door = f === 0 && i === doorWall && k === Math.floor((n - 1) / 2);
        const h = door ? 2.2 : 1.3;
        const zc = door ? 1.1 : f * 3 + 1.55;
        if (zc + h / 2 > H - 0.3) continue;
        out.push({ center: { x: w.p.x + w.along.x * s, y: w.p.y + w.along.y * s, z: zc }, normal: w.normal, along: w.along, w: door ? 1 : 1.2, h, door });
      }
    }
  });
  return out;
}
