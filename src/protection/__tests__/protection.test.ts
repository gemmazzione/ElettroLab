import { describe, expect, it } from 'vitest';
import { abs } from '../../engine/complex';
import { clampReading, deviceShortCircuit, loadEndFaultCurrents, resistanceBetween } from '../../engine/measure';
import { innerNode, wireResistance } from '../../engine/netlist';
import { simulate } from '../../engine/simulate';
import { CONTACT_RESISTANCE } from '../../model/constants';
import type { FaultType } from '../../model/types';
import { appartamento, ProjectBuilder, t } from '../../projects/demos';
import { magneticZone, residualZone, thermalTripTime } from '../curves';
import { advance } from '../stepper';

/** Fornitura → differenziale 30 mA → magnetotermico 1P+N → utilizzatore, PE al dispersore. */
function circuit(opts: { powerW?: number; in?: number; icn?: number; cable?: number; rNetwork?: number; feeder?: number } = {}) {
  const b = new ProjectBuilder('test', 1, 12);
  const cnt = b.add('supply-mono', { position: { x: 0, y: 0 } }, (c) => {
    if (c.params.kind === 'supply' && opts.rNetwork !== undefined) {
      c.params.p.rNetwork = opts.rNetwork;
      c.params.p.xNetwork = opts.rNetwork;
    }
  });
  const rcd = b.add('rcd-2p', { rail: { row: 0, slot: 0 } }, (c) => (c.closed = true));
  const q = b.add('mcb-1pn', { rail: { row: 0, slot: 2 } }, (c) => {
    c.closed = true;
    if (c.params.kind === 'mcb') c.params.p = { ...c.params.p, in: opts.in ?? 10, icn: opts.icn ?? 4.5 };
  });
  const u = b.add('load-generico', { position: { x: 0, y: 500 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, powerW: opts.powerW ?? 1000, cableLength: opts.cable ?? 20, cableSection: 2.5 };
  });
  const e = b.add('earth', { position: { x: 0, y: 300 } });
  const feeder = opts.feeder ?? 5;
  b.wire(t(cnt, 'L'), t(rcd, 'p0_in'), 6, feeder)
    .wire(t(cnt, 'N'), t(rcd, 'p1_in'), 6, feeder)
    .wire(t(rcd, 'p0_out'), t(q, 'p0_in'), 4, 0.2)
    .wire(t(rcd, 'p1_out'), t(q, 'p1_in'), 4, 0.2)
    .wire(t(q, 'p0_out'), t(u, 'L'), 2.5, 0.5)
    .wire(t(q, 'p1_out'), t(u, 'N'), 2.5, 0.5)
    .wire(t(e, 'PE'), t(u, 'PE'), 2.5, 1);
  const project = b.project;
  const addFault = (type: FaultType, resistance = 0) => {
    project.faults = [...(project.faults ?? []), { id: `f${type}`, type, targetId: u.id, resistance }];
  };
  return { project, cnt, rcd, q, u, e, addFault };
}

describe('curve di intervento', () => {
  it('termico: rispetta i punti convenzionali CEI EN 60898-1', () => {
    expect(thermalTripTime(0, 1.13)).toBe(Infinity);
    const t145 = thermalTripTime(0, 1.45);
    expect(t145).toBeGreaterThan(60);
    expect(t145).toBeLessThan(3600);
    const t255 = thermalTripTime(0, 2.55);
    expect(t255).toBeGreaterThan(1);
    expect(t255).toBeLessThan(60);
  });

  it('magnetico: fascia di incertezza della curva C', () => {
    expect(magneticZone(4.9, 'C')).toBe('sotto');
    expect(magneticZone(7, 'C')).toBe('incerta');
    expect(magneticZone(10, 'C')).toBe('certa');
  });

  it('differenziale: nessun intervento sotto 0,5·IΔn', () => {
    expect(residualZone(0.014, 0.03)).toBe('sotto');
    expect(residualZone(0.02, 0.03)).toBe('incerta');
    expect(residualZone(0.03, 0.03)).toBe('certa');
  });
});

