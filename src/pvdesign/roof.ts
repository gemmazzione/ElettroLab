import { SITES, type ModuleSpec } from './data';
import type { PvDesign } from './design';
import { declination } from './sun';
import { isWeather, weatherSummary } from './weather';

/*
 * Geometria del tetto disegnato sulla foto satellitare.
 *
 * - La pianta è un poligono di punti [lat, lon]; si converte in metri su un piano locale (x verso est, y verso nord)
 *   con la proiezione equirettangolare, precisa al centimetro sulle dimensioni di un edificio.
 * - I tetti a falde sono approssimati con il rettangolo di area minima che contiene la pianta: colmo parallelo al lato
 *   lungo, falde con la stessa pendenza. Il tetto piano usa la pianta com'è per la superficie e il rettangolo per la posa.
 * - Orientamento (azimut) con la convenzione del resto della progettazione: 0° = sud, −90° = est, +90° = ovest.
 */

export type RoofType = 'piano' | 'falda' | 'due-falde' | 'padiglione';

export const ROOF_TYPES: Record<RoofType, string> = {
  piano: 'Tetto piano (moduli su telai inclinati)',
  falda: 'Falda unica',
  'due-falde': 'A due falde (a capanna)',
  padiglione: 'A padiglione (quattro falde)',
};

export interface RoofSpec {
  /** Pianta dell'edificio: vertici [lat, lon] */
  footprint: [number, number][];
  type: RoofType;
  /** Pendenza delle falde [°] (tetti a falde) */
  pitch: number;
  /** Altezza della linea di gronda da terra [m] */
  heightM: number;
  /** Falda scelta per i moduli (indice tra quelle disponibili) */
  slope: number;
  /** Distanza dei moduli dai bordi della falda [m] */
  setbackM: number;
  /** Posa dei moduli */
  orientation: 'verticale' | 'orizzontale';
  /** Posti esclusi sulla falda scelta (camini, lucernari, antenne): indici della griglia */
  excluded: number[];
}

