import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { checkWiring } from '../../graph/erc';
import { runRules } from '../../rules/engine';
import { L6_EXERCISES } from '../exercisesL6';
import type { ExerciseCtx, Task } from '../types';
import { createWire } from '../../model/factory';

const ex = (id: string) => L6_EXERCISES.find((e) => e.id === id)!;
function ctxOf(project: ReturnType<typeof ex>['build'] extends () => infer P ? P : never): ExerciseCtx {
  return {
    project,
    running: false,
    live: null,
    prot: {},
    probes: {},
    clampTarget: null,
    design: () => simulate(project, { closed: () => true }),
    issues: () => checkWiring(project),
    norm: () => runRules(project),
    byLabel: (l) => project.components.find((c) => c.label === l),
    loadByName: (n) => project.components.find((c) => c.params.kind === 'load' && c.params.p.name === n),
  };
}
const check = (t: Task, ctx: ExerciseCtx) => (t.kind === 'check' ? t.check(ctx) : null);
const expected = (t: Task, ctx: ExerciseCtx) => (t.kind === 'numeric' ? t.expected(ctx) : null);

describe('esercizi del livello 6', () => {
  it('deviatori: il progetto iniziale non è risolto, con le navette giuste sì', () => {
    const e = ex('l6-deviatori');
    const p = e.build();
    const task = e.tasks.find((t) => t.id === 'toggle')!;
    expect(check(task, ctxOf(p))!.ok).toBe(false);
    const [d1, d2] = p.components.filter((c) => c.params.kind === 'wall-switch');
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    const lamp = p.components.find((c) => c.params.kind === 'load')!;
    for (const [a, b] of [[`${q1.id}:p0_out`, `${d1!.id}:C`], [`${d1!.id}:1`, `${d2!.id}:1`], [`${d1!.id}:2`, `${d2!.id}:2`], [`${d2!.id}:C`, `${lamp.id}:L`]] as const) {
      p.wires.push(createWire(p, a, b, { section: 1.5, length: 5 }));
    }
    const ctx = ctxOf(p);
    expect(check(task, ctx)).toEqual({ ok: true });
    expect(check(e.tasks.find((t) => t.id === 'phase')!, ctx)).toEqual({ ok: true });
  });

  it('contattore: risolto collegando fase → S1 → A1 e A2 al neutro', () => {
    const e = ex('l6-contattore');
    const p = e.build();
    const task = e.tasks.find((t) => t.id === 'coil')!;
    expect(check(task, ctxOf(p))!.ok).toBe(false);
    const q3 = p.components.find((c) => c.label === 'Q3')!;
    const s1 = p.components.find((c) => c.params.kind === 'wall-switch')!;
    const km = p.components.find((c) => c.params.kind === 'contactor')!;
    p.wires.push(createWire(p, `${q3.id}:p0_out`, `${s1.id}:L`, { section: 1.5, length: 5 }));
    p.wires.push(createWire(p, `${s1.id}:1`, `${km.id}:A1`, { section: 1.5, length: 5 }));
    p.wires.push(createWire(p, `${q3.id}:p1_out`, `${km.id}:A2`, { section: 1.5, length: 0.2 }));
    expect(check(task, ctxOf(p))).toEqual({ ok: true });
  });

  it('stringa: 15 moduli superano la tensione massima, 10 vanno bene', () => {
    const e = ex('l6-stringa');
    const p = e.build();
    const ctx = ctxOf(p);
    expect(expected(e.tasks.find((t) => t.id === 'vocmax')!, ctx)!).toBeGreaterThan(600);
    const fix = e.tasks.find((t) => t.id === 'fix')!;
    expect(check(fix, ctx)!.ok).toBe(false);
    const a = p.components.find((c) => c.params.kind === 'pv-array')!;
    if (a.params.kind === 'pv-array') a.params.p.modulesPerString = 10;
    expect(check(fix, ctxOf(p))!.ok).toBe(true);
  });

  it('polarità: lettura negativa prima, produzione dopo la correzione', () => {
    const e = ex('l6-polarita');
    const p = e.build();
    expect(expected(e.tasks.find((t) => t.id === 'read')!, ctxOf(p))!).toBeLessThan(-200);
    const fixed = e.tasks.find((t) => t.id === 'fixed')!;
    expect(check(fixed, ctxOf(p))!.ok).toBe(false);
    const a = p.components.find((c) => c.params.kind === 'pv-array')!;
    for (const w of p.wires) {
      if (w.from === `${a.id}:DC+`) w.from = `${a.id}:DC-`;
      else if (w.from === `${a.id}:DC-`) w.from = `${a.id}:DC+`;
    }
    expect(check(fixed, ctxOf(p))!.ok).toBe(true);
  });

  it('autoconsumo: una batteria da 5 kWh riduce i prelievi di almeno 2 kWh', () => {
    const e = ex('l6-autoconsumo');
    const p = e.build();
    const task = e.tasks.find((t) => t.id === 'battery')!;
    expect(check(task, ctxOf(p))!.ok).toBe(false);
    const inv = p.components.find((c) => c.params.kind === 'inverter')!;
    if (inv.params.kind === 'inverter') inv.params.p = { ...inv.params.p, batteryKWh: 5, batteryW: 2500 };
    expect(check(task, ctxOf(p))!.ok).toBe(true);
    expect(expected(e.tasks.find((t) => t.id === 'produced')!, ctxOf(p))!).toBeGreaterThan(5);
  });

  it('verifiche: l\'isolamento misurato coincide con il difetto nascosto (180 kΩ)', () => {
    const e = ex('l6-verifiche');
    const p = e.build();
    expect(expected(e.tasks.find((t) => t.id === 'iso')!, ctxOf(p))!).toBeCloseTo(180, 0);
    expect(expected(e.tasks.find((t) => t.id === 'zs')!, ctxOf(p))!).toBeGreaterThan(40);
  });
});
