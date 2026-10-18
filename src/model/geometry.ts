import type { PanelConfig, PanelDef, RailPlacement, XY } from './types';

/** Larghezza di un modulo DIN (17,5 mm) in pixel di disegno */
export const MODULE_W = 36;
/** Altezza del fronte di un dispositivo modulare (~85 mm) */
export const DEVICE_H = 170;
/** Altezza di una morsettiera */
export const BAR_H = 58;
/** Passo verticale tra le guide DIN (spazio per il cablaggio) */
export const RAIL_PITCH = 300;
export const PANEL_PAD_X = 48;
export const PANEL_PAD_TOP = 72;
export const PANEL_PAD_BOTTOM = 56;

/** y dei morsetti superiori e inferiori rispetto al bordo del dispositivo */
export const TERMINAL_Y_TOP = 13;
export const TERMINAL_Y_BOTTOM = DEVICE_H - 13;

export const PANEL_SIZES: { modules: number; config: PanelConfig }[] = [
  { modules: 4, config: { modulesPerRow: 4, rows: 1 } },
  { modules: 6, config: { modulesPerRow: 6, rows: 1 } },
  { modules: 8, config: { modulesPerRow: 8, rows: 1 } },
  { modules: 12, config: { modulesPerRow: 12, rows: 1 } },
  { modules: 24, config: { modulesPerRow: 12, rows: 2 } },
  { modules: 36, config: { modulesPerRow: 12, rows: 3 } },
  { modules: 48, config: { modulesPerRow: 12, rows: 4 } },
  { modules: 54, config: { modulesPerRow: 18, rows: 3 } },
  { modules: 72, config: { modulesPerRow: 18, rows: 4 } },
];

export function panelSize(panel: PanelConfig): { w: number; h: number } {
  return {
    w: PANEL_PAD_X * 2 + panel.modulesPerRow * MODULE_W,
    h: PANEL_PAD_TOP + (panel.rows - 1) * RAIL_PITCH + DEVICE_H + PANEL_PAD_BOTTOM,
  };
}

/** y del bordo superiore dei dispositivi montati sulla guida `row` */
export function railTop(row: number): number {
  return PANEL_PAD_TOP + row * RAIL_PITCH;
}

export function railToPosition(r: RailPlacement, panel: PanelDef): XY {
  return { x: panel.origin.x + PANEL_PAD_X + r.slot * MODULE_W, y: panel.origin.y + railTop(r.row) };
}

/** Distanza di un punto dal rettangolo di un quadro (0 se interno). */
function distanceToPanel(pos: XY, p: PanelDef): number {
  const { w, h } = panelSize(p);
  const dx = Math.max(p.origin.x - pos.x, 0, pos.x - (p.origin.x + w));
  const dy = Math.max(p.origin.y - pos.y, 0, pos.y - (p.origin.y + h));
  return Math.hypot(dx, dy);
}

/** Quadro più vicino a una posizione dell'area di lavoro. */
export function nearestPanel(pos: XY, panels: PanelDef[]): PanelDef {
  return panels.reduce((best, p) => (distanceToPanel(pos, p) < distanceToPanel(pos, best) ? p : best), panels[0]!);
}

/** Converte una posizione libera nel quadro, guida e modulo più vicini (senza verificare l'occupazione). */
export function positionToRail(pos: XY, panels: PanelDef[]): RailPlacement {
  const panel = nearestPanel(pos, panels);
  const row = Math.round((pos.y - panel.origin.y - PANEL_PAD_TOP) / RAIL_PITCH);
  const slot = Math.round((pos.x - panel.origin.x - PANEL_PAD_X) / MODULE_W);
  return {
    panelId: panel.id,
    row: Math.max(0, Math.min(panel.rows - 1, row)),
    slot: Math.max(0, Math.min(panel.modulesPerRow - 1, slot)),
  };
}

/** Distanza orizzontale tra quadri affiancati. */
export const PANEL_GAP = 160;

/** Origine per un nuovo quadro, a destra di quelli esistenti. */
export function nextPanelOrigin(panels: PanelDef[]): XY {
  if (!panels.length) return { x: 0, y: 0 };
  const right = Math.max(...panels.map((p) => p.origin.x + panelSize(p).w));
  return { x: right + PANEL_GAP, y: panels[0]!.origin.y };
}
