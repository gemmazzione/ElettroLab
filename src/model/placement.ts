import { catalogItem } from './catalog';
import type { PanelConfig, PanelDef, Project, RailPlacement } from './types';

/** Quadro di una collocazione su guida (il primo se non specificato o non trovato). */
export function panelOf(project: Project, panelId?: string): PanelDef {
  return project.panels.find((p) => p.id === panelId) ?? project.panels[0]!;
}

/** Moduli occupati su una guida di un quadro, esclusa eventualmente un'istanza. */
function occupied(project: Project, panel: PanelDef, row: number, excludeId?: string): boolean[] {
  const occ = Array.from({ length: panel.modulesPerRow }, () => false);
  for (const c of project.components) {
    if (!c.rail || c.rail.row !== row || c.id === excludeId) continue;
    if (panelOf(project, c.rail.panelId).id !== panel.id) continue;
    const m = catalogItem(c.catalogId).modules;
    for (let i = 0; i < m; i++) if (c.rail.slot + i < occ.length) occ[c.rail.slot + i] = true;
  }
  return occ;
}

export function canPlace(project: Project, modules: number, rail: RailPlacement, excludeId?: string): boolean {
  const panel = panelOf(project, rail.panelId);
  if (rail.row < 0 || rail.row >= panel.rows) return false;
  if (rail.slot < 0 || rail.slot + modules > panel.modulesPerRow) return false;
  const occ = occupied(project, panel, rail.row, excludeId);
  for (let i = 0; i < modules; i++) if (occ[rail.slot + i]) return false;
  return true;
}

/** Posizione libera più vicina a quella desiderata: prima nello stesso quadro, poi negli altri. */
export function nearestFreeSlot(project: Project, modules: number, desired: RailPlacement, excludeId?: string): RailPlacement | null {
  const first = panelOf(project, desired.panelId);
  const panels = [first, ...project.panels.filter((p) => p.id !== first.id)];
  for (const panel of panels) {
    const rows = [...Array(panel.rows).keys()].sort((a, b) => Math.abs(a - desired.row) - Math.abs(b - desired.row));
    for (const row of rows) {
      const slots = [...Array(panel.modulesPerRow).keys()].sort((a, b) => Math.abs(a - desired.slot) - Math.abs(b - desired.slot));
      for (const slot of slots) if (canPlace(project, modules, { panelId: panel.id, row, slot }, excludeId)) return { panelId: panel.id, row, slot };
    }
  }
  return null;
}

/** Verifica se un nuovo formato di un quadro può contenere i dispositivi già montati. */
export function panelFits(project: Project, panelId: string, config: PanelConfig): string | null {
  for (const c of project.components) {
    if (!c.rail || panelOf(project, c.rail.panelId).id !== panelId) continue;
    const m = catalogItem(c.catalogId).modules;
    if (c.rail.row >= config.rows) return `${c.label} è montato sulla guida ${c.rail.row + 1}, che verrebbe rimossa.`;
    if (c.rail.slot + m > config.modulesPerRow) return `${c.label} non entra in una guida da ${config.modulesPerRow} moduli.`;
  }
  return null;
}

/** Moduli occupati in totale e per quadro. */
export function modulesUsed(project: Project, panelId?: string): number {
  return project.components.reduce((n, c) => {
    if (!c.rail) return n;
    if (panelId && panelOf(project, c.rail.panelId).id !== panelId) return n;
    return n + catalogItem(c.catalogId).modules;
  }, 0);
}

export const modulesTotal = (project: Project) => project.panels.reduce((n, p) => n + p.modulesPerRow * p.rows, 0);
