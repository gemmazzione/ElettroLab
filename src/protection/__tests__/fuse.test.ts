import { describe, expect, it } from 'vitest';
import { runRules } from '../../rules/engine';
import { simulate } from '../../engine/simulate';
import type { FaultType } from '../../model/types';
import { ProjectBuilder, t } from '../../projects/demos';
import { useStore } from '../../store/projectStore';
import { fuseMeltTime } from '../curves';
import { advance, protectedCurrent } from '../stepper';

/** Fornitura → differenziale 30 mA → portafusibili 1P+N → utilizzatore. */
function circuit(opts: { powerW?: number; in?: number } = {}) {
  const b = new ProjectBuilder('fusibili', 1, 12);
  const cnt = b.add('supply-mono', { position: { x: 0, y: 0 } });
  const rcd = b.add('rcd-2p', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = true));
  const f = b.add('fuse-1pn', { rail: { row: 0, slot: 2 } }, (c) => {
    c.closed = true;
    if (c.params.kind === 'fuse') c.params.p.in = opts.in ?? 16;
  });
  const u = b.add('load-generico', { position: { x: 0, y: 500 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, powerW: opts.powerW ?? 1000, cableLength: 15, cableSection: 2.5 };
  });
  const e = b.add('earth', { position: { x: 0, y: 300 } });
  b.wire(t(cnt, 'L'), t(rcd, 'p0_in'), 6, 5)
    .wire(t(cnt, 'N'), t(rcd, 'p1_in'), 6, 5)
    .wire(t(rcd, 'p0_out'), t(f, 'p0_in'), 4, 0.2)
    .wire(t(rcd, 'p1_out'), t(f, 'p1_in'), 4, 0.2)
    .wire(t(f, 'p0_out'), t(u, 'L'), 2.5, 0.5)
    .wire(t(f, 'p1_out'), t(u, 'N'), 2.5, 0.5)
    .wire(t(e, 'PE'), t(u, 'PE'), 2.5, 1);
  const project = b.project;
  const addFault = (type: FaultType, resistance = 0) => {
    project.faults = [...(project.faults ?? []), { id: `f${type}`, type, targetId: u.id, resistance }];
  };
  return { project, f, u, addFault };
}

describe('fusibile gG: curva', () => {
  it('rispetta le porte convenzionali della cartuccia da 16 A (CEI EN 60269-2)', () => {
    expect(fuseMeltTime(1.25, 16)).toBe(Infinity); // non fusione
    expect(fuseMeltTime(1.6, 16)).toBeLessThanOrEqual(3600); // fusione entro 1 h
    expect(fuseMeltTime(33 / 16, 16)).toBeGreaterThanOrEqual(10);
    expect(fuseMeltTime(65 / 16, 16)).toBeLessThanOrEqual(5);
    expect(fuseMeltTime(85 / 16, 16)).toBeGreaterThanOrEqual(0.1);
    expect(fuseMeltTime(150 / 16, 16)).toBeLessThanOrEqual(0.1);
  });

  it('è monotona decrescente con la corrente', () => {
    let prev = Infinity;
    for (let r = 1.55; r < 80; r *= 1.07) {
      const tt = fuseMeltTime(r, 10);
      expect(tt).toBeLessThan(prev);
      prev = tt;
    }
  });
});

describe('portafusibili nel circuito', () => {
  it('in servizio ordinario conduce come un interruttore chiuso', () => {
    const { project, u } = circuit();
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.loads.get(u.id)!.energized).toBe(true);
  });

  it('cortocircuito: la cartuccia fonde, il portafusibili resta chiuso ma il circuito è aperto', () => {
    const { project, f, u, addFault } = circuit();
    addFault('short-LN');
    const out = advance(project, {}, null, 0.5, 'settle');
    const fuse = out.project.components.find((c) => c.id === f.id)!;
    expect(fuse.blown).toEqual([0]);
    expect(fuse.closed).toBe(true);
    expect(out.events.some((e) => e.text.includes('fonde il fusibile'))).toBe(true);
    if (!out.result.ok) throw new Error('sim');
    expect(out.result.loads.get(u.id)!.energized).toBe(false);
  });

  it('sovraccarico su cartuccia da 16 A: fonde nel tempo della curva, non subito', () => {
    const { project, f } = circuit({ powerW: 2 * 16 * 230 });
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    const tMelt = fuseMeltTime(protectedCurrent(r, f) / 16, 16);
    expect(tMelt).toBeGreaterThan(60); // la caduta di tensione riduce la corrente sotto 2·In
    const quick = advance(project, {}, null, 0.9 * tMelt, 'step');
    expect(quick.project.components.find((c) => c.id === f.id)!.blown).toBeUndefined();
    const long = advance(project, {}, null, 1.1 * tMelt, 'step');
    expect(long.project.components.find((c) => c.id === f.id)!.blown).toEqual([0]);
  });

  it('la cartuccia si sostituisce solo a portafusibili aperto', () => {
    const { project, f, addFault } = circuit();
    addFault('short-LN');
    const s = useStore.getState();
    s.openProject(advance(project, {}, null, 0.5, 'settle').project);
    s.replaceFuse(f.id);
    expect(useStore.getState().project.components.find((c) => c.id === f.id)!.blown).toEqual([0]);
    useStore.getState().toggleComponent(f.id); // apre
    useStore.getState().replaceFuse(f.id);
    const after = useStore.getState().project.components.find((c) => c.id === f.id)!;
    expect(after.blown).toBeUndefined();
    expect(after.closed).toBe(false);
  });

  it('coordinamento cavo: If = 1,6·In rende più severa la condizione If ≤ 1,45·Iz', () => {
    const { project, u } = circuit({ in: 20, powerW: 2000 });
    const load = project.components.find((c) => c.id === u.id)!;
    if (load.params.kind === 'load') load.params.p.install = { method: 'B1', insulation: 'PVC', ambientC: 30, grouped: 1, izOverride: 21 };
    const ol = runRules(project).outcomes.find((o) => o.ruleId === 'OL-433' && o.subject.includes(u.label))!;
    // In = 20 A ≤ Iz = 21 A, ma If = 32 A > 1,45 × 21 = 30,45 A
    expect(ol.status).toBe('errore');
    expect(ol.message).toContain('If =');
  });
});
