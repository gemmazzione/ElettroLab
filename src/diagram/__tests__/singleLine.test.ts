import { describe, expect, it } from 'vitest';
import { appartamento, monolocale, trifase } from '../../projects/demos';
import { buildSingleLine, type SLNode } from '../singleLine';

const labelTree = (n: SLNode): unknown => (n.children.length ? { [n.comp.label]: n.children.map(labelTree) } : n.comp.label);

describe('schema unifilare', () => {
  it('monolocale: contatore → Q1 → Q2 → tre circuiti', () => {
    const sl = buildSingleLine(monolocale())!;
    expect(labelTree(sl.root)).toEqual({ CNT1: [{ Q1: [{ Q2: [{ Q3: ['U1'] }, { Q4: ['U2'] }, { Q5: ['U3'] }] }] }] });
    expect(sl.orphans).toEqual([]);
    // tutti gli utilizzatori sull'ultima riga, sotto il proprio dispositivo
    const loads = sl.nodes.filter((n) => n.kind === 'load');
    expect(new Set(loads.map((n) => n.y)).size).toBe(1);
    const q3 = sl.nodes.find((n) => n.comp.label === 'Q3')!;
    expect(q3.children[0]!.x).toBe(q3.x);
  });

  it('appartamento: due gruppi differenziali in parallelo sotto il generale', () => {
    const sl = buildSingleLine(appartamento())!;
    const q1 = sl.root.children[0]!;
    expect(q1.comp.label).toBe('Q1');
    expect(q1.children.map((c) => c.comp.label)).toEqual(['Q2', 'Q6']);
    expect(q1.children[1]!.children.map((c) => c.comp.label)).toEqual(['Q7', 'Q8']);
  });

  it('trifase: fasi dei circuiti monofase e conduttori delle linee', () => {
    const sl = buildSingleLine(trifase())!;
    expect(sl.threePhase).toBe(true);
    const q2 = sl.nodes.find((n) => n.comp.label === 'Q2')!;
    expect(q2.conductors).toBe(4);
    expect(q2.children.map((c) => `${c.comp.label}${c.phase ?? ''}`)).toEqual(['Q3L1', 'Q4L2', 'Q5L3', 'Q6']);
    const tri = sl.nodes.find((n) => n.kind === 'load' && n.comp.params.kind === 'load' && n.comp.params.p.phases === 3)!;
    expect(tri.conductors).toBe(3);
  });

  it('lo schema segue i collegamenti: spostando un circuito cambia il padre', () => {
    const p = monolocale();
    const q2 = p.components.find((c) => c.label === 'Q2')!;
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    const q5 = p.components.find((c) => c.label === 'Q5')!;
    // Q5 alimentato direttamente dal generale (scavalcando il differenziale)
    p.wires = p.wires.filter((w) => w.to !== `${q5.id}:p0_in` && w.to !== `${q5.id}:p1_in`);
    p.wires.push({ ...p.wires[0]!, id: 'x1', from: `${q1.id}:p0_out`, to: `${q5.id}:p0_in` });
    p.wires.push({ ...p.wires[0]!, id: 'x2', from: `${q1.id}:p1_out`, to: `${q5.id}:p1_in`, conductor: 'N', color: 'blu' });
    const sl = buildSingleLine(p)!;
    const n1 = sl.nodes.find((n) => n.id === q1.id)!;
    expect(n1.children.map((c) => c.comp.label)).toEqual(['Q2', 'Q5']);
    expect(sl.nodes.find((n) => n.id === q2.id)!.children.map((c) => c.comp.label)).toEqual(['Q3', 'Q4']);
  });
});