export interface XY {
  x: number;
  y: number;
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON = 111_320;

export function toLocal(points: [number, number][], origin?: [number, number]): XY[] {
  const [lat0, lon0] = origin ?? centroidLatLon(points);
  const k = Math.cos((lat0 * Math.PI) / 180);
  return points.map(([lat, lon]) => ({ x: (lon - lon0) * k * M_PER_DEG_LON, y: (lat - lat0) * M_PER_DEG_LAT }));
}

export function toLatLon(p: XY, origin: [number, number]): [number, number] {
  const k = Math.cos((origin[0] * Math.PI) / 180);
  return [origin[0] + p.y / M_PER_DEG_LAT, origin[1] + p.x / (k * M_PER_DEG_LON)];
}

export function centroidLatLon(points: [number, number][]): [number, number] {
  const n = Math.max(1, points.length);
  return [points.reduce((a, p) => a + p[0], 0) / n, points.reduce((a, p) => a + p[1], 0) / n];
}

export function polygonArea(p: XY[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export interface OrientedRect {
  cx: number;
  cy: number;
  /** Direzione del lato lungo [rad dall'asse x] */
  angle: number;
  /** Lato lungo e lato corto [m] */
  length: number;
  width: number;
}

/** Rettangolo di area minima che contiene il poligono (si provano le direzioni di tutti i lati). */
export function minAreaRect(p: XY[]): OrientedRect {
  let best: OrientedRect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of p) {
      const u = q.x * c + q.y * s;
      const v = -q.x * s + q.y * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      const uc = (minU + maxU) / 2;
      const vc = (minV + maxV) / 2;
      const du = maxU - minU;
      const dv = maxV - minV;
      const long = du >= dv;
      best = {
        cx: uc * c - vc * s,
        cy: uc * s + vc * c,
        angle: long ? ang : ang + Math.PI / 2,
        length: Math.max(du, dv),
        width: Math.min(du, dv),
      };
    }
  }
  return best ?? { cx: 0, cy: 0, angle: 0, length: 0, width: 0 };
}

/** Azimut (0 = sud, −90 = est, +90 = ovest) di una falda che scende verso la direzione orizzontale d. */
export function azimuthOf(d: XY): number {
  const bearing = (Math.atan2(d.x, d.y) * 180) / Math.PI; // 0 = nord, 90 = est
  let az = bearing - 180;
  if (az <= -180) az += 360;
  if (az > 180) az -= 360;
  return az;
}

const COMPASS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
export function compassName(az: number): string {
  const bearing = (az + 180 + 360) % 360;
  return COMPASS[Math.round(bearing / 45) % 8]!;
}

/** Falda del tetto: forma (rettangolo, trapezio o triangolo), orientamento e posizione nello spazio. */
export interface RoofSlope {
  /** Direzione orizzontale verso cui scende la falda (versore) */
  down: XY;
  /** Direzione orizzontale lungo la gronda (versore) */
  along: XY;
  /** Punto medio della gronda (metri locali) */
  eave: XY;
  /** Larghezza alla gronda e alla sommità [m] */
  bottom: number;
  top: number;
  /** Profondità orizzontale dalla gronda alla sommità [m] */
  depth: number;
  tilt: number;
  azimuth: number;
  label: string;
}

export interface RoofGeometry {
  rect: OrientedRect;
  local: XY[];
  /** Superficie in pianta [m²] */
  footprintM2: number;
  slopes: RoofSlope[];
  /** Altezza del colmo sopra la gronda [m] */
  rise: number;
}

export function roofGeometry(roof: RoofSpec, flatTilt: number): RoofGeometry | null {
  if (roof.footprint.length < 3) return null;
  const local = toLocal(roof.footprint);
  const rect = minAreaRect(local);
  const u: XY = { x: Math.cos(rect.angle), y: Math.sin(rect.angle) };
  const v: XY = { x: -u.y, y: u.x };
  const neg = (d: XY): XY => ({ x: -d.x, y: -d.y });
  const at = (d: XY, dist: number): XY => ({ x: rect.cx + d.x * dist, y: rect.cy + d.y * dist });
  const L = rect.length;
  const W = rect.width;
  const tp = Math.tan((roof.pitch * Math.PI) / 180);
  const mk = (down: XY, bottom: number, top: number, depth: number, eaveDist: number, tilt: number): RoofSlope => {
    const az = azimuthOf(down);
    return { down, along: { x: -down.y, y: down.x }, eave: at(down, eaveDist), bottom, top, depth, tilt, azimuth: az, label: `Falda verso ${compassName(az)}` };
  };
  let slopes: RoofSlope[] = [];
  let rise = 0;
  switch (roof.type) {
    case 'piano': {
      // Moduli inclinati sul tetto piano, rivolti verso il lato del rettangolo più vicino al sud.
      const cands = [v, neg(v), u, neg(u)];
      const down = cands.reduce((a, b) => (Math.abs(azimuthOf(b)) < Math.abs(azimuthOf(a)) ? b : a));
      const isV = down === v || down === cands[1];
      const width = isV ? L : W;
      const depth = isV ? W : L;
      const s = mk(down, width, width, depth, depth / 2, flatTilt);
      s.label = `Tetto piano, moduli verso ${compassName(s.azimuth)}`;
      slopes = [s];
      break;
    }
    case 'falda':
      // Quattro possibili versi di pendenza: l'altezza del colmo dipende dalla falda scelta (calcolata sotto).
      slopes = [v, neg(v), u, neg(u)].map((d, i) => (i < 2 ? mk(d, L, L, W, W / 2, roof.pitch) : mk(d, W, W, L, L / 2, roof.pitch)));
      break;
    case 'due-falde':
      rise = (W / 2) * tp;
      slopes = [mk(v, L, L, W / 2, W / 2, roof.pitch), mk(neg(v), L, L, W / 2, W / 2, roof.pitch)];
      break;
    case 'padiglione': {
      rise = (W / 2) * tp;
      const ridge = Math.max(0, L - W);
      slopes = [
        mk(v, L, ridge, W / 2, W / 2, roof.pitch),
        mk(neg(v), L, ridge, W / 2, W / 2, roof.pitch),
        mk(u, W, 0, W / 2, L / 2, roof.pitch),
        mk(neg(u), W, 0, W / 2, L / 2, roof.pitch),
      ];
      break;
    }
  }
  if (roof.type === 'falda') {
    const s = slopes[Math.min(slopes.length - 1, Math.max(0, roof.slope))]!;
    rise = s.depth * tp;
  }
  return { rect, local, footprintM2: polygonArea(local), slopes, rise };
}

/** Falda proposta: quella con l'orientamento più vicino al sud. */
export function bestSlope(g: RoofGeometry): number {
  let best = 0;
  g.slopes.forEach((s, i) => {
    if (Math.abs(s.azimuth) < Math.abs(g.slopes[best]!.azimuth)) best = i;
  });
  return best;
}

// ------------------------------------------------------------------ posa dei moduli

/** Dimensioni del modulo [m]: larghezza tipica 1,134 m, lunghezza ricavata dalla superficie. */
export function moduleSize(m: ModuleSpec): { w: number; h: number } {
  const w = 1.134;
  return { w, h: m.areaM2 / w };
}

export interface PanelPlacement {
  /** Centro del modulo nelle coordinate della falda: a lungo la gronda (dal punto medio), b lungo la pendenza dalla gronda [m] */
  a: number;
  b: number;
}

export interface Layout {
  panels: PanelPlacement[];
  /** Dimensioni del modulo come posato: lungo la gronda e lungo la pendenza [m] */
  pw: number;
  ph: number;
  /** Interasse tra le file (tetto piano) [m] */
  rowPitch: number;
  /** Superficie della falda (nel suo piano) [m²] */
  slopeM2: number;
  /** Altezza minima del sole a mezzogiorno del solstizio d'inverno (tetto piano) [°] */
  winterSunDeg: number;
}

const GAP = 0.02;

/**
 * Disposizione a griglia dei moduli sulla falda, file parallele alla gronda, rispettando la distanza dai bordi.
 * Sui trapezi e sui triangoli (tetto a padiglione) la larghezza utile di ogni fila è quella alla sua sommità.
 * Sul tetto piano le file sono distanziate perché a mezzogiorno del 21 dicembre una fila non ombreggi la successiva.
 */
export function layoutPanels(s: RoofSlope, roof: RoofSpec, mod: ModuleSpec, latitude: number, flat: boolean): Layout {
  const size = moduleSize(mod);
  const pw = roof.orientation === 'verticale' ? size.w : size.h;
  const ph = roof.orientation === 'verticale' ? size.h : size.w;
  const cosT = Math.cos((s.tilt * Math.PI) / 180);
  const winterSunDeg = Math.max(5, 90 - latitude - 23.45);
  const set = roof.setbackM;
  const panels: PanelPlacement[] = [];
  let rowPitch = ph + GAP;
  let slopeM2: number;
  if (flat) {
    // b misura la distanza orizzontale dal bordo anteriore; la fila occupa ph·cos(tilt) in pianta.
    const foot = ph * cosT;
    const shadow = (ph * Math.sin((s.tilt * Math.PI) / 180)) / Math.tan((winterSunDeg * Math.PI) / 180);
    rowPitch = foot + shadow + GAP;
    slopeM2 = s.bottom * s.depth;
    const usable = s.depth - 2 * set;
    const rows = usable >= foot ? Math.floor((usable - foot) / rowPitch) + 1 : 0;
    const cols = Math.max(0, Math.floor((s.bottom - 2 * set + GAP) / (pw + GAP)));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) panels.push({ a: (c - (cols - 1) / 2) * (pw + GAP), b: set + foot / 2 + r * rowPitch });
    }
  } else {
    const slant = s.depth / cosT;
    slopeM2 = ((s.bottom + s.top) / 2) * slant;
    const widthAt = (b: number) => s.bottom - (s.bottom - s.top) * (b / slant);
    for (let b0 = set; b0 + ph <= slant - set + 1e-9; b0 += ph + GAP) {
      const w = Math.min(widthAt(b0), widthAt(b0 + ph)) - 2 * set;
      const cols = Math.max(0, Math.floor((w + GAP) / (pw + GAP)));
      for (let c = 0; c < cols; c++) panels.push({ a: (c - (cols - 1) / 2) * (pw + GAP), b: b0 + ph / 2 });
    }
  }
  return { panels, pw, ph, rowPitch, slopeM2, winterSunDeg };
}

