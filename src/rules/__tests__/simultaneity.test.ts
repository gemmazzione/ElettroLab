import { describe, expect, it } from 'vitest';
import { appartamento } from '../../projects/demos';
import { buildNormContext } from '../context';
import { runRules } from '../engine';

const drops = (p: ReturnType<typeof appartamento>) => new Map(buildNormContext(p).circuits.map((c) => [c.load.id, c.dropPct!]));

describe('caduta di tensione: contemporaneità', () => {
  it('con fattore 100% e tutti inclusi coincide con il caso "tutti accesi"', () => {
    const p = appartamento();
    const base = drops(p);
    p.norm = { residential: true, ul: 50, simultaneity: 1 };
    for (const c of p.components) if (c.params.kind === 'load') c.params.p.designOn = true;
    for (const [id, d] of drops(p)) expect(d).toBeCloseTo(base.get(id)!, 9);
  });

  it('un fattore minore o meno utilizzatori contemporanei riducono la caduta, mai sotto quella della sola linea', () => {
    const p = appartamento();
    const full = drops(p);
    p.norm = { residential: true, ul: 50, simultaneity: 0.5 };
    const half = drops(p);
    for (const c of p.components) if (c.params.kind === 'load') c.params.p.designOn = false;
    const alone = drops(p);
    for (const [id, d] of full) {
      expect(half.get(id)!).toBeLessThanOrEqual(d + 1e-9);
      expect(alone.get(id)!).toBeLessThanOrEqual(half.get(id)! + 1e-9);
      expect(alone.get(id)!).toBeGreaterThan(0);
    }
  });

  it('l\'utilizzatore verificato resta a piena potenza anche se escluso dagli altri', () => {
    const p = appartamento();
    for (const c of p.components) if (c.params.kind === 'load') c.params.p.designOn = false;
    const ctx = buildNormContext(p);
    expect(ctx.circuits.every((c) => c.dropPct !== null && c.dropOthers.length === 0)).toBe(true);
    const o = runRules(p).outcomes.find((x) => x.ruleId === 'CDT-525')!;
    expect(o.details?.some((d) => d.includes('Nessun altro utilizzatore'))).toBe(true);
  });
});
