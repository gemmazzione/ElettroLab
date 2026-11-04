import { describe, expect, it } from 'vitest';
import { checkWiring } from '../../graph/erc';
import { cabinImpedance } from '../../model/cabin';
import type { ComponentInstance } from '../../model/types';
import { ProjectBuilder, t } from '../../projects/demos';
import { magneticBand, thermalSetting } from '../../protection/curves';
import { advance } from '../../protection/stepper';
import { ampacity } from '../../rules/ampacity';
import { runRules } from '../../rules/engine';
import { deviceShortCircuit, loadEndFaultCurrents } from '../measure';
import { simulate } from '../simulate';

/** Cabina 400 kVA → generale scatolato 4P → partenza scatolata 3P → carico trifase con PE dalla cabina. */
function plant(opts: { length?: number; section?: 4 | 16 | 50; ir?: number; im?: number } = {}) {
  const b = new ProjectBuilder('stabilimento', 2, 24);
  const cab = b.add('supply-cabina', { position: { x: 0, y: 0 } });
  const qf1 = b.add('mccb-4p-630', { rail: { row: 0, slot: 0 } }, (c) => {
    c.closed = true;
    c.label = 'QF1';
  });
  const qf2 = b.add('mccb-3p-160', { rail: { row: 0, slot: 10 } }, (c) => {
    c.closed = true;
    c.label = 'QF2';
    if (c.params.kind === 'mcb') c.params.p = { ...c.params.p, in: 100, ir: opts.ir ?? 63, im: opts.im ?? 10 };
  });
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 0 } });
  const u = b.add('load-tri', { position: { x: 200, y: 700 } }, (c) => {
    if (c.params.kind === 'load')
      c.params.p = {
        ...c.params.p,
        name: 'Forno trifase',
        powerW: 30000,
        cableLength: opts.length ?? 40,
        cableSection: opts.section ?? 16,
        install: { method: 'E', insulation: 'EPR', ambientC: 30, grouped: 1 },
      };
  });
  b.wire(t(cab, 'L1'), t(qf1, 'p0_in'), 240, 5)
    .wire(t(cab, 'L2'), t(qf1, 'p1_in'), 240, 5)
    .wire(t(cab, 'L3'), t(qf1, 'p2_in'), 240, 5)
    .wire(t(cab, 'N'), t(qf1, 'p3_in'), 240, 5)
    .wire(t(cab, 'PE'), t(xpe, 't0'), 120, 5)
    .wire(t(qf1, 'p0_out'), t(qf2, 'p0_in'), 95, 1)
    .wire(t(qf1, 'p1_out'), t(qf2, 'p1_in'), 95, 1)
    .wire(t(qf1, 'p2_out'), t(qf2, 'p2_in'), 95, 1)
    .wire(t(qf2, 'p0_out'), t(u, 'L1'), opts.section ?? 16, 0.5)
    .wire(t(qf2, 'p1_out'), t(u, 'L2'), opts.section ?? 16, 0.5)
    .wire(t(qf2, 'p2_out'), t(u, 'L3'), opts.section ?? 16, 0.5)
    .wire(t(xpe, 't1'), t(u, 'PE'), opts.section ?? 16, 0.5);
  return { project: b.project, cab, qf1, qf2, u };
}

const mcbP = (c: ComponentInstance) => (c.params.kind === 'mcb' ? c.params.p : null)!;

describe('cabina MT/BT e sistema TN-S', () => {
  it("impedenza della cabina: 400 kVA, ucc 6% → circa 9,6 kA ai morsetti BT", () => {
    const z = cabinImpedance(400, 6, 500);
    expect(z.inA).toBeCloseTo(577, 0);
    expect(z.ik3).toBeGreaterThan(9000);
    expect(z.ik3).toBeLessThan(10000);
  });

  it("l'Icc a valle del generale è quella della cabina", () => {
    const { project, qf1 } = plant();
    const icc = deviceShortCircuit(project, qf1)!;
    expect(icc / cabinImpedance(400, 6, 500).ik3).toBeGreaterThan(0.85);
    expect(icc / cabinImpedance(400, 6, 500).ik3).toBeLessThan(1.05);
  });

  it('nel TN-S il guasto a massa si richiude sul PE della cabina: corrente di cortocircuito, non pochi ampere', () => {
    const { project, u } = plant();
    const f = loadEndFaultCurrents(project, u.id);
    expect(f.lpe!).toBeGreaterThan(1000);
    // Senza dispersore dell'utente il PE della cabina basta: niente «impianto di terra assente».
    expect(checkWiring(project).some((i) => i.code === 'NO_EARTH')).toBe(false);
  });

  it('regole: TN-413 al posto delle regole del TT; linea troppo lunga non protetta', () => {
    const ok = runRules(plant().project);
    expect(ok.outcomes.some((o) => o.ruleId === 'TT-DIFF' || o.ruleId === 'TT-RE-IDN')).toBe(false);
    expect(ok.outcomes.find((o) => o.ruleId === 'TN-413')!.status).toBe('conforme');
    const long = runRules(plant({ length: 400, section: 4 }).project);
    expect(long.outcomes.find((o) => o.ruleId === 'TN-413')!.status).toBe('errore');
  });

  it('il guasto a massa fa scattare lo scatolato per via magnetica', () => {
    const { project, qf2, u } = plant();
    project.faults = [{ id: 'g1', type: 'L-PE', targetId: u.id, resistance: 0 }];
    const res = simulate(project);
    expect(res.ok).toBe(true);
    const st = advance(project, {}, null, 1);
    expect(st.project.components.find((c) => c.id === qf2.id)!.closed).toBe(false);
  });
});

describe('interruttori scatolati regolabili', () => {
  it('Ir limita il termico, Im fissa la soglia magnetica con ±20%', () => {
    const p = mcbP(plant({ ir: 63, im: 8 }).qf2);
    expect(thermalSetting(p)).toBe(63);
    expect(magneticBand(p)).toEqual([6.4, 9.6]);
  });

  it('portata con tre conduttori carichi più bassa che con due', () => {
    const two = ampacity(95, 'E', 'EPR', 30, 1, 2)!;
    const three = ampacity(95, 'E', 'EPR', 30, 1, 3)!;
    expect(two.iz).toBe(352);
    expect(three.iz).toBe(298);
    expect(ampacity(240, 'C', 'PVC', 30, 1, 3)!.iz).toBe(403);
  });
});
