import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS, ProjectBuilder, t } from '../../projects/demos';
import { checkWiring } from '../erc';
import { analyzeCircuits } from '../netGraph';

const codes = (p: Parameters<typeof checkWiring>[0]) => checkWiring(p).map((i) => i.code);

/** Due gruppi differenziali con un circuito ciascuno. */
function twoGroups() {
  const b = new ProjectBuilder('erc', 2, 12);
  const cnt = b.add('supply-mono', { position: { x: 0, y: 0 } });
  const e = b.add('earth', { position: { x: 0, y: 300 } });
  const d1 = b.add('rcd-2p', { rail: { row: 0, slot: 0 } });
  const d2 = b.add('rcd-2p', { rail: { row: 0, slot: 2 } });
  const q1 = b.add('mcb-1p', { rail: { row: 0, slot: 4 } });
  const q2 = b.add('mcb-1p', { rail: { row: 0, slot: 5 } });
  const xn1 = b.add('bar-n-8', { rail: { row: 1, slot: 0 } });
  const xn2 = b.add('bar-n-8', { rail: { row: 1, slot: 4 } });
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 8 } });
  const u1 = b.add('load-luce', { position: { x: 0, y: 700 } });
  const u2 = b.add('load-prese', { position: { x: 200, y: 700 } });
  b.wire(t(cnt, 'L'), t(d1, 'p0_in'))
    .wire(t(cnt, 'N'), t(d1, 'p1_in'))
    .wire(t(d1, 'p0_in'), t(d2, 'p0_in'))
    .wire(t(d1, 'p1_in'), t(d2, 'p1_in'))
    .wire(t(d1, 'p0_out'), t(q1, 'p0_in'))
    .wire(t(d2, 'p0_out'), t(q2, 'p0_in'))
    .wire(t(d1, 'p1_out'), t(xn1, 't0'))
    .wire(t(d2, 'p1_out'), t(xn2, 't0'))
    .wire(t(q1, 'p0_out'), t(u1, 'L'))
    .wire(t(xn1, 't1'), t(u1, 'N'))
    .wire(t(q2, 'p0_out'), t(u2, 'L'))
    .wire(t(xn2, 't1'), t(u2, 'N'))
    .wire(t(e, 'PE'), t(xpe, 't0'))
    .wire(t(xpe, 't1'), t(u1, 'PE'))
    .wire(t(xpe, 't2'), t(u2, 'PE'));
  return { project: b.project, d1, d2, q1, xn1, xn2, u1, u2 };
}

describe('verifiche di cablaggio', () => {
  it('il progetto dimostrativo non ha errori', () => {
    const errors = checkWiring(DEMO_PROJECTS[0]!.build()).filter((i) => i.severity === 'errore');
    expect(errors).toEqual([]);
  });

  it('due gruppi differenziali corretti: nessun errore e circuiti ricostruiti', () => {
    const { project, d1, q1, u1 } = twoGroups();
    expect(checkWiring(project).filter((i) => i.severity === 'errore')).toEqual([]);
    const c = analyzeCircuits(project).find((x) => x.loadId === u1.id)!;
    expect(c.lDevices).toEqual([d1.id, q1.id]);
    expect(c.nDevices).toEqual([d1.id]);
  });

  it('neutro del carico preso dal gruppo sbagliato', () => {
    const { project, u1, xn2 } = twoGroups();
    const w = project.wires.find((x) => x.to === t(u1, 'N'))!;
    w.from = t(xn2, 't2');
    expect(codes(project)).toContain('RCD_MISMATCH');
  });

  it('neutri di due differenziali uniti', () => {
    const { project, xn1, xn2 } = twoGroups();
    project.wires.push({ ...project.wires[0]!, id: 'ponte', from: t(xn1, 't5'), to: t(xn2, 't5'), conductor: 'N', color: 'blu' });
    expect(codes(project)).toContain('RCD_SHARED_NEUTRAL');
  });

  it('fase collegata a un morsetto di neutro', () => {
    const { project, q1, u1 } = twoGroups();
    const w = project.wires.find((x) => x.from === t(q1, 'p0_out'))!;
    w.to = t(u1, 'N');
    expect(codes(project)).toContain('L_N_SWAP');
  });

  it('PE interrotto', () => {
    const { project, u2 } = twoGroups();
    project.wires = project.wires.filter((x) => x.to !== t(u2, 'PE'));
    const c = codes(project);
    expect(c).toContain('PE_MISSING');
    expect(c).toContain('UNCONNECTED');
  });

  it('giallo-verde usato come fase', () => {
    const { project, q1 } = twoGroups();
    project.wires.find((x) => x.from === t(q1, 'p0_out'))!.color = 'giallo-verde';
    expect(codes(project)).toContain('COLOR_GY_MISUSE');
  });

  it('differenziale scavalcato da un ponticello', () => {
    const { project, d1 } = twoGroups();
    project.wires.push({ ...project.wires[0]!, id: 'by', from: t(d1, 'p0_in'), to: t(d1, 'p0_out') });
    expect(codes(project)).toContain('RCD_BYPASS');
  });
});
