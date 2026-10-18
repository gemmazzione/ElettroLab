import { getPoles, getTerminals, isResidualDevice, isSwitchingDevice, loadHasNeutral, loadPhaseKeys, supplyPhaseKeys, terminalId } from '../model/terminals';
import type { ComponentInstance, Phase, Project, TerminalFunction } from '../model/types';
import { UnionFind } from './unionFind';

/**
 * Grafo statico delle connessioni.
 * Una "rete" è un insieme di morsetti uniti da conduttori o morsettiere, indipendentemente
 * dallo stato dei contatti. I poli dei dispositivi di manovra sono archi tra la rete di
 * ingresso e quella di uscita: permettono di ricostruire a monte il percorso di ogni linea.
 */

export interface PoleEdge {
  deviceId: string;
  pole: number;
  fn: TerminalFunction;
  netIn: string;
  netOut: string;
}

export interface NetGraph {
  netOf: (terminalId: string) => string;
  poleEdges: PoleEdge[];
  supply: ComponentInstance | null;
  /** Reti del punto di fornitura: L = prima fase (L o L1), N = neutro */
  supplyNet: Partial<Record<'L' | 'N', string>>;
  /** Reti di tutte le fasi della fornitura (1 in monofase, 3 in trifase) */
  supplyPhaseNets: { net: string; phase: Phase }[];
  earthNets: Set<string>;
  /** Distanza (in numero di poli attraversati) di ogni rete dal punto di fornitura */
  distance: Map<string, number>;
}

export function buildNetGraph(project: Project): NetGraph {
  const uf = new UnionFind();
  for (const c of project.components) {
    const ts = getTerminals(c);
    for (const t of ts) uf.find(t.id);
    if (c.params.kind === 'bar') for (let i = 1; i < ts.length; i++) uf.union(ts[0]!.id, ts[i]!.id);
  }
  for (const w of project.wires) uf.union(w.from, w.to);
  const netOf = (tid: string) => uf.find(tid);

  const poleEdges: PoleEdge[] = [];
  for (const c of project.components) {
    if (!isSwitchingDevice(c.params.kind)) continue;
    for (const p of getPoles(c)) {
      poleEdges.push({
        deviceId: c.id,
        pole: p.index,
        fn: p.fn,
        netIn: netOf(terminalId(c.id, p.inKey)),
        netOut: netOf(terminalId(c.id, p.outKey)),
      });
    }
  }

  const supply = project.components.find((c) => c.params.kind === 'supply') ?? null;
  const supplyNet: NetGraph['supplyNet'] = {};
  const supplyPhaseNets: NetGraph['supplyPhaseNets'] = [];
  if (supply) {
    for (const { key, phase } of supplyPhaseKeys(supply)) supplyPhaseNets.push({ net: netOf(terminalId(supply.id, key)), phase });
    supplyNet.L = supplyPhaseNets[0]!.net;
    supplyNet.N = netOf(terminalId(supply.id, 'N'));
  }
  const earthNets = new Set<string>();
  for (const c of project.components) if (c.params.kind === 'earth') earthNets.add(netOf(terminalId(c.id, 'PE')));

  const distance = new Map<string, number>();
  const queue: string[] = [];
  for (const n of [...supplyPhaseNets.map((x) => x.net), supplyNet.N]) {
    if (n && !distance.has(n)) {
      distance.set(n, 0);
      queue.push(n);
    }
  }
  while (queue.length) {
    const n = queue.shift()!;
    const d = distance.get(n)!;
    for (const e of poleEdges) {
      const other = e.netIn === n ? e.netOut : e.netOut === n ? e.netIn : null;
      if (other && !distance.has(other)) {
        distance.set(other, d + 1);
        queue.push(other);
      }
    }
  }

  return { netOf, poleEdges, supply, supplyNet, supplyPhaseNets, earthNets, distance };
}

