import { describe, expect, it } from 'vitest';
import { CONTACT_RESISTANCE } from '../../model/constants';
import { DEMO_PROJECTS, ProjectBuilder, t } from '../../projects/demos';
import { wireResistance } from '../netlist';
import { simulate } from '../simulate';

/** Fornitura → magnetotermico 1P+N → carico 2300 W, con PE. */
function singleCircuit(closed = true) {
  const b = new ProjectBuilder('test', 1, 12);
  const cnt = b.add('supply-mono', { position: { x: 0, y: 0 } });
  const q = b.add('mcb-1pn', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = closed));
  const u = b.add('load-generico', { position: { x: 0, y: 500 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, powerW: 2300, cableLength: 20, cableSection: 2.5 };
  });
  const e = b.add('earth', { position: { x: 0, y: 300 } });
  b.wire(t(cnt, 'L'), t(q, 'p0_in'), 6, 5)
    .wire(t(cnt, 'N'), t(q, 'p1_in'), 6, 5)
    .wire(t(q, 'p0_out'), t(u, 'L'), 2.5, 1)
    .wire(t(q, 'p1_out'), t(u, 'N'), 2.5, 1)
    .wire(t(e, 'PE'), t(u, 'PE'), 2.5, 1);
  return { project: b.project, cnt, q, u };
}

describe('circuito monofase', () => {
  it('calcola corrente, tensione e potenza coerenti con la legge di Ohm', () => {
    const { project, u, q } = singleCircuit(true);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);

    // Calcolo a mano: impedenza serie dell'anello di guasto/di esercizio.
    const rLoad = (230 * 230) / 2300;
    const rSeries =
      0.25 + // rete (fase + neutro)
      2 * wireResistance(5, 6) +
      2 * wireResistance(1, 2.5) +
      2 * wireResistance(20, 2.5) +
      2 * CONTACT_RESISTANCE +
      rLoad;
    const zMag = Math.hypot(rSeries, 0.08);
    const iExpected = 230 / zMag;

    const load = r.loads.get(u.id)!;
    expect(load.energized).toBe(true);
    expect(load.i).toBeCloseTo(iExpected, 9);
    expect(load.v).toBeCloseTo(iExpected * rLoad, 9);
    expect(load.p).toBeCloseTo(iExpected * iExpected * rLoad, 6);
    expect(r.supply.i).toBeCloseTo(iExpected, 9);
    expect(load.p).toBeLessThan(2300); // caduta di tensione → potenza minore della targa
    expect(r.residual.size).toBe(0);
    expect(r.alerts.filter((a) => a.severity === 'errore')).toHaveLength(0);

    // La corrente nel polo L e quella nel polo N sono uguali e opposte.
    const [iL, iN] = r.poleI.get(q.id)!;
    expect(iL!.re + iN!.re).toBeCloseTo(0, 9);
    expect(iL!.im + iN!.im).toBeCloseTo(0, 9);
  });

  it('il PE non trasporta corrente in condizioni normali', () => {
    const { project } = singleCircuit(true);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    const peWire = project.wires.find((w) => w.conductor === 'PE')!;
    const i = r.wireI.get(peWire.id)!;
    expect(Math.hypot(i.re, i.im)).toBeLessThan(1e-9);
  });
});

describe('interruttore aperto', () => {
  it('nessuna corrente e carico non alimentato', () => {
    const { project, u, q } = singleCircuit(false);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.supply.i).toBeLessThan(1e-9);
    expect(r.loads.get(u.id)!.energized).toBe(false);
    // Monte del dispositivo in tensione, valle della fase senza tensione verso terra pericolosa.
    const vIn = r.terminalV.get(t(q, 'p0_in'))!;
    expect(Math.hypot(vIn.re, vIn.im)).toBeGreaterThan(200);
    const vOut = r.terminalV.get(t(q, 'p0_out'));
    expect(vOut).toBeNull(); // valle isolata: L e N interrotti → potenziale indeterminato
  });
});

describe('cortocircuito', () => {
  it('rileva un collegamento diretto fase-neutro e stima la corrente dalle impedenze', () => {
    const { project, cnt, q } = singleCircuit(true);
    project.wires.push({ ...project.wires[2]!, id: 'short', from: t(q, 'p0_out'), to: t(q, 'p1_out'), length: 0.1, section: 2.5 });
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.alerts.some((a) => a.code === 'SHORT_CIRCUIT')).toBe(true);
    // Corrente limitata da rete + montante + contatti + ponticello (il carico è in parallelo, trascurabile)
    const rLoop = 0.25 + 2 * wireResistance(5, 6) + 2 * CONTACT_RESISTANCE + wireResistance(0.1, 2.5);
    const iApprox = 230 / Math.hypot(rLoop, 0.08);
    expect(r.supply.i).toBeGreaterThan(iApprox * 0.99);
    expect(r.supply.i).toBeLessThan(iApprox * 1.02);
    expect(cnt).toBeDefined();
  });
});

describe('progetto dimostrativo', () => {
  it('monolocale: con Q1 chiuso luci e prese sono alimentate, il forno spento no', () => {
    const p = DEMO_PROJECTS[0]!.build();
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    const before = simulate(p);
    if (!before.ok) throw new Error(before.reason);
    expect(before.supply.i).toBeLessThan(1e-9);

    q1.closed = true;
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    const loads = p.components.filter((c) => c.params.kind === 'load');
    const luci = loads.find((c) => c.params.kind === 'load' && c.params.p.name === 'Luci')!;
    const forno = loads.find((c) => c.params.kind === 'load' && c.params.p.name === 'Forno')!;
    expect(r.loads.get(luci.id)!.energized).toBe(true);
    // Il forno è spento: i suoi morsetti sono comunque in tensione, ma non assorbe corrente.
    expect(r.loads.get(forno.id)!.energized).toBe(true);
    expect(r.loads.get(forno.id)!.i).toBe(0);
    expect(r.loads.get(forno.id)!.v).toBeGreaterThan(220);
    expect(r.supply.p).toBeGreaterThan(1700);
    expect(r.supply.p).toBeLessThan(1800);
    // Differenziale bilanciato
    const q2 = p.components.find((c) => c.params.kind === 'rcd')!;
    expect(r.residual.get(q2.id)!).toBeLessThan(1e-6);
    expect(r.alerts.filter((a) => a.severity === 'errore')).toHaveLength(0);
  });
});
