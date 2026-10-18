import type { PanelConfig, RailPlacement, XY } from './types';

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

export function railToPosition(r: RailPlacement): XY {
  return { x: PANEL_PAD_X + r.slot * MODULE_W, y: railTop(r.row) };
}

/** Converte una posizione libera nella guida/slot più vicini (senza verificare l'occupazione). */
export function positionToRail(pos: XY, panel: PanelConfig): RailPlacement {
  const row = Math.round((pos.y - PANEL_PAD_TOP) / RAIL_PITCH);
  const slot = Math.round((pos.x - PANEL_PAD_X) / MODULE_W);
  return {
    row: Math.max(0, Math.min(panel.rows - 1, row)),
    slot: Math.max(0, Math.min(panel.modulesPerRow - 1, slot)),
  };
}
