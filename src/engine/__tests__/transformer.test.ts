import { describe, expect, it } from 'vitest';
import { trasformatori } from '../../projects/demos';
import type { Project } from '../../model/types';
import { abs } from '../complex';
import { transformerModel } from '../netlist';
import { simulate } from '../simulate';

const find = (p: Project, catalogId: string) => p.components.find((c) => c.catalogId === catalogId)!;
const on = (p: Project) => {
  for (const c of p.components) if (c.label === 'Q1') c.closed = true;
  return p;
};

describe('trasformatore', () => {
  it('modello: tensione a pieno carico resistivo vicina a quella di targa', () => {
    const m = transformerModel({ sn: 63, u1: 230, u2: 12, ukPct: 12, ukrPct: 10 });
    const rLoad = (12 * 12) / 63;
    const i = 230 / m.n / abs({ re: m.z.re + rLoad, im: m.z.im });
    expect(i * rLoad).toBeGreaterThan(11.6);
    expect(i * rLoad).toBeLessThan(12.4);
  });

  it('alimenta i faretti a 12 V e riporta la corrente al primario', () => {
    const p = on(trasformatori());
    const r = simulate(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const spots = r.loads.get(find(p, 'load-faretti-12v').id)!;
    expect(spots.v).toBeGreaterThan(11.3);
    expect(spots.v).toBeLessThan(13);
    expect(spots.p).toBeGreaterThan(34);
    const t2 = r.transformers.get(find(p, 'transformer-safety').id)!;
    expect(t2.i2).toBeCloseTo(spots.i, 1);
    expect(t2.i1).toBeCloseTo(t2.i2 / (230 / 12) , 1);
    expect(r.alerts.some((a) => a.code === 'TRANSFORMER_OVERLOAD' || a.code === 'VOLTAGE_RANGE')).toBe(false);
  });

  it('il secondario è isolato: nessuna tensione pericolosa verso terra', () => {
    const p = on(trasformatori());
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    const t2 = find(p, 'transformer-safety');
    const vs1 = r.terminalV.get(`${t2.id}:S1`)!;
    const vs2 = r.terminalV.get(`${t2.id}:S2`)!;
    expect(abs(vs1)).toBeLessThan(25);
    expect(abs({ re: vs1.re - vs2.re, im: vs1.im - vs2.im })).toBeGreaterThan(11);
  });

  it('senza alimentazione al primario il secondario è spento', () => {
    const p = trasformatori();
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.loads.get(find(p, 'load-faretti-12v').id)!.energized).toBe(false);
  });

  it('il campanello suona solo con il pulsante premuto', () => {
    const p = on(trasformatori());
    const bell = find(p, 'load-campanello');
    const r0 = simulate(p);
    if (!r0.ok) throw new Error(r0.reason);
    expect(r0.loads.get(bell.id)!.energized).toBe(false);
    find(p, 'pushbutton').closed = true;
    const r1 = simulate(p);
    if (!r1.ok) throw new Error(r1.reason);
    expect(r1.loads.get(bell.id)!.v).toBeGreaterThan(9);
  });

  it('sovraccarico: la tensione cala e compare l\'avviso', () => {
    const p = on(trasformatori());
    const spots = find(p, 'load-faretti-12v');
    if (spots.params.kind === 'load') spots.params.p.powerW = 120;
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.alerts.some((a) => a.code === 'TRANSFORMER_OVERLOAD')).toBe(true);
    expect(r.loads.get(spots.id)!.v).toBeLessThan(11.5);
  });
});
