import { describe, expect, it } from 'vitest';
import { buildSingleLine } from '../../diagram/singleLine';
import { checkWiring } from '../../graph/erc';
import { createComponent, createWire } from '../../model/factory';
import { PANEL_SIZES } from '../../model/geometry';
import { canPlace } from '../../model/placement';
import { ProjectBuilder, t, trifase } from '../../projects/demos';
import { loadBranchImpedance } from '../netlist';
import { simulate } from '../simulate';

function oneLoad(catalogId: string, patch?: (p: Record<string, unknown>) => void) {
  const b = new ProjectBuilder('cos', 1, 12);
  const cnt = b.add('supply-mono', { position: { x: 0, y: 0 } }, (c) => {
    if (c.params.kind === 'supply') c.params.p = { ...c.params.p, rNetwork: 0.001, xNetwork: 0 };
  });
  const q = b.add('mcb-1pn', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = true));
  const u = b.add(catalogId, { position: { x: 0, y: 400 } }, (c) => {
    if (c.params.kind === 'load') {
      c.params.p.cableLength = 0.1;
      patch?.(c.params.p as unknown as Record<string, unknown>);
    }
  });
  b.wire(t(cnt, 'L'), t(q, 'p0_in'), 6, 0.01).wire(t(cnt, 'N'), t(q, 'p1_in'), 6, 0.01);
  b.wire(t(q, 'p0_out'), t(u, 'L'), 2.5, 0.01).wire(t(q, 'p1_out'), t(u, 'N'), 2.5, 0.01);
  return { project: b.project, u };
}

describe('utilizzatori con fattore di potenza', () => {
  it('impedenza R + jX coerente con P e cos φ', () => {
    const z = loadBranchImpedance(1000, 0.8);
    const zMag = Math.hypot(z.re, z.im);
    expect(z.re / zMag).toBeCloseTo(0.8, 12);
    // a 230 V: S = U²/|Z| = 1250 VA, P = S·cos φ = 1000 W
    expect((230 * 230) / zMag).toBeCloseTo(1250, 9);
  });

  it('frigorifero: corrente P/(U·cos φ) e fattore di potenza alla fornitura minore di 1', () => {
    const { project, u } = oneLoad('load-frigo');
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    const l = r.loads.get(u.id)!;
    // rete quasi ideale: tensione ~230 V
    expect(l.p).toBeGreaterThan(148);
    expect(l.p).toBeLessThan(150.01);
    expect(l.i).toBeCloseTo(l.p / (l.v * 0.7), 6);
    expect(r.supply.pf).toBeLessThan(0.71);
    expect(r.supply.pf).toBeGreaterThan(0.69);
  });

  it('i nuovi utilizzatori sono nel catalogo con cos φ < 1', () => {
    for (const id of ['load-clima', 'load-frigo', 'load-caldaia', 'load-lavatrice', 'load-lavastoviglie']) {
      const { project, u } = oneLoad(id);
      const c = project.components.find((x) => x.id === u.id)!;
      expect(c.params.kind === 'load' && (c.params.p.cosPhi ?? 1) < 1).toBe(true);
      const r = simulate(project);
      if (!r.ok) throw new Error(r.reason);
      expect(r.loads.get(u.id)!.energized).toBe(true);
    }
  });

  it('lavatrice e lavastoviglie: circa 2 kW, collegate con presa a spina 16 A', () => {
    for (const id of ['load-lavatrice', 'load-lavastoviglie']) {
      const { project, u } = oneLoad(id);
      const p = project.components.find((x) => x.id === u.id)!.params;
      if (p.kind !== 'load') throw new Error('kind');
      expect(p.p.category).toBe('lavaggio');
      expect(p.p.hasSockets).toBe(true);
      expect(p.p.socketRating).toBe(16);
      expect(p.p.powerW).toBeGreaterThanOrEqual(1800);
    }
  });
});

describe('scaricatore di sovratensione', () => {
  function withSpd(connectPE = true) {
    const p = trifase();
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
    const spd = createComponent(p, 'spd-3pn', { rail: { panelId: 'P1', row: 1, slot: 10 } });
    p.components.push(spd);
    const q2 = p.components.find((c) => c.label === 'Q2')!;
    const xn = p.components.find((c) => c.label === 'XN1')!;
    const xpe = p.components.find((c) => c.label === 'XPE1')!;
    ['L1', 'L2', 'L3'].forEach((k, i) => p.wires.push(createWire(p, t(q2, `p${i}_out`), t(spd, k), { section: 4, length: 0.3 })));
    p.wires.push(createWire(p, t(xn, 't6'), t(spd, 'N'), { section: 4, length: 0.3 }));
    if (connectPE) p.wires.push(createWire(p, t(xpe, 't6'), t(spd, 'PE'), { section: 4, length: 0.3 }));
    return { p, spd, q2, xn };
  }

  it('in condizioni normali non conduce e non genera allarmi', () => {
    const { p, spd } = withSpd();
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.alerts.some((a) => a.componentIds.includes(spd.id))).toBe(false);
    expect(checkWiring(p).filter((i) => i.severity === 'errore')).toEqual([]);
  });

  it('neutro comune interrotto: sovratensione temporanea oltre Uc segnalata', () => {
    const { p, spd, q2, xn } = withSpd();
    const w = p.wires.find((x) => x.from === t(q2, 'p3_out') && x.to === t(xn, 't0'))!;
    p.faults = [{ id: 'nb', type: 'open-wire', targetId: w.id, resistance: 0 }];
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.alerts.some((a) => a.code === 'SPD_TOV' && a.componentIds.includes(spd.id))).toBe(true);
  });

  it('senza collegamento a terra: errore di cablaggio', () => {
    const { p } = withSpd(false);
    expect(checkWiring(p).some((i) => i.code === 'SPD_NO_EARTH')).toBe(true);
  });

  it('compare nello schema unifilare come derivazione', () => {
    const { p, spd } = withSpd();
    const sl = buildSingleLine(p)!;
    const n = sl.nodes.find((x) => x.id === spd.id)!;
    expect(n.kind).toBe('spd');
    expect(sl.nodes.find((x) => x.children.includes(n))!.comp.label).toBe('Q2');
  });
});

describe('quadro da 4 moduli', () => {
  it('formato disponibile e capienza rispettata', () => {
    expect(PANEL_SIZES.some((s) => s.modules === 4 && s.config.modulesPerRow === 4 && s.config.rows === 1)).toBe(true);
    const b = new ProjectBuilder('mini', 1, 4);
    b.add('mcb-2p', { rail: { row: 0, slot: 0 } });
    expect(canPlace(b.project, 2, { row: 0, slot: 2 })).toBe(true);
    expect(canPlace(b.project, 4, { row: 0, slot: 0 })).toBe(false);
    expect(canPlace(b.project, 1, { row: 0, slot: 4 })).toBe(false);
  });
});
