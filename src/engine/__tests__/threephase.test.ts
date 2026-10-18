import { describe, expect, it } from 'vitest';
import { checkWiring } from '../../graph/erc';
import { CONTACT_RESISTANCE } from '../../model/constants';
import { ProjectBuilder, t } from '../../projects/demos';
import { advance } from '../../protection/stepper';
import { abs, add, C, div, polar, sub, type Complex, ZERO } from '../complex';
import { deviceShortCircuit, prospectiveShortCircuit } from '../measure';
import { wireResistance } from '../netlist';
import { simulate } from '../simulate';

/** Fornitura trifase → 3P+N → tre carichi monofase su L1, L2, L3 con neutro comune (morsettiera). */
function unbalanced(powers: [number, number, number]) {
  const b = new ProjectBuilder('trifase', 2, 12);
  const cnt = b.add('supply-tri', { position: { x: 0, y: 0 } });
  const q = b.add('mcb-3pn', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = true));
  const xn = b.add('bar-n-8', { rail: { row: 1, slot: 0 } });
  const e = b.add('earth', { position: { x: 0, y: 300 } });
  const loads = powers.map((p, k) =>
    b.add('load-generico', { position: { x: k * 200, y: 700 } }, (c) => {
      if (c.params.kind === 'load') c.params.p = { ...c.params.p, name: `Carico L${k + 1}`, powerW: p, cableLength: 0.1, cableSection: 2.5 };
    }),
  );
  const L = 0.01;
  b.wire(t(cnt, 'L1'), t(q, 'p0_in'), 16, L)
    .wire(t(cnt, 'L2'), t(q, 'p1_in'), 16, L)
    .wire(t(cnt, 'L3'), t(q, 'p2_in'), 16, L)
    .wire(t(cnt, 'N'), t(q, 'p3_in'), 16, L)
    .wire(t(q, 'p3_out'), t(xn, 't0'), 16, L);
  loads.forEach((u, k) => {
    b.wire(t(q, `p${k}_out`), t(u, 'L'), 2.5, L).wire(t(xn, `t${k + 1}`), t(u, 'N'), 2.5, L).wire(t(e, 'PE'), t(u, 'PE'), 2.5, L);
  });
  return { project: b.project, cnt, q, xn, loads };
}

