import { UnionFind } from '../graph/unionFind';
import { getPoles, isThreePhaseLoad, loadHasNeutral, loadMainPhaseKey, terminalId } from '../model/terminals';
import type { ComponentInstance, Project } from '../model/types';
import { abs, add, C, sub, type Complex, ZERO } from './complex';
import { solveNodal } from './mna';
import { buildNetlist, innerNode } from './netlist';
import { simulate, type SimResult } from './simulate';
import { arrayOperatingPoint, pvEnv } from './pv';

/**
 * Misura di resistenza tra due morsetti con l'impianto disalimentato e scollegato dalla rete:
 * il multimetro inietta una corrente nota (1 A nel modello) e legge la tensione risultante.
 * Comprende carichi accesi, conduttori, contatti chiusi, guasti attivi e dispersore.
 * Restituisce Infinity per circuito aperto ("OL").
 */
export function resistanceBetween(project: Project, a: string, b: string): number {
  const net = buildNetlist(project, { noSource: true });
  const na = net.terminalNode.get(a) ?? a;
  const nb = net.terminalNode.get(b) ?? b;
  if (na === nb) return 0;
  const uf = new UnionFind();
  for (const e of net.elements) uf.union(e.a, e.b);
  if (!uf.same(na, nb)) return Infinity;
  const active = net.elements.filter((e) => uf.same(e.a, nb));
  const nodes = new Set<string>();
  for (const e of active) {
    nodes.add(e.a);
    nodes.add(e.b);
  }
  const V = solveNodal(
    [...nodes],
    nb,
    active.map((e) => ({ a: e.a, b: e.b, z: e.z })),
    [{ node: na, i: C(1) }],
  );
  return abs(V.get(na) ?? ZERO);
}

/**
 * Corrente di cortocircuito presunta tra due punti: guasto franco (1 mΩ) con tutte le
 * protezioni chiuse, utilizzatori spenti e nessun altro guasto.
 * Restituisce null se i punti non sono alimentati.
 */
export function prospectiveShortCircuit(project: Project, a: string, b: string): number | null {
  const r = simulate(project, {
    extra: [{ a, b, r: 0.001 }],
    closed: () => true,
    loadsOff: true,
    noGeneration: true,
    ignoreFaults: true,
  });
  if (!r.ok) return null;
  const i = r.extraI[0];
  return i && abs(i) > 1e-3 ? abs(i) : null;
}

/**
 * Icc presunta massima ai morsetti di uscita di un dispositivo: guasto L-N se c'è il polo di neutro
 * e, per i dispositivi con tre poli di fase, guasto trifase simmetrico (in genere il valore massimo).
 */
export function deviceShortCircuit(project: Project, c: ComponentInstance): number | null {
  const poles = getPoles(c);
  const ls = poles.filter((p) => p.fn === 'L');
  const n = poles.find((p) => p.fn === 'N');
  const values: number[] = [];
  if (ls[0] && n) {
    const v = prospectiveShortCircuit(project, terminalId(c.id, ls[0].outKey), terminalId(c.id, n.outKey));
    if (v !== null) values.push(v);
  }
  if (ls.length === 3) {
    const out = ls.map((p) => terminalId(c.id, p.outKey));
    const r = simulate(project, {
      extra: [
        { a: out[0]!, b: out[1]!, r: 0.001 },
        { a: out[1]!, b: out[2]!, r: 0.001 },
      ],
      closed: () => true,
      loadsOff: true,
    noGeneration: true,
      ignoreFaults: true,
    });
    if (r.ok) {
      const ik3 = Math.max(...r.supply.phases.map((p) => p.i));
      if (ik3 > 1e-3) values.push(ik3);
    }
  }
  return values.length ? Math.max(...values) : null;
}

/**
 * Correnti di guasto presunte a fondo linea: L-N (se c'è il neutro), L1-L2 (trifase) e guasto franco L-PE.
 * "ln" è la minima tra le correnti di cortocircuito tra conduttori attivi calcolate.
 */
