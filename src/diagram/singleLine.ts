import { buildNetGraph, analyzeCircuits, phaseOfNet, seriesDevices } from '../graph/netGraph';
import { getPoles, isSwitchingDevice, loadHasNeutral, loadPhaseKeys, terminalId } from '../model/terminals';
import { panelOf } from '../model/placement';
import type { ComponentInstance, Project } from '../model/types';

/**
 * Schema unifilare ricavato dal grafo elettrico.
 * Ogni dispositivo è figlio dell'ultimo dispositivo in serie a monte (stessa analisi
 * topologica usata dalle verifiche): lo schema è sempre coerente con i collegamenti reali.
 */

export type SLKind = 'supply' | 'device' | 'load';

export interface SLNode {
  id: string;
  kind: SLKind;
  comp: ComponentInstance;
  children: SLNode[];
  /** Conduttori attivi della linea che entra nel nodo (trattini dello schema unifilare) */
  conductors: number;
  /** Fase della fornitura per i circuiti monofase in un impianto trifase */
  phase?: string;
  /** Nome del quadro, se il dispositivo apre un quadro diverso da quello a monte */
  panelStart?: string;
  depth: number;
  x: number;
  y: number;
}

export interface SingleLine {
  root: SLNode;
  nodes: SLNode[];
  /** Componenti non collegati alla fornitura (mostrati a parte) */
  orphans: ComponentInstance[];
  width: number;
  height: number;
  threePhase: boolean;
}

export const SL = {
  colW: 150,
  rowH: 130,
  marginX: 60,
  marginTop: 40,
  symbolH: 64,
  loadH: 90,
};

const railKey = (c: ComponentInstance) => (c.rail ? c.rail.row * 1000 + c.rail.slot : 1e6 + c.position.x);

export function buildSingleLine(project: Project): SingleLine | null {
  const supply = project.components.find((c) => c.params.kind === 'supply');
  if (!supply || supply.params.kind !== 'supply') return null;
  const g = buildNetGraph(project);
  const threePhase = supply.params.p.phases === 3;

  const root: SLNode = { id: supply.id, kind: 'supply', comp: supply, children: [], conductors: threePhase ? 4 : 2, depth: 0, x: 0, y: 0 };
  const byId = new Map<string, SLNode>([[supply.id, root]]);
  const orphans: ComponentInstance[] = [];
  const parentOf = new Map<string, string>();

  // Dispositivi di manovra alimentati dalla fornitura.
  const devices = project.components.filter((c) => isSwitchingDevice(c.params.kind)).sort((a, b) => railKey(a) - railKey(b));
  for (const d of devices) {
    const poles = getPoles(d);
    const lPole = poles.find((p) => p.fn === 'L');
    const inNet = lPole ? g.netOf(terminalId(d.id, lPole.inKey)) : null;
    if (!inNet || phaseOfNet(g, inNet) === null) {
      orphans.push(d);
      continue;
    }
    const chain = seriesDevices(g, inNet, 'L');
    parentOf.set(d.id, chain[chain.length - 1] ?? supply.id);
    const ph = phaseOfNet(g, inNet);
    const lCount = poles.filter((p) => p.fn === 'L').length;
    byId.set(d.id, {
      id: d.id,
      kind: 'device',
      comp: d,
      children: [],
      conductors: poles.length,
      ...(threePhase && lCount === 1 ? { phase: `L${ph}` } : {}),
      depth: 0,
      x: 0,
      y: 0,
    });
  }

  // Utilizzatori.
  const circuits = analyzeCircuits(project, g);
  const loads = project.components.filter((c) => c.params.kind === 'load').sort((a, b) => a.position.x - b.position.x);
  for (const l of loads) {
    const info = circuits.find((c) => c.loadId === l.id);
    if (!info || info.phases.every((p) => p === null)) {
      orphans.push(l);
      continue;
    }
    const keys = loadPhaseKeys(l);
    parentOf.set(l.id, info.lDevices[info.lDevices.length - 1] ?? supply.id);
    byId.set(l.id, {
      id: l.id,
      kind: 'load',
      comp: l,
      children: [],
      conductors: keys.length + (loadHasNeutral(l) ? 1 : 0),
      ...(threePhase && keys.length === 1 && info.phases[0] ? { phase: `L${info.phases[0]}` } : {}),
      depth: 0,
      x: 0,
      y: 0,
    });
  }

  for (const [child, parent] of parentOf) {
    const p = byId.get(parent) ?? root;
    p.children.push(byId.get(child)!);
  }
  // Prima i dispositivi (in ordine di guida), poi gli utilizzatori diretti.
  const order = (n: SLNode) => (n.kind === 'device' ? railKey(n.comp) : 1e7 + n.comp.position.x);
  const sortRec = (n: SLNode) => {
    n.children.sort((a, b) => order(a) - order(b));
    n.children.forEach(sortRec);
  };
  sortRec(root);

  // Inizio di un quadro diverso da quello del dispositivo a monte.
  if (project.panels.length > 1) {
    const panelId = (n: SLNode) => (n.comp.rail ? panelOf(project, n.comp.rail.panelId).id : null);
    const mark = (n: SLNode, upstream: string) => {
      const own = n.kind === 'device' ? panelId(n) : null;
      if (own && own !== upstream) n.panelStart = panelOf(project, own).name;
      n.children.forEach((c) => mark(c, own ?? upstream));
    };
    mark(root, project.panels[0]!.id);
  }

  // Profondità; gli utilizzatori sono allineati sull'ultima riga.
  let maxDeviceDepth = 0;
  const setDepth = (n: SLNode, d: number) => {
    n.depth = d;
    if (n.kind !== 'load') maxDeviceDepth = Math.max(maxDeviceDepth, d);
    n.children.forEach((c) => setDepth(c, d + 1));
  };
  setDepth(root, 0);
  const nodes: SLNode[] = [];
  const collect = (n: SLNode) => {
    nodes.push(n);
    n.children.forEach(collect);
  };
  collect(root);
  for (const n of nodes) if (n.kind === 'load') n.depth = maxDeviceDepth + 1;

  // x: una colonna per ogni foglia; i nodi interni al centro dei figli.
  let leaf = 0;
  const place = (n: SLNode) => {
    if (!n.children.length) {
      n.x = SL.marginX + leaf * SL.colW + SL.colW / 2;
      leaf += 1;
    } else {
      n.children.forEach(place);
      n.x = (n.children[0]!.x + n.children[n.children.length - 1]!.x) / 2;
    }
    n.y = SL.marginTop + n.depth * SL.rowH;
  };
  place(root);

  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  return {
    root,
    nodes,
    orphans,
    width: SL.marginX * 2 + Math.max(1, leaf) * SL.colW,
    height: SL.marginTop + maxDepth * SL.rowH + SL.loadH + 90,
    threePhase,
  };
}