/** Fase della fornitura a cui una rete è collegata attraverso i poli dei dispositivi (null se nessuna). */
export function phaseOfNet(g: NetGraph, net: string, excludeDevice?: string): Phase | null {
  for (const { net: target, phase } of g.supplyPhaseNets) if (netsConnected(g, net, target, excludeDevice)) return phase;
  return null;
}

/** Fase della fornitura raggiunta da un morsetto, risalendo il circuito (null se non collegato). */
export function tracePhase(project: Project, tid: string): Phase | null {
  const g = buildNetGraph(project);
  return phaseOfNet(g, g.netOf(tid));
}

/** Le due reti sono collegate attraverso i poli dei dispositivi (escludendo eventualmente un dispositivo)? */
export function netsConnected(g: NetGraph, from: string, to: string, excludeDevice?: string): boolean {
  if (from === to) return true;
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of g.poleEdges) {
      if (e.deviceId === excludeDevice) continue;
      const other = e.netIn === n ? e.netOut : e.netOut === n ? e.netIn : null;
      if (!other || seen.has(other)) continue;
      if (other === to) return true;
      seen.add(other);
      stack.push(other);
    }
  }
  return false;
}

/**
 * Dispositivi attraversati obbligatoriamente da una linea per raggiungere la fornitura:
 * un dispositivo è "in serie" se, escludendolo, la rete non è più collegata alla sorgente.
 * Ordinati da monte (fornitura) verso valle.
 */
export function seriesDevices(g: NetGraph, net: string, fn: 'L' | 'N'): string[] {
  const phase = fn === 'L' ? phaseOfNet(g, net) : null;
  const target = fn === 'L' ? g.supplyPhaseNets.find((x) => x.phase === phase)?.net : g.supplyNet.N;
  if (!target || !netsConnected(g, net, target)) return [];
  const candidates = [...new Set(g.poleEdges.map((e) => e.deviceId))];
  const series = candidates.filter((d) => !netsConnected(g, net, target, d));
  const depth = (d: string) =>
    Math.min(...g.poleEdges.filter((e) => e.deviceId === d).map((e) => Math.min(g.distance.get(e.netIn) ?? 1e9, g.distance.get(e.netOut) ?? 1e9)));
  return series.sort((a, b) => depth(a) - depth(b));
}

export interface CircuitInfo {
  loadId: string;
  lConnected: boolean;
  nConnected: boolean;
  peConnected: boolean;
  lDevices: string[];
  nDevices: string[];
  /** Fase della fornitura a cui è collegato ciascun conduttore di fase dell'utilizzatore */
  phases: (Phase | null)[];
  threePhase: boolean;
  hasNeutral: boolean;
}

export function analyzeCircuits(project: Project, g: NetGraph = buildNetGraph(project)): CircuitInfo[] {
  const out: CircuitInfo[] = [];
  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const keys = loadPhaseKeys(c);
    const hasNeutral = loadHasNeutral(c);
    const lNet = g.netOf(terminalId(c.id, keys[0]!));
    const nNet = hasNeutral ? g.netOf(terminalId(c.id, 'N')) : null;
    const peNet = g.netOf(terminalId(c.id, 'PE'));
    const phases = keys.map((k) => phaseOfNet(g, g.netOf(terminalId(c.id, k))));
    out.push({
      loadId: c.id,
      lConnected: phases.every((p) => p !== null),
      nConnected: nNet === null ? true : !!g.supplyNet.N && netsConnected(g, nNet, g.supplyNet.N),
      peConnected: g.earthNets.has(peNet),
      lDevices: seriesDevices(g, lNet, 'L'),
      nDevices: nNet === null ? [] : seriesDevices(g, nNet, 'N'),
      phases,
      threePhase: keys.length === 3,
      hasNeutral,
    });
  }
  return out;
}

export function residualDevicesIn(project: Project, ids: string[]): string[] {
  return ids.filter((id) => {
    const c = project.components.find((x) => x.id === id);
    return !!c && isResidualDevice(c.params.kind);
  });
}