// ------------------------------------------------------------------ sole e clima

/** Posizione del sole nel giorno n all'ora solare h: altezza e azimut (0 = sud, positivo verso ovest) [°]. */
export function sunPosition(latitude: number, n: number, solarHour: number): { elevation: number; azimuth: number } {
  const phi = (latitude * Math.PI) / 180;
  const d = (declination(n) * Math.PI) / 180;
  const w = ((solarHour - 12) * 15 * Math.PI) / 180;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(w);
  const elevation = (Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180) / Math.PI;
  const azimuth = (Math.atan2(Math.sin(w), Math.cos(w) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) * 180) / Math.PI;
  return { elevation, azimuth };
}

/**
 * Dati climatici stimati dalla latitudine: interpolazione lineare tra le tre zone indicative (Palermo, Roma, Milano).
 * Ordine di grandezza per l'Italia; non tiene conto di quota, costa, nebbie e microclima.
 */
export function climateFromLatitude(lat: number): { hDay: number[]; tMean: number[]; tMin: number; tMax: number } {
  const zones = [...SITES].sort((a, b) => a.latitude - b.latitude);
  const lo = zones[0]!;
  const hi = zones[zones.length - 1]!;
  if (lat <= lo.latitude) return { hDay: [...lo.hDay], tMean: [...lo.tMean], tMin: lo.tMin, tMax: lo.tMax };
  if (lat >= hi.latitude) return { hDay: [...hi.hDay], tMean: [...hi.tMean], tMin: hi.tMin, tMax: hi.tMax };
  let i = 0;
  while (lat > zones[i + 1]!.latitude) i++;
  const a = zones[i]!;
  const b = zones[i + 1]!;
  const t = (lat - a.latitude) / (b.latitude - a.latitude);
  const mix = (x: number, y: number, d = 2) => Math.round((x + (y - x) * t) * 10 ** d) / 10 ** d;
  return {
    hDay: a.hDay.map((h, k) => mix(h, b.hDay[k]!)),
    tMean: a.tMean.map((h, k) => mix(h, b.tMean[k]!, 1)),
    tMin: Math.round(mix(a.tMin, b.tMin, 0)),
    tMax: Math.round(mix(a.tMax, b.tMax, 0)),
  };
}

