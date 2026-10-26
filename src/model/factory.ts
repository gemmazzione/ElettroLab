import { tracePhase } from '../graph/netGraph';
import { catalogItem } from './catalog';
import { DEFAULT_COLOR_FOR } from './constants';
import { railToPosition } from './geometry';
import { panelOf } from './placement';
import { getTerminals, parseTerminalId } from './terminals';
import type {
  ComponentInstance,
  Conductor,
  PanelConfig,
  Project,
  RailPlacement,
  TerminalFunction,
  Wire,
  WireColor,
  WireSection,
  XY,
} from './types';

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyProject(name = 'Nuovo progetto', panel: PanelConfig = { modulesPerRow: 12, rows: 2 }): Project {
  return {
    schemaVersion: 1,
    id: newId('prj'),
    name,
    description: '',
    panels: [{ id: 'P1', name: 'Quadro generale', origin: { x: 0, y: 0 }, ...panel }],
    components: [],
    wires: [],
    updatedAt: new Date().toISOString(),
  };
}

export function nextLabel(project: Project, prefix: string): string {
  let max = 0;
  for (const c of project.components) {
    const m = c.label.match(/^([A-Z]+)(\d+)$/);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${max + 1}`;
}

export function createComponent(
  project: Project,
  catalogId: string,
  where: { rail: RailPlacement } | { position: XY },
): ComponentInstance {
  const item = catalogItem(catalogId);
  if (!item.defaults) throw new Error(`${item.name}: ${item.unavailableReason ?? 'non disponibile'}`);
  const rail = 'rail' in where ? { ...where.rail, panelId: panelOf(project, where.rail.panelId).id } : undefined;
  return {
    id: newId(item.kind),
    catalogId,
    label: nextLabel(project, item.labelPrefix),
    params: structuredClone(item.defaults),
    position: rail ? railToPosition(rail, panelOf(project, rail.panelId)) : (where as { position: XY }).position,
    ...(rail ? { rail } : {}),
    closed: false,
  };
}

export function terminalFunction(project: Project, tid: string): TerminalFunction | null {
  const { componentId } = parseTerminalId(tid);
  const c = project.components.find((x) => x.id === componentId);
  if (!c) return null;
  return getTerminals(c).find((t) => t.id === tid)?.fn ?? null;
}

/** Identificazione proposta per un nuovo conduttore in base ai morsetti collegati. */
export function inferConductor(project: Project, from: string, to: string): Conductor {
  const fa = terminalFunction(project, from);
  const fb = terminalFunction(project, to);
  if (fa === 'PE' || fb === 'PE') return 'PE';
  if (fa === 'DC+' || fb === 'DC+') return 'DC+';
  if (fa === 'DC-' || fb === 'DC-') return 'DC-';
  if (fa === 'N' || fb === 'N') return 'N';
  // Fase: si risale il circuito fino al punto di fornitura (L1, L2 o L3).
  const ph = tracePhase(project, from) ?? tracePhase(project, to);
  return ph === 2 ? 'L2' : ph === 3 ? 'L3' : 'L1';
}

export function createWire(
  project: Project,
  from: string,
  to: string,
  opts: { conductor?: Conductor; color?: WireColor; section?: WireSection; length?: number } = {},
): Wire {
  const conductor = opts.conductor ?? inferConductor(project, from, to);
  return {
    id: newId('w'),
    from,
    to,
    conductor,
    color: opts.color ?? DEFAULT_COLOR_FOR[conductor],
    section: opts.section ?? 2.5,
    length: opts.length ?? 0.25,
  };
}