describe('sovraccarico', () => {
  it('il magnetotermico non interviene subito, ma dopo il tempo previsto dal modello termico', () => {
    // 3500 W su C10 → circa 15 A ≈ 1,5·In
    const { project, q } = circuit({ powerW: 3500, in: 10 });
    const r0 = simulate(project);
    if (!r0.ok) throw new Error(r0.reason);
    const ratio = abs(r0.poleI.get(q.id)![0]!) / 10;
    const expected = thermalTripTime(0, ratio);

    const early = advance(project, {}, r0, 1);
    expect(early.tripped).toBe(false);
    expect(early.project.components.find((c) => c.id === q.id)!.closed).toBe(true);

    const out = advance(project, {}, r0, 600);
    expect(out.tripped).toBe(true);
    expect(out.prot[q.id]!.tripped).toBe('termico');
    expect(out.events[0]!.at).toBeCloseTo(expected, 6);
    expect(out.project.components.find((c) => c.id === q.id)!.closed).toBe(false);
  });

  it('guasto «sovraccarico»: apparecchi in più sulla linea fanno intervenire il termico del circuito', () => {
    const p = appartamento();
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
    const prese = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === 'Prese zona giorno')!;
    const r0 = simulate(p);
    if (!r0.ok) throw new Error(r0.reason);
    p.faults = [{ id: 'ov', type: 'overload', targetId: prese.id, resistance: 0, powerW: 4000 }];
    const r1 = simulate(p);
    if (!r1.ok) throw new Error(r1.reason);
    // la corrente di linea cresce della quota del carico aggiunto
    expect(r1.cableI.get(prese.id)!.L).toBeDefined();
    const iBefore = abs(r0.cableI.get(prese.id)!.L!);
    const iAfter = abs(r1.cableI.get(prese.id)!.L!);
    // 4000 W a 230 V sarebbero 17,4 A; con la caduta lungo la linea la resistenza aggiunta assorbe un po' meno
    expect(iAfter - iBefore).toBeGreaterThan(15);
    expect(iAfter - iBefore).toBeLessThan(17.4);
    const out = advance(p, {}, r1, 600);
    const q4 = p.components.find((c) => c.label === 'Q4')!;
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    expect(out.prot[q4.id]?.tripped).toBe('termico');
    expect(out.prot[q1.id]?.tripped).toBeUndefined();
  });

  it('a 1,13·In non interviene', () => {
    const { project } = circuit({ powerW: 230 * 11.3, in: 10, cable: 1 });
    const out = advance(project, {}, null, 3600);
    expect(out.tripped).toBe(false);
  });
});

describe('cortocircuito', () => {
  it('guasto L-N a fondo linea: intervento magnetico entro il potere di interruzione', () => {
    const { project, q, addFault } = circuit();
    addFault('short-LN');
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    const out = advance(project, {}, r, 0.5, 'settle');
    expect(out.prot[q.id]!.tripped).toBe('magnetico');
    expect(out.elapsed).toBeCloseTo(0.01, 6);
    expect(out.events.some((e) => e.text.includes('entro il potere di interruzione'))).toBe(true);
    const after = out.result;
    if (!after.ok) throw new Error();
    expect(after.supply.i).toBeLessThan(1e-6);
  });

  it('corrente di cortocircuito oltre Icn: segnalazione di interruzione non garantita', () => {
    const { project, addFault } = circuit({ icn: 3, cable: 0.5, rNetwork: 0.005, feeder: 0.5 });
    addFault('short-LN');
    const out = advance(project, {}, null, 0.5, 'settle');
    expect(out.events.some((e) => e.text.includes('supera Icn'))).toBe(true);
  });

  it('Icc presunta ai morsetti del dispositivo coerente con le impedenze in serie', () => {
    const { project, q } = circuit();
    const ik = deviceShortCircuit(project, q)!;
    const rLoop = 0.25 + 2 * wireResistance(5, 6) + 2 * wireResistance(0.2, 4) + 4 * CONTACT_RESISTANCE;
    expect(ik).toBeGreaterThan((230 / Math.hypot(rLoop, 0.08)) * 0.995);
    expect(ik).toBeLessThan((230 / Math.hypot(rLoop, 0.08)) * 1.005);
    const end = loadEndFaultCurrents(project, project.components.find((c) => c.params.kind === 'load')!.id);
    expect(end.ln!).toBeLessThan(ik);
  });
});

