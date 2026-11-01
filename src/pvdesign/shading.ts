import { monthSun } from './calc';
import { MONTH_DAYS, MONTH_REP_DAY } from './data';
import type { PvDesign } from './design';
import { houseGeometry } from './house';
import { fieldLayouts, panelCorners, roofLayout, sunPosition, type XYZ } from './roof';

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

export type ObstacleKind = 'albero' | 'edificio' | 'camino';

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
  /** Edificio e camino: lato nord-sud [m] */
  depth: number;
  /** Quota della base [m]: 0 a terra, sul tetto per i camini */
  z0: number;
}

export const OBSTACLE_DEFAULTS: Record<ObstacleKind, Omit<Obstacle, 'id' | 'x' | 'y' | 'z0'>> = {
  albero: { kind: 'albero', height: 8, size: 5, depth: 5 },
  edificio: { kind: 'edificio', height: 9, size: 10, depth: 8 },
  camino: { kind: 'camino', height: 1.2, size: 0.6, depth: 0.6 },
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
    } else {
      const z0 = ob.z0 ?? 0;
      if (hitBox(o, dir, { x: ob.x - ob.size / 2, y: ob.y - ob.depth / 2, z: z0 }, { x: ob.x + ob.size / 2, y: ob.y + ob.depth / 2, z: z0 + ob.height })) return true;
    }
  }
  for (const t of triangles) if (hitTri(o, dir, t)) return true;
  return false;
}

export interface ShadingResult {
  /** Perdita annua stimata per ciascun modulo installato (0–1), nell'ordine di \`panels\` */
  perPanel: number[];
  /** Moduli installati: falda e posto della griglia */
  panels: { field: 0 | 1; spot: number }[];
  /** Perdita media sulla sola luce diretta (0–1) */
  beamLoss: number;
  /** Perdita sull'energia con moduli indipendenti (ottimizzatori o microinverter) [%] */
  lossPct: number;
  /** Perdita sull'energia con moduli in stringa senza ottimizzatori (diodi di bypass) [%] */
  stringLossPct: number;
}

/**
 * Stringa con diodi di bypass senza ottimizzatori: l'inverter sceglie la corrente che rende di più; i moduli che a
 * quella corrente non arrivano vengono esclusi dai diodi. Potenza relativa = max su I di I × (moduli con irraggiamento ≥ I).
 */
export function stringPower(g: number[]): number {
  const s = [...g].sort((a, b) => b - a);
  let best = 0;
  for (let k = 0; k < s.length; k++) best = Math.max(best, s[k]! * (k + 1));
  return best;
}

