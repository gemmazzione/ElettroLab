// Pianta per la relazione: foto satellitare con il tetto, i moduli (colorati secondo le ombre) e gli ostacoli.
// Solo nel browser: le tessere si scaricano e si disegnano su una tela.

import type { PvDesign } from './design';
import { centroidLatLon, fieldLayouts, panelCorners, toLatLon, toLocal, type XY } from './roof';
import type { ShadingResult } from './shading';

const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const ZOOM = 19;
/** Ingrandimento della tela rispetto alle tessere: linee nitide anche se la foto è a 19. */
const SCALE = 3;

export interface PlanImage {
  dataUrl: string;
  /** Larghezza / altezza */
  ratio: number;
  /** Foto satellitare riuscita (altrimenti solo il disegno) */
  photo: boolean;
  /** Metri per pixel della tela */
  mPerPx: number;
}

const world = (lat: number, lon: number) => {
  const n = 256 * 2 ** ZOOM;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

function loadTile(x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${TILE}/${ZOOM}/${y}/${x}`;
    setTimeout(() => reject(new Error('timeout')), 8000);
  });
}

/** Colore della perdita per ombra: verde, giallo, rosso (15% o più). */
export function lossRgb(loss: number): [number, number, number] {
  const t = Math.min(1, loss / 0.15);
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * k)) as [number, number, number];
  return t < 1 / 3 ? mix([34, 197, 94], [250, 204, 21], t * 3) : mix([250, 204, 21], [239, 68, 68], (t - 1 / 3) * 1.5);
}

export async function planImage(d: PvDesign, shading: ShadingResult | null): Promise<PlanImage | null> {
  if (typeof document === 'undefined' || d.roof.footprint.length < 3) return null;
  const origin = centroidLatLon(d.roof.footprint);
  const ll = (p: XY) => toLatLon(p, origin);
  // Area: tetto e ostacoli con un margine, almeno 36 m di lato.
  const pts: XY[] = [...toLocal(d.roof.footprint, origin), ...d.obstacles.map((o) => ({ x: o.x, y: o.y }))];
  const pad = 6;
  let x0 = Math.min(...pts.map((p) => p.x)) - pad;
  let x1 = Math.max(...pts.map((p) => p.x)) + pad;
  let y0 = Math.min(...pts.map((p) => p.y)) - pad;
  let y1 = Math.max(...pts.map((p) => p.y)) + pad;
  const grow = (a: number, b: number, min: number): [number, number] => (b - a < min ? [(a + b) / 2 - min / 2, (a + b) / 2 + min / 2] : [a, b]);
  [x0, x1] = grow(x0, x1, 36);
  [y0, y1] = grow(y0, y1, 26);
  const nw = world(...ll({ x: x0, y: y1 }));
  const se = world(...ll({ x: x1, y: y0 }));
  const W = Math.round((se.x - nw.x) * SCALE);
  const H = Math.round((se.y - nw.y) * SCALE);
  if (W <= 0 || H <= 0 || W > 4000 || H > 4000) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const px = (p: XY) => {
    const w = world(...ll(p));
    return [(w.x - nw.x) * SCALE, (w.y - nw.y) * SCALE] as const;
  };

  // Foto satellitare
  try {
    const tiles: Promise<void>[] = [];
    for (let tx = Math.floor(nw.x / 256); tx <= Math.floor(se.x / 256); tx++)
      for (let ty = Math.floor(nw.y / 256); ty <= Math.floor(se.y / 256); ty++)
        tiles.push(loadTile(tx, ty).then((img) => ctx.drawImage(img, (tx * 256 - nw.x) * SCALE, (ty * 256 - nw.y) * SCALE, 256 * SCALE, 256 * SCALE)));
    await Promise.all(tiles);
    // Prova di lettura: con tessere senza CORS la tela è «sporca» e toDataURL fallirebbe.
    canvas.toDataURL('image/jpeg', 0.1);
  } catch {
    // La tela potrebbe essere «sporca»: si disegna su una nuova, senza foto.
    return drawOn(d, shading, document.createElement('canvas'), W, H, px, false);
  }
  return drawOn(d, shading, canvas, W, H, px, true);
}

function drawOn(d: PvDesign, shading: ShadingResult | null, canvas: HTMLCanvasElement, W: number, H: number, px: (p: XY) => readonly [number, number], photo: boolean): PlanImage | null {
  // Ridimensionare la tela la cancella: solo per quella nuova, senza foto.
  if (!photo) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (!photo) {
    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(0, 0, W, H);
  } else {
    // canvas già con la foto: un velo leggero rende più leggibile il disegno
    ctx.fillStyle = 'rgba(15,23,42,0.18)';
    ctx.fillRect(0, 0, W, H);
  }
  const origin = centroidLatLon(d.roof.footprint);
  const poly = (p: XY[], fill: string | null, stroke: string, width: number, dash: number[] = []) => {
    ctx.beginPath();
    p.forEach((q, i) => {
      const [x, y] = px(q);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.setLineDash(dash);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  poly(toLocal(d.roof.footprint, origin), photo ? null : '#cbd5e1', '#f59e0b', 2.5 * (W / 600 > 1 ? 1.4 : 1));
  const flat = d.roof.type === 'piano';
  let k = 0;
  for (const l of fieldLayouts(d)) {
    const installed = new Set(l.installed);
    l.layout.panels.forEach((pp, i) => {
      const c = panelCorners(l.slope, l.layout, pp, 0, flat);
      if (installed.has(i)) {
        const loss = shading?.perPanel[k++];
        const fill = loss === undefined ? (l.field === 0 ? '#1d4ed8' : '#7c3aed') : `rgb(${lossRgb(loss).join(',')})`;
        poly(c, fill, '#0f172a', 1.2);
      } else if (l.excluded.includes(i)) poly(c, 'rgba(127,29,29,0.35)', '#f87171', 1, [4, 3]);
    });
  }
  for (const o of d.obstacles) {
    const [x, y] = px({ x: o.x, y: o.y });
    const [xr] = px({ x: o.x + o.size / 2, y: o.y });
    const r = Math.max(4, xr - x);
    ctx.lineWidth = 2;
    if (o.kind === 'albero') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(22,163,74,0.45)';
      ctx.fill();
      ctx.strokeStyle = '#14532d';
      ctx.stroke();
    } else {
      const corners = [
        { x: o.x - o.size / 2, y: o.y - o.depth / 2 },
        { x: o.x + o.size / 2, y: o.y - o.depth / 2 },
        { x: o.x + o.size / 2, y: o.y + o.depth / 2 },
        { x: o.x - o.size / 2, y: o.y + o.depth / 2 },
      ];
      poly(corners, o.kind === 'camino' ? 'rgba(120,113,108,0.85)' : 'rgba(71,85,105,0.6)', '#1e293b', 2);
    }
  }
  // Nord e scala
  const s = Math.max(1, W / 600);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(10 * s, 10 * s, 34 * s, 44 * s);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(27 * s, 16 * s);
  ctx.lineTo(35 * s, 36 * s);
  ctx.lineTo(19 * s, 36 * s);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold ${12 * s}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('N', 27 * s, 50 * s);
  const [ax] = px({ x: 0, y: 0 });
  const [bx] = px({ x: 5, y: 0 });
  const len = bx - ax;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(W - len - 26 * s, H - 30 * s, len + 16 * s, 22 * s);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(W - len - 18 * s, H - 14 * s, len, 3 * s);
  ctx.fillText('5 m', W - len / 2 - 18 * s, H - 18 * s);
  try {
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), ratio: W / H, photo, mPerPx: 5 / len };
  } catch {
    return null;
  }
}
