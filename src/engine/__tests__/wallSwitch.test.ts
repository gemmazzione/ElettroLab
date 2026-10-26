import { describe, expect, it } from 'vitest';
import { checkWiring } from '../../graph/erc';
import { buildSingleLine } from '../../diagram/singleLine';
import type { Project } from '../../model/types';
import { comandiLuce } from '../../projects/demos';
import { simulate } from '../simulate';

function demo(): Project {
  const p = comandiLuce();
  for (const c of p.components) if (c.label === 'Q1' || c.label === 'Q2') c.closed = true;
  return p;
}
const byLabel = (p: Project, l: string) => p.components.find((c) => c.label === l)!;
const lampOn = (p: Project, name: string) => {
  const r = simulate(p);
  if (!r.ok) throw new Error(r.reason);
  const l = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === name)!;
  return r.loads.get(l.id)!.energized;
};

describe('comandi luce', () => {
  it('la luce del corridoio cambia stato da ciascuno dei tre punti', () => {
    const p = demo();
    let state = lampOn(p, 'Luce corridoio');
    for (const label of ['S1', 'S2', 'S3', 'S2', 'S1']) {
      const s = byLabel(p, label);
      s.closed = !s.closed;
      const now = lampOn(p, 'Luce corridoio');
      expect(now, `dopo ${label}`).toBe(!state);
      state = now;
    }
  });

  it('l\'interruttore della camera accende e spegne solo la sua luce', () => {
    const p = demo();
    expect(lampOn(p, 'Luce camera')).toBe(false);
    byLabel(p, 'S4').closed = true;
    expect(lampOn(p, 'Luce camera')).toBe(true);
  });

  it('nessun errore di cablaggio; le lampade sono collegate ai loro magnetotermici nello schema unifilare', () => {
    const p = demo();
    expect(checkWiring(p).filter((i) => i.severity === 'errore')).toEqual([]);
    const sl = buildSingleLine(p)!;
    expect(sl.orphans).toEqual([]);
    for (const n of sl.nodes.filter((x) => x.kind === 'load')) {
      const parent = sl.nodes.find((x) => x.children.includes(n))!;
      expect(['Q1', 'Q2']).toContain(parent.comp.label);
    }
  });
});