describe('guasto a terra e differenziale', () => {
  it('guasto franco L-PE: il differenziale interviene; prima dell\'intervento la massa è in tensione', () => {
    const { project, rcd, u, addFault } = circuit();
    addFault('L-PE', 0);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    // TT: corrente di guasto limitata da RA (50 Ω) + RB (2 Ω)
    const ig = r.residual.get(rcd.id)!;
    expect(ig).toBeGreaterThan(4);
    expect(ig).toBeLessThan(4.5);
    expect(r.touchV.get(u.id)!).toBeGreaterThan(200);
    const out = advance(project, {}, r, 0.5, 'settle');
    expect(out.prot[rcd.id]!.tripped).toBe('differenziale');
    expect(out.elapsed).toBeCloseTo(0.04, 6);
    if (!out.result.ok) throw new Error();
    expect(out.result.touchV.get(u.id) ?? 0).toBeLessThan(1);
  });

  it('dispersione ad alta resistenza: sotto 0,5·IΔn nessun intervento', () => {
    const { project, rcd, addFault } = circuit();
    addFault('L-earth', 20000);
    const out = advance(project, {}, null, 10);
    expect(out.tripped).toBe(false);
    if (!out.result.ok) throw new Error();
    expect(out.result.residual.get(rcd.id)!).toBeLessThan(0.015);
  });

  it('dispersione tra 0,5 e 1·IΔn: segnalata come intervento non garantito', () => {
    const { project, addFault } = circuit();
    addFault('L-earth', 10000);
    const out = advance(project, {}, null, 10);
    expect(out.tripped).toBe(false);
    expect(out.events.some((e) => e.text.includes('non garantito'))).toBe(true);
  });

  it('la pinza sulla linea (L+N) misura la corrente di dispersione', () => {
    const { project, u, addFault } = circuit();
    addFault('L-earth', 10000);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    const leak = clampReading(r, { kind: 'line', id: u.id });
    expect(leak).toBeGreaterThan(0.02);
    expect(leak).toBeLessThan(0.025);
  });
});

describe('neutro interrotto', () => {
  it('monofase: l\'utilizzatore si spegne e il suo neutro va al potenziale di fase', () => {
    const { project, u, addFault } = circuit();
    addFault('open-N');
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.loads.get(u.id)!.i).toBeLessThan(1e-6);
    expect(r.alerts.some((a) => a.code === 'NEUTRAL_LIVE')).toBe(true);
  });
});

describe('multimetro', () => {
  it('a impianto disalimentato misura la resistenza dell\'anello L-N attraverso il carico', () => {
    const { project, q, u } = circuit({ powerW: 2300 });
    const r = resistanceBetween(project, t(q, 'p0_out'), t(q, 'p1_out'));
    const expected = 23 + 2 * wireResistance(20, 2.5) + 2 * wireResistance(0.5, 2.5);
    expect(r).toBeCloseTo(expected, 9);
    // utilizzatore spento → circuito aperto
    const load = project.components.find((c) => c.id === u.id)!;
    if (load.params.kind === 'load') load.params.p.on = false;
    expect(resistanceBetween(project, t(q, 'p0_out'), t(q, 'p1_out'))).toBe(Infinity);
  });

  it('continuità del PE tra massa e dispersore', () => {
    const { project, u, e } = circuit();
    const r = resistanceBetween(project, t(u, 'PE'), t(e, 'PE'));
    expect(r).toBeCloseTo(wireResistance(1, 2.5), 9);
    expect(innerNode(u.id, 'PE')).toContain('#PE');
  });
});
