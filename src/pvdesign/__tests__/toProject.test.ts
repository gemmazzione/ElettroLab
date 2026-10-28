import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { checkWiring } from '../../graph/erc';
import { INVERTERS } from '../data';
import { defaultDesign } from '../design';
import { designToProject } from '../toProject';

describe('progetto del laboratorio dal progetto fotovoltaico', () => {
  it('riporta generatore, inverter, cavi e protezione e simula senza errori di cablaggio', () => {
    const d = { ...defaultDesign(), modulesPerString: 9, strings: 2, inverter: { ...INVERTERS.find((i) => i.id === 'i6')! } };
    d.cables.dcLengthM = 30;
    const p = designToProject(d);
    const arr = p.components.find((c) => c.params.kind === 'pv-array')!;
    expect(arr.params.kind === 'pv-array' && arr.params.p.strings).toBe(2);
    const qfv = p.components.find((c) => c.label === 'QFV')!;
    expect(qfv.params.kind === 'rcbo' && qfv.params.p.in).toBe(32);
    expect(p.wires.some((w) => w.length === 30)).toBe(true);
    expect(checkWiring(p).filter((i) => i.severity === 'errore')).toEqual([]);
    for (const c of p.components) if (c.label === 'Q1') c.closed = true;
    const r = simulate(p);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const inv = [...r.inverters.values()][0]!;
      expect(inv.pac).toBeGreaterThan(3000);
    }
  });
});
