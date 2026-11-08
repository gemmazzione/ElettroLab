import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DinDeviceSvg } from '../editor/svg/DinDeviceSvg';
import { WIRE_COLOR_HEX, WIRE_STROKE_FOR_SECTION } from '../model/constants';
import { catalogItem } from '../model/catalog';
import { DEVICE_H, MODULE_W, PANEL_PAD_X, panelSize, railTop, TERMINAL_Y_BOTTOM, TERMINAL_Y_TOP } from '../model/geometry';
import { panelOf } from '../model/placement';
import { componentHeight, componentWidth, getTerminals } from '../model/terminals';
import type { ComponentInstance, PanelDef, Project, Wire } from '../model/types';

/**
 * «Foto» del quadro per le relazioni: il fronte di un pannello come appare nel laboratorio, con le guide DIN,
 * i dispositivi disegnati in proporzione, i pettini e i conduttori interni colorati secondo la loro funzione.
 * I conduttori verso utilizzatori e fornitura escono dal bordo del quadro. Reso in SVG e poi in JPEG.
 */

const LABEL_FONT = 'Helvetica, Arial, sans-serif';

function terminalPoint(c: ComponentInstance, key: string, panel: PanelDef): { x: number; y: number; top: boolean } | null {
  const t = getTerminals(c).find((x) => x.key === key);
  if (!t || !c.rail) return null;
  const x0 = PANEL_PAD_X + c.rail.slot * MODULE_W;
  const y0 = railTop(c.rail.row);
  const h = componentHeight(c);
  const top = t.side === 'top';
  void panel;
  return { x: x0 + t.x, y: y0 + (top ? TERMINAL_Y_TOP : Math.min(TERMINAL_Y_BOTTOM, h - 13)), top };
}

const split = (id: string) => [id.slice(0, id.lastIndexOf(':')), id.slice(id.lastIndexOf(':') + 1)] as const;