// ------------------------------------------------------------------ collegamento con il progetto

/** Geometria, falda e posa del progetto (null se il tetto non è stato disegnato). */
export function roofLayout(d: PvDesign): { geo: RoofGeometry; slope: RoofSlope; layout: Layout } | null {
  const geo = roofGeometry(d.roof, d.site.tilt);
  if (!geo || geo.rect.length < 1) return null;
  const slope = geo.slopes[Math.min(geo.slopes.length - 1, Math.max(0, d.roof.slope))]!;
  return { geo, slope, layout: layoutPanels(slope, d.roof, d.module, d.site.latitude, d.roof.type === 'piano') };
}

/** Posti della griglia ancora disponibili (non esclusi a mano per camini, lucernari, antenne). */
export function usableSpots(layout: Layout, excluded: number[]): number[] {
  const ex = new Set(excluded);
  return layout.panels.map((_, i) => i).filter((i) => !ex.has(i));
}

/** Numero massimo di moduli sulla falda scelta (null se il tetto non è stato disegnato). */
export function roofCapacity(d: PvDesign): number | null {
  const r = roofLayout(d);
  return r ? usableSpots(r.layout, d.roof.excluded ?? []).length : null;
}

export interface FieldLayout {
  /** 0 = prima falda, 1 = seconda falda */
  field: 0 | 1;
  slope: RoofSlope;
  slopeIndex: number;
  layout: Layout;
  /** Posti della griglia disponibili e, tra questi, quelli occupati dai moduli del progetto */
  usable: number[];
  installed: number[];
  excluded: number[];
}

/** Disposizione dei moduli di ogni falda del progetto (vuoto se il tetto non è disegnato). */
export function fieldLayouts(d: PvDesign): FieldLayout[] {
  const r = roofLayout(d);
  if (!r) return [];
  const flat = d.roof.type === 'piano';
  const out: FieldLayout[] = [];
  const mk = (field: 0 | 1, slopeIndex: number, excluded: number[], n: number): FieldLayout | null => {
    const slope = r.geo.slopes[slopeIndex];
    if (!slope) return null;
    const layout = field === 0 ? r.layout : layoutPanels(slope, d.roof, d.module, d.site.latitude, flat);
    const usable = usableSpots(layout, excluded);
    return { field, slope, slopeIndex, layout, usable, installed: usable.slice(0, n), excluded };
  };
  const f1 = mk(0, Math.min(r.geo.slopes.length - 1, Math.max(0, d.roof.slope)), d.roof.excluded ?? [], d.modulesPerString * d.strings);
  if (f1) out.push(f1);
  if (d.field2?.enabled && !flat) {
    const f2 = mk(1, d.field2.slope, d.field2.excluded ?? [], d.field2.modulesPerString * d.field2.strings);
    if (f2 && f2.slopeIndex !== f1?.slopeIndex) out.push(f2);
  }
  return out;
}

/**
 * Riporta nel progetto i dati ricavati da posizione e tetto: latitudine, clima stimato (zona «automatica»),
 * inclinazione e orientamento della falda scelta. Il tetto piano mantiene l'inclinazione dei telai scelta dall'utente.
 */
