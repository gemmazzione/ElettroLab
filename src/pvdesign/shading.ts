import { moduleCount, monthSun } from './calc';
import { MONTH_DAYS, MONTH_REP_DAY } from './data';
import type { PvDesign } from './design';
import { houseGeometry } from './house';
import { panelCorners, roofLayout, sunPosition, type XYZ } from './roof';

/*
 * Ombre sui moduli nell'arco dell'anno.
 *
 * Per ogni mese si prende il giorno medio e, ogni mezz'ora con il sole sopra l'orizzonte, si traccia un raggio
 * da cinque punti di ogni modulo verso il sole: se incontra la casa, un altro modulo o un ostacolo (alberi, edifici
 * vicini), quel punto è in ombra. La luce diretta pesa con l'angolo di incidenza sul modulo e con l'attenuazione
 * dell'atmosfera (modello di Meinel: DNI ∝ 0,7^(AM^0,678)). La parte diffusa del mese (frazione di Erbs, la stessa
 * del calcolo della produzione) si considera non ombreggiata: la perdita stimata è quindi un valore minimo.
 * Il disaccoppiamento elettrico tra moduli in ombra e al sole nella stessa stringa non è considerato.
 */

export type ObstacleKind = 'albero' | 'edificio';

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  /** Posizione del centro alla base, metri locali (x est, y nord, origine al centro della pianta) */
  x: number;
  y: number;
  /** Altezza [m] */
  height: number;
  /** Albero: diametro della chioma; edificio: lato est-ovest [m] */
  size: number;
  /** Edificio: lato nord-sud [m] */
  depth: number;
}

export const OBSTACLE_DEFAULTS: Record<ObstacleKind, Omit<Obstacle, 'id' | 'x' | 'y'>> = {
  albero: { kind: 'albero', height: 8, size: 5, depth: 5 },
  edificio: { kind: 'edificio', height: 9, size: 10, depth: 8 },
};

type Tri = [XYZ, XYZ, XYZ];

const sub = (a: XYZ, b: XYZ): XYZ => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: XYZ, b: XYZ) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: XYZ, b: XYZ): XYZ => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Intersezione raggio-triangolo (Möller–Trumbore), solo davanti all'origine. */
function hitTri(o: XYZ, d: XYZ, [a, b, c]: Tri): boolean {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-9) return false;
  const inv = 1 / det;
  const s = sub(o, a);
  const u = dot(s, p) * inv;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return false;
  return dot(e2, q) * inv > 1e-4;
}

function hitSphere(o: XYZ, d: XYZ, c: XYZ, r: number): boolean {
  const m = sub(o, c);
  const b = dot(m, d);
  const cc = dot(m, m) - r * r;
  if (cc > 0 && b > 0) return false;
  return b * b - cc >= 0;
}