/** SVG del fronte di un quadro (coordinate del pannello, origine nell'angolo in alto a sinistra). */
export function panelPhotoSvg(project: Project, panel: PanelDef, title: string): { markup: string; w: number; h: number } {
  const { w, h: h0 } = panelSize(panel);
  const h = h0 + 40;
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const onPanel = (c: ComponentInstance | undefined) => !!c && !!c.rail && panelOf(project, c.rail.panelId).id === panel.id;
  const devices = project.components.filter((c) => onPanel(c) && catalogItem(c.catalogId).mount === 'din');
  const railW = panel.modulesPerRow * MODULE_W;

  // Conduttori con almeno un estremo nel quadro
  const wires: { wire: Wire; a: { x: number; y: number; top: boolean }; b: { x: number; y: number; top: boolean } | null }[] = [];
  for (const wire of project.wires) {
    const [fa, ka] = split(wire.from);
    const [fb, kb] = split(wire.to);
    const ca = byId.get(fa);
    const cb = byId.get(fb);
    const ina = onPanel(ca) ? terminalPoint(ca!, ka, panel) : null;
    const inb = onPanel(cb) ? terminalPoint(cb!, kb, panel) : null;
    if (ina && inb) wires.push({ wire, a: ina, b: inb });
    else if (ina) wires.push({ wire, a: ina, b: null });
    else if (inb) wires.push({ wire, a: inb, b: null });
  }

  const paths: string[] = [];
  const combs: string[] = [];
  wires.forEach(({ wire, a, b }, i) => {
    if (wire.comb && b) {
      const off = 10 + wire.comb.pin * 6;
      const yb = Math.min(a.y, b.y) - off;
      combs.push(`<path d="M${a.x},${a.y} V${yb} H${b.x} V${b.y}" fill="none" stroke="#7c3f12" stroke-width="5" stroke-linejoin="round"/><path d="M${a.x},${a.y} V${yb} H${b.x} V${b.y}" fill="none" stroke="#d4824a" stroke-width="3" stroke-linejoin="round"/>`);
      return;
    }
    const color = WIRE_COLOR_HEX[wire.color];
    const sw = Math.max(1.6, WIRE_STROKE_FOR_SECTION[wire.section] ?? 2);
    let d: string;
    if (b) {
      // Percorso a gradini nella canalina: esce dal morsetto, scorre in orizzontale, rientra nel morsetto.
      const lane = (i % 7) * 4;
      if (a.top === b.top) {
        const ya = a.top ? a.y - 18 - lane : a.y + 18 + lane;
        const yb = b.top ? b.y - 18 - lane : b.y + 18 + lane;
        const ym = a.top ? Math.min(ya, yb) : Math.max(ya, yb);
        d = `M${a.x},${a.y} V${ym} H${b.x} V${b.y}`;
      } else {
        // Da un morsetto inferiore a uno superiore: sotto la guida, su per la canalina laterale, sopra la guida.
        const lo = a.top ? b : a;
        const hi = a.top ? a : b;
        const yLow = lo.y + 20 + lane;
        const yHigh = hi.y - 22 - lane;
        const xSide = 18 + (i % 6) * 4;
        d = `M${lo.x},${lo.y} V${yLow} H${xSide} V${yHigh} H${hi.x} V${hi.y}`;
      }
    } else {
      // Verso l'esterno del quadro (utilizzatori, fornitura, terra): esce dal bordo inferiore.
      const ya = a.top ? a.y - 20 : a.y + 22;
      d = `M${a.x},${a.y} V${ya} H${Math.min(w - 12, Math.max(12, a.x))} V${h - 6}`;
    }
    paths.push(`<path d="${d}" fill="none" stroke="#0f172a" stroke-opacity="0.35" stroke-width="${sw + 1.6}" stroke-linejoin="round"/>`);
    paths.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`);
    if (wire.color === 'giallo-verde') paths.push(`<path d="${d}" fill="none" stroke="#facc15" stroke-width="${sw}" stroke-dasharray="7 7"/>`);
  });

  const rails = Array.from({ length: panel.rows }, (_, r) => {
    const cy = railTop(r) + DEVICE_H / 2;
    const holes = Array.from({ length: Math.floor((railW + 28) / 26) }, (_, k) => `<rect x="${PANEL_PAD_X - 6 + k * 26}" y="${cy - 4}" width="14" height="8" rx="3" fill="#7b8794"/>`).join('');
    return `<rect x="${PANEL_PAD_X - 14}" y="${cy - 32}" width="${railW + 28}" height="64" rx="2" fill="#c3cad3" stroke="#8e98a4"/><rect x="${PANEL_PAD_X - 14}" y="${cy - 24}" width="${railW + 28}" height="48" fill="#aeb6c0"/>${holes}`;
  }).join('');

  const devs = devices
    .map((c) => {
      const x = PANEL_PAD_X + c.rail!.slot * MODULE_W;
      const y = railTop(c.rail!.row);
      const inner = renderToStaticMarkup(createElement(DinDeviceSvg, { comp: c, width: componentWidth(c), terminals: getTerminals(c), showLabels: true }));
      const label = c.label ? `<text x="${x + componentWidth(c) / 2}" y="${y + componentHeight(c) + 14}" text-anchor="middle" font-size="10" font-weight="700" fill="#1e293b" font-family="${LABEL_FONT}">${escapeXml(c.label)}</text>` : '';
      return `<g transform="translate(${x} ${y})">${inner}</g>${label}`;
    })
    .join('');

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="10" fill="#e9edf1" stroke="#9aa4b0" stroke-width="2"/>` +
    `<rect x="8" y="8" width="${w - 16}" height="${h - 16}" rx="6" fill="#f4f6f8" stroke="#c7ced6"/>` +
    `<text x="20" y="30" font-size="14" font-weight="700" fill="#1e293b" font-family="${LABEL_FONT}">${escapeXml(title)}</text>` +
    `<text x="20" y="47" font-size="10.5" fill="#64748b" font-family="${LABEL_FONT}">${panel.modulesPerRow * panel.rows} moduli · ${panel.rows} ${panel.rows === 1 ? 'guida' : 'guide'} DIN da ${panel.modulesPerRow}</text>` +
    rails +
    paths.join('') +
    devs +
    combs.join('') +
    `</svg>`;
  return { markup, w, h };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Converte un SVG in JPEG (nel browser). */
export async function svgToJpeg(markup: string, w: number, h: number, scale = 2): Promise<{ data: string; w: number; h: number } | null> {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('rendering non riuscito'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.9), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PanelPhoto {
  title: string;
  data: string;
  w: number;
  h: number;
}

/** «Foto» di tutti i quadri del progetto (immagini JPEG); i quadri vuoti si saltano. */
export async function panelPhotos(project: Project): Promise<PanelPhoto[]> {
  const out: PanelPhoto[] = [];
  for (const [i, panel] of project.panels.entries()) {
    const title = project.panels.length > 1 ? panel.name : project.name;
    const hasDevices = project.components.some((c) => c.rail && panelOf(project, c.rail.panelId).id === panel.id);
    if (!hasDevices) continue;
    const svg = panelPhotoSvg(project, panel, title || `Quadro ${i + 1}`);
    const img = await svgToJpeg(svg.markup, svg.w, svg.h).catch(() => null);
    if (img) out.push({ title: title || `Quadro ${i + 1}`, ...img });
  }
  return out;
}