export function annualShading(d: PvDesign, obstacles: Obstacle[] = d.obstacles): ShadingResult | null {
  const lays = fieldLayouts(d);
  if (!lays.length) return null;
  const flat = d.roof.type === 'piano';
  const r = roofLayout(d)!;
  const house = houseGeometry(r.geo, d);
  const baseZ = flat ? d.roof.heightM + 0.05 : d.roof.heightM;
  const panels: { field: 0 | 1; spot: number; c: XYZ[] }[] = [];
  for (const l of lays) for (const spot of l.installed) panels.push({ field: l.field, spot, c: panelCorners(l.slope, l.layout, l.layout.panels[spot]!, baseZ, flat) });
  if (!panels.length) return { perPanel: [], panels: [], beamLoss: 0, lossPct: 0, stringLossPct: 0 };
  // Stringhe: moduli consecutivi della stessa falda, a gruppi di «moduli per stringa».
  const strings: number[][] = [];
  for (const l of lays) {
    const per = l.field === 0 ? d.modulesPerString : d.field2.modulesPerString;
    const idx = panels.map((p, i) => (p.field === l.field ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < idx.length; k += Math.max(1, per)) strings.push(idx.slice(k, k + Math.max(1, per)));
  }
  const houseTris = [...house.walls, ...house.gables, ...house.roof, ...house.parapet].flatMap(tris);
  const lerp = (a: XYZ, b: XYZ, t: number): XYZ => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  const pts = panels.map(({ c }) => {
    const at = (s: number, t: number) => lerp(lerp(c[0]!, c[1]!, s), lerp(c[3]!, c[2]!, s), t);
    return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
  });
  const normals = panels.map(({ c }) => {
    const nn = cross(sub(c[1]!, c[0]!), sub(c[3]!, c[0]!));
    const len = Math.hypot(nn.x, nn.y, nn.z) || 1;
    const s = nn.z < 0 ? -1 : 1;
    return { x: (s * nn.x) / len, y: (s * nn.y) / len, z: (s * nn.z) / len };
  });
  // Sui tetti a falde i moduli sono complanari e non si fanno ombra: si escludono per velocità.
  const panelTris = flat ? panels.map(({ c }) => tris(c)) : panels.map(() => [] as Tri[]);
  const perPanelE = panels.map(() => ({ ideal: 0, real: 0 }));
  let beamW = 0;
  let beamL = 0;
  let annE = 0;
  let annInd = 0;
  let annStr = 0;
  for (let m = 0; m < 12; m++) {
    const sun = monthSun(d.site.latitude, m, d.site.hDay[m] ?? 0, d.site.tilt, d.site.azimuth, d.site.albedo);
    const monthE = (MONTH_DAYS[m] ?? 30) * (d.site.hDay[m] ?? 0);
    const dRatio = sun.diffuseFrac / Math.max(0.05, 1 - sun.diffuseFrac);
    let ideal = 0;
    let ind = 0;
    let str = 0;
    const pIdeal = panels.map(() => 0);
    const pReal = panels.map(() => 0);
    for (let h = 0.25; h < 24; h += 0.5) {
      const sp = sunPosition(d.site.latitude, MONTH_REP_DAY[m] ?? 15, h);
      if (sp.elevation < 1) continue;
      const el = (sp.elevation * Math.PI) / 180;
      const az = (sp.azimuth * Math.PI) / 180;
      const dir: XYZ = { x: -Math.sin(az) * Math.cos(el), y: -Math.cos(az) * Math.cos(el), z: Math.sin(el) };
      const dni = Math.pow(0.7, Math.pow(1 / Math.sin(el), 0.678));
      // Diffusa orizzontale nella stessa proporzione del mese rispetto alla diretta orizzontale (modello isotropo, non ombreggiata).
      const dh = dRatio * dni * Math.sin(el);
      const g0: number[] = [];
      const g: number[] = [];
      for (let i = 0; i < panels.length; i++) {
        const nz = normals[i]!.z;
        const diffuse = (dh * (1 + nz)) / 2;
        const ci = dot(normals[i]!, dir);
        let beam = 0;
        let shade = 0;
        if (ci > 0) {
          beam = dni * ci;
          const others = flat ? panelTris.flatMap((t, j) => (j === i ? [] : t)) : [];
          const tri = others.length ? [...houseTris, ...others] : houseTris;
          let k = 0;
          for (const p of pts[i]!) {
            const o = { x: p.x + dir.x * 0.02, y: p.y + dir.y * 0.02, z: p.z + dir.z * 0.02 };
            if (blocked(o, dir, tri, obstacles)) k++;
          }
          shade = k / pts[i]!.length;
          beamW += monthE * beam;
          beamL += monthE * beam * shade;
        }
        g0.push(beam + diffuse);
        g.push(beam * (1 - shade) + diffuse);
        pIdeal[i]! += beam + diffuse;
        pReal[i]! += beam * (1 - shade) + diffuse;
      }
      for (const s of strings) {
        ideal += s.reduce((a, i) => a + g0[i]!, 0);
        ind += s.reduce((a, i) => a + g[i]!, 0);
        str += stringPower(s.map((i) => g[i]!));
      }
    }
    if (ideal > 0) {
      annE += monthE;
      annInd += monthE * (1 - ind / ideal);
      annStr += monthE * (1 - str / ideal);
    }
    panels.forEach((_, i) => {
      if (pIdeal[i]! > 0) {
        perPanelE[i]!.ideal += monthE;
        perPanelE[i]!.real += monthE * (pReal[i]! / pIdeal[i]!);
      }
    });
  }
  return {
    perPanel: perPanelE.map((x) => (x.ideal > 0 ? 1 - x.real / x.ideal : 0)),
    panels: panels.map(({ field, spot }) => ({ field, spot })),
    beamLoss: beamW > 0 ? beamL / beamW : 0,
    lossPct: annE > 0 ? (annInd / annE) * 100 : 0,
    stringLossPct: annE > 0 ? (annStr / annE) * 100 : 0,
  };
}
