import { UnionFind } from '../graph/unionFind';
import { wireResistance } from './netlist';
import type { ComponentInstance, Project } from '../model/types';

/**
 * Lato in corrente continua del fotovoltaico: collegamenti tra generatori e inverter.
 * Non fa parte dell'analisi in alternata: si ricostruiscono le reti dei morsetti (conduttori e sezionatori DC chiusi)
 * e si controlla che il + dei moduli arrivi al + dell'inverter e il − al −.
 */

export interface DcLink {
  /** Generatori collegati correttamente all'inverter */
  arrays: ComponentInstance[];
  /** Generatori collegati con + e − scambiati */
  reversed: ComponentInstance[];
  /** + e − dell'inverter nella stessa rete (cortocircuito del lato DC) */
  shorted: boolean;
  /** Resistenza dei conduttori DC del circuito (andata + ritorno) [Ω], somma dei tratti delle due reti */
  rLoop: number;
  /** Sezionatori DC attraversati */
  switches: ComponentInstance[];
}

const tid = (c: ComponentInstance, key: string) => `${c.id}:${key}`;

function dcNets(project: Project, closed: (c: ComponentInstance) => boolean): UnionFind {
  const uf = new UnionFind();
  for (const w of project.wires) uf.union(w.from, w.to);
  for (const c of project.components) {
    if (c.params.kind === 'dc-switch' && closed(c)) {
      uf.union(tid(c, 'p0_in'), tid(c, 'p0_out'));
      uf.union(tid(c, 'p1_in'), tid(c, 'p1_out'));
    }
  }
  return uf;
}

export function inverterDcLink(project: Project, inv: ComponentInstance, closed: (c: ComponentInstance) => boolean = (c) => c.closed): DcLink {
  const uf = dcNets(project, closed);
  const plus = tid(inv, 'DC+');
  const minus = tid(inv, 'DC-');
  const arrays: ComponentInstance[] = [];
  const reversed: ComponentInstance[] = [];
  for (const a of project.components) {
    if (a.params.kind !== 'pv-array') continue;
    const ap = tid(a, 'DC+');
    const am = tid(a, 'DC-');
    if (uf.same(ap, plus) && uf.same(am, minus)) arrays.push(a);
    else if (uf.same(ap, minus) && uf.same(am, plus)) reversed.push(a);
  }
  const shorted = uf.same(plus, minus);
  let rLoop = 0;
  for (const w of project.wires) {
    if (w.comb) continue;
    const inPlus = uf.same(w.from, plus);
    const inMinus = uf.same(w.from, minus);
    if (inPlus || inMinus) rLoop += wireResistance(w.length, w.section);
  }
  const switches = project.components.filter(
    (c) => c.params.kind === 'dc-switch' && (uf.same(tid(c, 'p0_in'), plus) || uf.same(tid(c, 'p0_out'), plus)),
  );
  return { arrays, reversed, shorted, rLoop, switches };
}

/** Inverter a cui è collegato un generatore (null se nessuno). */
export function arrayInverter(project: Project, arr: ComponentInstance): ComponentInstance | null {
  for (const c of project.components) {
    if (c.params.kind !== 'inverter') continue;
    const link = inverterDcLink(project, c);
    if (link.arrays.includes(arr) || link.reversed.includes(arr)) return c;
  }
  return null;
}