describe('rete trifase', () => {
  it('tensioni concatenate pari a √3 volte quelle di fase', () => {
    const { project } = unbalanced([0, 0, 0]);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.supply.phases).toHaveLength(3);
    for (const u of r.supply.lineV) expect(u).toBeCloseTo(230 * Math.sqrt(3), 6);
  });

  it('i nuovi conduttori di fase vengono identificati con la fase reale', () => {
    const { project, loads } = unbalanced([1000, 1000, 1000]);
    const w = project.wires.find((x) => x.to === t(loads[2]!, 'L'))!;
    expect(w.conductor).toBe('L3');
    expect(checkWiring(project).some((i) => i.code === 'PHASE_ID')).toBe(false);
    w.conductor = 'L1';
    expect(checkWiring(project).some((i) => i.code === 'PHASE_ID')).toBe(true);
  });

  it('carichi equilibrati: corrente di neutro nulla', () => {
    const { project } = unbalanced([2000, 2000, 2000]);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.supply.iN).toBeLessThan(1e-6);
    const [a, b2, c] = r.supply.phases.map((p) => p.i);
    expect(a).toBeCloseTo(b2!, 9);
    expect(b2).toBeCloseTo(c!, 9);
  });

  it('carichi squilibrati: il neutro porta la somma vettoriale delle correnti di fase', () => {
    const { project } = unbalanced([3000, 1000, 300]);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    const sum = r.supply.phases.reduce<Complex>((acc, p) => add(acc, p.iC), ZERO);
    expect(r.supply.iN).toBeCloseTo(abs(sum), 6);
    expect(r.supply.iN).toBeGreaterThan(5);
  });

  it('neutro comune interrotto: spostamento del centro stella secondo Millman', () => {
    const powers: [number, number, number] = [3000, 1000, 300];
    const { project, q, xn } = unbalanced(powers);
    const nWire = project.wires.find((w) => w.from === t(q, 'p3_out') && w.to === t(xn, 't0'))!;
    project.faults = [{ id: 'nbreak', type: 'open-wire', targetId: nWire.id, resistance: 0 }];
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);

    // Impedenza di ogni ramo: rete (fase) + conduttori + contatto + linea (andata e ritorno) + carico.
    const supply = project.components.find((c) => c.params.kind === 'supply')!;
    if (supply.params.kind !== 'supply') throw new Error();
    const zHalf = C(supply.params.p.rNetwork / 2, supply.params.p.xNetwork / 2);
    const rLoad = powers.map((p) => (230 * 230) / p);
    const rSeries = wireResistance(0.01, 16) + CONTACT_RESISTANCE + wireResistance(0.01, 2.5) + 2 * wireResistance(0.1, 2.5) + wireResistance(0.01, 2.5);
    const Z = rLoad.map((rl) => add(zHalf, C(rSeries + rl)));
    const E = [polar(230, 0), polar(230, -120), polar(230, 120)];
    let num: Complex = ZERO;
    let den: Complex = ZERO;
    for (let k = 0; k < 3; k++) {
      num = add(num, div(E[k]!, Z[k]!));
      den = add(den, div(C(1), Z[k]!));
    }
    const vStar = div(num, den);
    const expectedV = [0, 1, 2].map((k) => abs(div(sub(E[k]!, vStar), Z[k]!)) * rLoad[k]!);

    project.components
      .filter((c) => c.params.kind === 'load')
      .forEach((c, k) => {
        expect(r.loads.get(c.id)!.v).toBeCloseTo(expectedV[k]!, 6);
      });
    // Il carico più piccolo (fase meno caricata) riceve una tensione ben superiore a 230 V.
    expect(expectedV[2]!).toBeGreaterThan(300);
    expect(expectedV[0]!).toBeLessThan(150);
  });

  it('Icc presunta: il guasto trifase simmetrico supera il guasto fase-neutro', () => {
    const { project, q } = unbalanced([0, 0, 0]);
    const ik = deviceShortCircuit(project, q)!;
    const ln = prospectiveShortCircuit(project, t(q, 'p0_out'), t(q, 'p3_out'))!;
    expect(ik).toBeGreaterThan(ln * 1.5);
    // un 3P senza neutro ora ha una Icc calcolabile
    const b = new ProjectBuilder('3p', 1, 12);
    const cnt = b.add('supply-tri', { position: { x: 0, y: 0 } });
    const q3 = b.add('mcb-3p', { rail: { row: 0, slot: 0 } });
    for (const k of [1, 2, 3]) b.wire(t(cnt, `L${k}`), t(q3, `p${k - 1}_in`), 6, 1);
    expect(deviceShortCircuit(b.project, q3)).toBeGreaterThan(100);
  });

  it('carico trifase equilibrato senza neutro: correnti uguali, P = 3·V²/R', () => {
    const b = new ProjectBuilder('3f', 1, 12);
    const cnt = b.add('supply-tri', { position: { x: 0, y: 0 } });
    const q = b.add('mcb-3p', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = true));
    const e = b.add('earth', { position: { x: 0, y: 300 } });
    const u = b.add('load-tri', { position: { x: 0, y: 600 } });
    for (const k of [1, 2, 3]) b.wire(t(cnt, `L${k}`), t(q, `p${k - 1}_in`), 6, 1).wire(t(q, `p${k - 1}_out`), t(u, `L${k}`), 2.5, 1);
    b.wire(t(e, 'PE'), t(u, 'PE'), 2.5, 1);
    const r = simulate(b.project);
    if (!r.ok) throw new Error(r.reason);
    const lr = r.loads.get(u.id)!;
    expect(lr.phaseI).toHaveLength(3);
    expect(lr.phaseI![0]).toBeCloseTo(lr.phaseI![1]!, 9);
    expect(lr.phaseI![0]).toBeGreaterThan(8.5); // ~ 6000 / 690
    expect(lr.phaseI![0]).toBeLessThan(8.7);
    expect(r.supply.iN).toBeLessThan(1e-6);
    // il centro stella senza neutro resta al potenziale del neutro (carico equilibrato)
    expect(abs(lr.vN!)).toBeLessThan(1);

    // cortocircuito L1-L2: intervento magnetico del 3P
    b.project.faults = [{ id: 'll', type: 'short-LL', targetId: u.id, resistance: 0 }];
    const out = advance(b.project, {}, null, 0.5, 'settle');
    expect(out.prot[q.id]?.tripped).toBe('magnetico');
  });
});
