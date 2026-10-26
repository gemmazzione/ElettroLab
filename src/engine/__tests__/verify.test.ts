import { describe, expect, it } from 'vitest';
import { monolocale } from '../../projects/demos';
import { insulationResistance, loopImpedance, rcdTest } from '../verify';

const setup = () => {
  const p = monolocale();
  for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
  const u2 = p.components.find((c) => c.label === 'U2')!;
  return { p, u2 };
};

describe('verifiche iniziali', () => {
  it('isolamento: ideale senza guasti, pari alla resistenza del guasto L-PE se presente', () => {
    const { p, u2 } = setup();
    expect(insulationResistance(p, u2.id)).toBe(Infinity);
    p.faults = [{ id: 'g1', type: 'L-PE', targetId: u2.id, resistance: 150000 }];
    const r = insulationResistance(p, u2.id);
    expect(r).toBeGreaterThan(150000);
    expect(r).toBeLessThan(150001);
  });

  it('anello di guasto: nel TT l\'impedenza L-PE comprende le resistenze di terra', () => {
    const { p, u2 } = setup();
    const l = loopImpedance(p, u2.id);
    const earth = p.components.find((c) => c.params.kind === 'earth')!;
    const ra = earth.params.kind === 'earth' ? earth.params.p.ra : 0;
    expect(l.zLpe!).toBeGreaterThan(ra);
    expect(l.zLn!).toBeLessThan(2);
    expect(l.ikLn!).toBeGreaterThan(l.ikLpe!);
  });

  it('prova del differenziale: non interviene a ½·IΔn, interviene da IΔn con i tempi del modello', () => {
    const { p, u2 } = setup();
    const t = rcdTest(p, u2.id);
    expect(t.rcd!.label).toBe('Q2');
    expect(t.idnMa).toBe(30);
    expect(t.rows.find((r) => r.mult === 0.5)!.outcome).toBe('non interviene');
    expect(t.rows.find((r) => r.mult === 1)!.timeS).toBeCloseTo(0.3, 6);
    expect(t.rows.find((r) => r.mult === 5)!.timeS).toBeCloseTo(0.04, 6);
    expect(t.ut!).toBeCloseTo(t.ra! * 0.03, 6);
  });
});
