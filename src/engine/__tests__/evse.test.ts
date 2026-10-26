import { describe, expect, it } from 'vitest';
import type { Project } from '../../model/types';
import { fotovoltaico } from '../../projects/demos';
import { pvEnv } from '../pv';
import { simulate } from '../simulate';

function demo(mode: 'fissa' | 'limitata' | 'solare', irradiance: number): { p: Project; id: string } {
  const p = fotovoltaico();
  for (const c of p.components) if (c.params.kind !== 'load' && c.params.kind !== 'button') c.closed = true;
  p.pv = { ...pvEnv(p.pv), irradiance, ambientC: 25 };
  const ev = p.components.find((c) => c.params.kind === 'load' && c.params.p.evse)!;
  if (ev.params.kind === 'load') ev.params.p = { ...ev.params.p, on: true, evse: { mode, minW: 1400 } };
  return { p, id: ev.id };
}

describe('wallbox con gestione della potenza', () => {
  it('in modalità solare usa solo il surplus: lo scambio con la rete va a circa zero', () => {
    const { p, id } = demo('solare', 1000);
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    const ev = r.evse!.get(id)!;
    expect(ev.setW).toBeGreaterThan(1400);
    expect(ev.setW).toBeLessThan(ev.maxW);
    expect(Math.abs(r.supply.p)).toBeLessThan(30);
  });

  it('di notte, in modalità solare, la ricarica è sospesa', () => {
    const { p, id } = demo('solare', 0);
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.evse!.get(id)!.setW).toBe(0);
    expect(r.evse!.get(id)!.reason).toContain('sospesa');
  });

  it('in modalità limitata il prelievo resta entro la potenza contrattuale (3 kW)', () => {
    const { p, id } = demo('limitata', 0);
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    const ev = r.evse!.get(id)!;
    expect(ev.setW).toBeLessThan(ev.maxW);
    expect(r.supply.p).toBeLessThanOrEqual(3000 + 5);
    expect(r.supply.p).toBeGreaterThan(2900);
  });

  it('in modalità fissa assorbe sempre la potenza impostata, anche oltre il contratto', () => {
    const { p, id } = demo('fissa', 0);
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.evse!.get(id)!.setW).toBe(3700);
    expect(r.supply.p).toBeGreaterThan(3000);
  });
});