export function syncRoof(input: PvDesign): PvDesign {
  let d = input;
  // Falda non ancora scelta (pianta appena disegnata o tipo di tetto cambiato): quella più vicina al sud.
  if (d.roof.footprint.length >= 3) {
    const geo = roofGeometry(d.roof, d.site.tilt);
    if (geo && (d.roof.slope < 0 || d.roof.slope >= geo.slopes.length)) d = { ...d, roof: { ...d.roof, slope: bestSlope(geo) } };
  }
  let site = d.site;
  if (d.location.lat !== null && Math.abs(d.location.lat - site.latitude) > 1e-6) site = { ...site, latitude: Math.round(d.location.lat * 1000) / 1000 };
  // Dati PVGIS di un altro posto (la casa è stata spostata): si torna alla stima dalla latitudine.
  const w = site.weather;
  if (w && d.location.lat !== null && (Math.abs(w.lat - d.location.lat) > 0.02 || Math.abs(w.lon - (d.location.lon ?? w.lon)) > 0.02)) {
    site = { ...site, weather: null, presetId: 'auto' };
  }
  if (site.weather && isWeather(site.weather)) {
    const sum = weatherSummary(site.weather);
    if (site.presetId !== 'pvgis' || sum.hDay.some((h, i) => h !== site.hDay[i])) site = { ...site, ...sum, presetId: 'pvgis' };
  } else if (site.presetId === 'pvgis') site = { ...site, presetId: 'auto' };
  if (site.presetId === 'auto') {
    const c = climateFromLatitude(site.latitude);
    site = { ...site, ...c };
  }
  const r = roofLayout({ ...d, site });
  if (r) {
    const tilt = d.roof.type === 'piano' ? site.tilt : r.slope.tilt;
    const azimuth = Math.round(r.slope.azimuth);
    if (tilt !== site.tilt || azimuth !== site.azimuth) site = { ...site, tilt, azimuth };
    // Seconda falda: se non scelta (o coincide con la prima) si prende la migliore tra le altre; inclinazione e orientamento dal tetto.
    if (d.field2?.enabled && d.roof.type !== 'piano') {
      const others = r.geo.slopes.map((x, i) => ({ x, i })).filter((o) => o.i !== d.roof.slope);
      let f2 = d.field2;
      if (!others.some((o) => o.i === f2.slope) && others.length) {
        const best = others.reduce((a, b) => (Math.abs(b.x.azimuth) < Math.abs(a.x.azimuth) ? b : a));
        f2 = { ...f2, slope: best.i, excluded: [] };
      }
      const sl = r.geo.slopes[f2.slope];
      if (sl && (f2.tilt !== sl.tilt || f2.azimuth !== Math.round(sl.azimuth))) f2 = { ...f2, tilt: sl.tilt, azimuth: Math.round(sl.azimuth) };
      if (f2 !== d.field2) d = { ...d, field2: f2 };
    }
  }
  return site === d.site ? d : { ...d, site };
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/**
 * Vertici di un modulo nello spazio (metri locali, z verso l'alto), in ordine: basso-sinistra, basso-destra, alto-destra, alto-sinistra.
 * Sulle falde il modulo è complanare al tetto (sollevato di 10 cm); sul tetto piano è su un telaio inclinato.
 */
export function panelCorners(s: RoofSlope, l: Layout, p: PanelPlacement, baseZ: number, flat: boolean): XYZ[] {
  const t = (s.tilt * Math.PI) / 180;
  const pos = (a: number, bh: number, z: number): XYZ => ({ x: s.eave.x + s.along.x * a - s.down.x * bh, y: s.eave.y + s.along.y * a - s.down.y * bh, z });
  const a0 = p.a - l.pw / 2;
  const a1 = p.a + l.pw / 2;
  if (flat) {
    const foot = l.ph * Math.cos(t);
    const b0 = p.b - foot / 2;
    const b1 = p.b + foot / 2;
    const z0 = baseZ + 0.15;
    const z1 = z0 + l.ph * Math.sin(t);
    return [pos(a0, b0, z0), pos(a1, b0, z0), pos(a1, b1, z1), pos(a0, b1, z1)];
  }
  const b0 = p.b - l.ph / 2;
  const b1 = p.b + l.ph / 2;
  const off = 0.1;
  return [pos(a0, b0 * Math.cos(t), baseZ + b0 * Math.sin(t) + off), pos(a1, b0 * Math.cos(t), baseZ + b0 * Math.sin(t) + off), pos(a1, b1 * Math.cos(t), baseZ + b1 * Math.sin(t) + off), pos(a0, b1 * Math.cos(t), baseZ + b1 * Math.sin(t) + off)];
}
