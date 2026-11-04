import { describe, expect, it } from 'vitest';
import { checkWiring } from '../../graph/erc';
import { cabinImpedance } from '../../model/cabin';
import type { ComponentInstance } from '../../model/types';
import { capannone, ProjectBuilder, t } from '../../projects/demos';
import { selectivity } from '../../protection/selectivity';
import { magneticBand, thermalSetting } from '../../protection/curves';
import { advance } from '../../protection/stepper';
import { ampacity } from '../../rules/ampacity';
import { runRules } from '../../rules/engine';
import { deviceShortCircuit, loadEndFaultCurrents } from '../measure';
import { motorStartCheck } from '../motor';
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

/** Cabina → protezione del motore → motore 15 kW (eventualmente con un rifasamento in parallelo). */
function motorPlant(protection: 'mcb-b' | 'salvamotore', opts: { kvar?: number } = {}) {
  const b = new ProjectBuilder('motore', 2, 24);
  const cab = b.add('supply-cabina', { position: { x: 0, y: 0 } });
  const q = b.add(protection === 'salvamotore' ? 'salvamotore-32' : 'mcb-3p', { rail: { row: 0, slot: 0 } }, (c) => {
    c.closed = true;
    c.label = 'QM1';
    if (c.params.kind === 'mcb' && protection === 'mcb-b') c.params.p = { ...c.params.p, in: 32, curve: 'B', icn: 25 };
    if (c.params.kind === 'mcb' && protection === 'salvamotore') c.params.p = { ...c.params.p, ir: 28 };
  });
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 0 } });
  const m = b.add('motore-15kw', { position: { x: 200, y: 700 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, on: true, install: { method: 'E', insulation: 'EPR', ambientC: 30, grouped: 1 } };
  });
  b.wire(t(cab, 'L1'), t(q, 'p0_in'), 16, 5)
    .wire(t(cab, 'L2'), t(q, 'p1_in'), 16, 5)
    .wire(t(cab, 'L3'), t(q, 'p2_in'), 16, 5)
    .wire(t(cab, 'PE'), t(xpe, 't0'), 16, 5)
    .wire(t(q, 'p0_out'), t(m, 'L1'), 6, 0.5)
    .wire(t(q, 'p1_out'), t(m, 'L2'), 6, 0.5)
    .wire(t(q, 'p2_out'), t(m, 'L3'), 6, 0.5)
    .wire(t(xpe, 't1'), t(m, 'PE'), 6, 0.5);
  if (opts.kvar) {
    const cap = b.add('rifasamento-50kvar', { position: { x: 500, y: 700 } }, (c) => {
      if (c.params.kind === 'load') c.params.p = { ...c.params.p, kvar: opts.kvar };
    });
    b.wire(t(cab, 'L1'), t(cap, 'L1'), 16, 5).wire(t(cab, 'L2'), t(cap, 'L2'), 16, 5).wire(t(cab, 'L3'), t(cap, 'L3'), 16, 5).wire(t(xpe, 't2'), t(cap, 'PE'), 16, 5);
  }
  return { project: b.project, q, m };
}

describe('motori e rifasamento', () => {
  it("allo spunto il magnetotermico in curva B scatta, il salvamotore no", () => {
    const b = motorPlant('mcb-b');
    const outB = advance(b.project, {}, null, 10);
    expect(outB.project.components.find((c) => c.id === b.q.id)!.closed).toBe(false);
    expect(outB.events.some((e) => e.text.includes('si avvia'))).toBe(true);
    const s = motorPlant('salvamotore');
    const outS = advance(s.project, {}, null, 10);
    expect(outS.project.components.find((c) => c.id === s.q.id)!.closed).toBe(true);
    // Finito l'avviamento il motore assorbe la corrente nominale.
    const i = outS.result.ok ? Math.max(...outS.result.supply.phases.map((p) => p.i)) : 0;
    expect(i).toBeGreaterThan(24);
    expect(i).toBeLessThan(34);
  });

  it('la verifica di avviamento distingue le protezioni', () => {
    const b = motorPlant('mcb-b');
    const cb = motorStartCheck(b.project, b.m.id)!;
    expect(cb.iaA / cb.inA).toBeCloseTo(7.5, 6);
    expect(cb.checks.some((c) => c.ok === false)).toBe(true);
    const s = motorPlant('salvamotore');
    expect(motorStartCheck(s.project, s.m.id)!.checks.every((c) => c.ok === true)).toBe(true);
  });

  it('il rifasamento porta il cos φ alla consegna oltre 0,95', () => {
    const base = simulate(motorPlant('salvamotore').project);
    // Il motore chiede circa 10,5 kvar: 10 kvar lo rifasano quasi del tutto (20 lo sovracompenserebbero).
    const comp = simulate(motorPlant('salvamotore', { kvar: 10 }).project);
    expect(base.ok && comp.ok).toBe(true);
    if (!base.ok || !comp.ok) return;
    expect(base.supply.pf).toBeLessThan(0.86);
    expect(comp.supply.pf).toBeGreaterThan(0.95);
  });
});

describe('progetto Capannone e selettività', () => {
  it('il capannone supera le regole verificate e i collegamenti non hanno errori', () => {
    const p = capannone();
    expect(checkWiring(p).filter((i) => i.severity === 'errore')).toEqual([]);
    expect(runRules(p).counts.errore).toBe(0);
  });

  it('chiuso il generale si avviano i motori senza scatti; il rifasamento porta il cos φ a 1', () => {
    const p = capannone();
    for (const c of p.components) if (c.label === 'QF0' || c.label === 'QR') c.closed = true;
    const out = advance(p, {}, null, 20);
    expect(out.events.filter((e) => e.text.includes('si avvia')).length).toBe(3);
    expect(out.tripped).toBe(false);
    expect(out.result.ok && out.result.supply.pf).toBeGreaterThan(0.98);
  });

  it('selettività: totale tra illuminazione e generale, parziale (amperometrica) tra le partenze e il generale', () => {
    const p = capannone();
    const by = (l: string) => p.components.find((c) => c.label === l)!;
    const ql = selectivity(p, by('QL'))!;
    expect(ql.up.label).toBe('QF0');
    expect(ql.total).toBe(true);
    const qf2 = selectivity(p, by('QF2'))!;
    expect(qf2.total).toBe(false);
    // Il limite è la soglia magnetica minima del generale: 0,8 × 10 × 630 A.
    expect(qf2.limitA!).toBeGreaterThan(4900);
    expect(qf2.limitA!).toBeLessThan(5200);
    // Attraverso sezionatore e differenziale del sottoquadro si risale a QF1.
    expect(selectivity(p, by('QS1'))!.up.label).toBe('QF1');
  });
});