function hitBox(o: XYZ, d: XYZ, min: XYZ, max: XYZ): boolean {
  let t0 = 1e-4;
  let t1 = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return false;
      continue;
    }
    let ta = (min[k] - o[k]) / d[k];
    let tb = (max[k] - o[k]) / d[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

const tris = (poly: XYZ[]): Tri[] => poly.slice(1, -1).map((_, i) => [poly[0]!, poly[i + 1]!, poly[i + 2]!]);

/** Raggio che parte da un punto verso il sole: è bloccato? */
export function blocked(o: XYZ, dir: XYZ, triangles: Tri[], obstacles: Obstacle[]): boolean {
  for (const ob of obstacles) {
    if (ob.kind === 'albero') {
      const r = ob.size / 2;
      if (hitSphere(o, dir, { x: ob.x, y: ob.y, z: Math.max(r, ob.height - r) }, r)) return true;
    } else if (hitBox(o, dir, { x: ob.x - ob.size / 2, y: ob.y - ob.depth / 2, z: 0 }, { x: ob.x + ob.size / 2, y: ob.y + ob.depth / 2, z: ob.height })) return true;
  }
  for (const t of triangles) if (hitTri(o, dir, t)) return true;
  return false;
}

export interface ShadingResult {
  /** Perdita annua stimata per ciascun modulo installato (0–1) */
  perPanel: number[];
  /** Perdita media sulla sola luce diretta (0–1) */
  beamLoss: number;
  /** Perdita media stimata sull'energia del modulo [%] */
  lossPct: number;
}

export function annualShading(d: PvDesign, obstacles: Obstacle[] = d.obstacles): ShadingResult | null {
  const r = roofLayout(d);
  if (!r) return null;
  const flat = d.roof.type === 'piano';
  const n = Math.min(moduleCount(d), r.layout.panels.length);
  if (n === 0) return { perPanel: [], beamLoss: 0, lossPct: 0 };
  const house = houseGeometry(r.geo, d);
  const baseZ = flat ? d.roof.heightM + 0.05 : d.roof.heightM;
  const panels = r.layout.panels.slice(0, n).map((p) => panelCorners(r.slope, r.layout, p, baseZ, flat));
  const houseTris = [...house.walls, ...house.gables, ...house.roof, ...house.parapet].flatMap(tris);
  // Punti di prova: centro e quattro punti a un quarto dai bordi; normale verso l'alto.
  const lerp = (a: XYZ, b: XYZ, t: number): XYZ => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  const pts = panels.map((c) => {
    const at = (s: number, t: number) => lerp(lerp(c[0]!, c[1]!, s), lerp(c[3]!, c[2]!, s), t);
    return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
  });
  const normals = panels.map((c) => {
    const nn = cross(sub(c[1]!, c[0]!), sub(c[3]!, c[0]!));
    const len = Math.hypot(nn.x, nn.y, nn.z) || 1;
    const s = nn.z < 0 ? -1 : 1;
    return { x: (s * nn.x) / len, y: (s * nn.y) / len, z: (s * nn.z) / len };
  });
  // Sui tetti a falde i moduli sono complanari e non si fanno ombra: si escludono per velocità.
  const panelTris = flat ? panels.map((c) => tris(c)) : panels.map(() => [] as Tri[]);
  const loss = panels.map(() => ({ e: 0, l: 0 }));
  let beamW = 0;
  let beamL = 0;
  for (let m = 0; m < 12; m++) {
    const sun = monthSun(d.site.latitude, m, d.site.hDay[m] ?? 0, d.site.tilt, d.site.azimuth, d.site.albedo);
    const monthE = (MONTH_DAYS[m] ?? 30) * (d.site.hDay[m] ?? 0);
    const beamShare = 1 - sun.diffuseFrac;
    const acc = panels.map(() => ({ w: 0, b: 0 }));
    for (let h = 0.25; h < 24; h += 0.5) {
      const sp = sunPosition(d.site.latitude, MONTH_REP_DAY[m] ?? 15, h);
      if (sp.elevation < 1) continue;
      const el = (sp.elevation * Math.PI) / 180;
      const az = (sp.azimuth * Math.PI) / 180;
      const dir: XYZ = { x: -Math.sin(az) * Math.cos(el), y: -Math.cos(az) * Math.cos(el), z: Math.sin(el) };
      const dni = Math.pow(0.7, Math.pow(1 / Math.sin(el), 0.678));
      for (let i = 0; i < panels.length; i++) {
        const ci = dot(normals[i]!, dir);
        if (ci <= 0) continue;
        const w = dni * ci;
        const others = flat ? panelTris.flatMap((t, j) => (j === i ? [] : t)) : [];
        const tri = others.length ? [...houseTris, ...others] : houseTris;
        let k = 0;
        for (const p of pts[i]!) {
          const o = { x: p.x + dir.x * 0.02, y: p.y + dir.y * 0.02, z: p.z + dir.z * 0.02 };
          if (blocked(o, dir, tri, obstacles)) k++;
        }
        acc[i]!.w += w;
        acc[i]!.b += (w * k) / pts[i]!.length;
      }
    }
    acc.forEach((a, i) => {
      const beamLossM = a.w > 0 ? a.b / a.w : 0;
      loss[i]!.e += monthE;
      loss[i]!.l += monthE * beamShare * beamLossM;
      beamW += monthE * a.w;
      beamL += monthE * a.b;
    });
  }
  const perPanel = loss.map((x) => (x.e > 0 ? x.l / x.e : 0));
  const mean = perPanel.reduce((a, b) => a + b, 0) / perPanel.length;
  return { perPanel, beamLoss: beamW > 0 ? beamL / beamW : 0, lossPct: mean * 100 };
}
