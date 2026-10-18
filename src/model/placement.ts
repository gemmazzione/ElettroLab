import { catalogItem } from './catalog';
import type { PanelConfig, Project, RailPlacement } from './types';

/** Moduli occupati su una guida, esclusa eventualmente un'istanza. */
function occupied(project: Project, row: number, excludeId?: string): boolean[] {
  const occ = Array.from({ length: project.panel.modulesPerRow }, () => false);
  for (const c of project.components) {
    if (!c.rail || c.rail.row !== row || c.id === excludeId) continue;
    const m = catalogItem(c.catalogId).modules;
    for (let i = 0; i < m; i++) if (c.rail.slot + i < occ.length) occ[c.rail.slot + i] = true;
  }
  return occ;
}

export function canPlace(project: Project, modules: number, rail: RailPlacement, excludeId?: string): boolean {
  if (rail.row < 0 || rail.row >= project.panel.rows) return false;
  if (rail.slot < 0 || rail.slot + modules > project.panel.modulesPerRow) return false;
  const occ = occupied(project, rail.row, excludeId);
  for (let i = 0; i < modules; i++) if (occ[rail.slot + i]) return false;
  return true;
}

/** Posizione libera più vicina a quella desiderata (stessa guida per prima), oppure null. */
export function nearestFreeSlot(project: Project, modules: number, desired: RailPlacement, excludeId?: string): RailPlacement | null {
  const rows = [...Array(project.panel.rows).keys()].sort((a, b) => Math.abs(a - desired.row) - Math.abs(b - desired.row));
  for (const row of rows) {
    const slots = [...Array(project.panel.modulesPerRow).keys()].sort(
      (a, b) => Math.abs(a - desired.slot) - Math.abs(b - desired.slot),
    );
    for (const slot of slots) if (canPlace(project, modules, { row, slot }, excludeId)) return { row, slot };
  }
  return null;
}

/** Verifica se un nuovo formato del quadro può contenere i dispositivi già montati. */
export function panelFits(project: Project, panel: PanelConfig): string | null {
  for (const c of project.components) {
    if (!c.rail) continue;
    const m = catalogItem(c.catalogId).modules;
    if (c.rail.row >= panel.rows) return `${c.label} è montato sulla guida ${c.rail.row + 1}, che verrebbe rimossa.`;
    if (c.rail.slot + m > panel.modulesPerRow) return `${c.label} non entra in una guida da ${panel.modulesPerRow} moduli.`;
  }
  return null;
}