export function loadEndFaultCurrents(project: Project, loadId: string): { ln: number | null; ll: number | null; lpe: number | null } {
  const c = project.components.find((x) => x.id === loadId);
  if (!c) return { ln: null, ll: null, lpe: null };
  const main = loadMainPhaseKey(c);
  const lnN = loadHasNeutral(c) ? prospectiveShortCircuit(project, innerNode(loadId, main), innerNode(loadId, 'N')) : null;
  const ll = isThreePhaseLoad(c) ? prospectiveShortCircuit(project, innerNode(loadId, 'L1'), innerNode(loadId, 'L2')) : null;
  const candidates = [lnN, ll].filter((x): x is number => x !== null);
  return {
    ln: candidates.length ? Math.min(...candidates) : null,
    ll,
    lpe: prospectiveShortCircuit(project, innerNode(loadId, main), innerNode(loadId, 'PE')),
  };
}

/**
 * Lettura della pinza amperometrica.
 * - su un conduttore: corrente in quel conduttore
 * - su una linea (L+N insieme): somma vettoriale = corrente di dispersione
 */
export function clampReading(result: SimResult, target: { kind: 'wire' | 'line'; id: string }): number {
  if (!result.ok) return 0;
  if (target.kind === 'wire') {
    const i = result.wireI.get(target.id);
    return i ? abs(i) : 0;
  }
  const c = result.cableI.get(target.id);
  if (!c) return 0;
  // Pinza che abbraccia tutti i conduttori attivi della linea (fasi + neutro), escluso il PE.
  const sum = (['L', 'L1', 'L2', 'L3', 'N'] as const).reduce<Complex>((acc, k) => add(acc, c[k] ?? ZERO), ZERO);
  return abs(sum);
}

/** Tensione AC tra due morsetti; null se uno dei due è a potenziale indeterminato. */
export function voltageBetween(result: SimResult, a: string, b: string): number | null {
  if (!result.ok) return null;
  const va = result.terminalV.get(a);
  const vb = result.terminalV.get(b);
  if (!va || !vb) return null;
  return abs(sub(va as Complex, vb as Complex));
}

/**
 * Tensione continua tra due morsetti del lato DC del fotovoltaico (puntale rosso − puntale nero) [V].
 * I moduli generano tensione con la luce anche a impianto spento: a vuoto si legge la Voc, con l'inverter
 * in produzione la tensione del punto di lavoro. null se i puntali non sono ai capi di un generatore.
 */
export function dcVoltageBetween(project: Project, a: string, b: string, result: SimResult | null): number | null {
  const uf = new UnionFind();
  for (const w of project.wires) uf.union(w.from, w.to);
  for (const c of project.components) {
    if (c.params.kind === 'dc-switch' && c.closed) {
      uf.union(terminalId(c.id, 'p0_in'), terminalId(c.id, 'p0_out'));
      uf.union(terminalId(c.id, 'p1_in'), terminalId(c.id, 'p1_out'));
    }
  }
  if (uf.same(a, b)) return 0;
  const env = pvEnv(project.pv);
  for (const c of project.components) {
    if (c.params.kind !== 'pv-array') continue;
    const op = arrayOperatingPoint(c.params.p, env.irradiance, env.ambientC);
    const live = result && result.ok ? result.pvArrays.get(c.id) : undefined;
    const v = live && live.pOut > 1 ? live.vmp : op.voc;
    const plus = terminalId(c.id, 'DC+');
    const minus = terminalId(c.id, 'DC-');
    if (uf.same(a, plus) && uf.same(b, minus)) return v;
    if (uf.same(a, minus) && uf.same(b, plus)) return -v;
  }
  // Alimentatori: tensione di uscita se l'ingresso è alimentato (sovraccarico: tensione ridotta in proporzione, stima).
  for (const c of project.components) {
    if (c.params.kind !== 'psu' || !result || !result.ok) continue;
    const vl = result.terminalV.get(terminalId(c.id, 'L'));
    const vn = result.terminalV.get(terminalId(c.id, 'N'));
    if (!vl || !vn || abs(sub(vl, vn)) < 85) continue;
    const p = c.params.p;
    const v = p.loadW > p.pmaxW ? p.vout * (p.pmaxW / p.loadW) : p.vout;
    const plus = terminalId(c.id, 'V+');
    const minus = terminalId(c.id, 'V-');
    if (uf.same(a, plus) && uf.same(b, minus)) return v;
    if (uf.same(a, minus) && uf.same(b, plus)) return -v;
  }
  return null;
}
