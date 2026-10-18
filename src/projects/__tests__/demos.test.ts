import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { checkWiring } from '../../graph/erc';
import { runRules } from '../../rules/engine';
import { DEMO_PROJECTS } from '../demos';

describe('progetti predefiniti', () => {
  it('sono almeno quattro', () => expect(DEMO_PROJECTS.length).toBeGreaterThanOrEqual(4));

  for (const d of DEMO_PROJECTS) {
    it(`${d.name}: nessun errore di cablaggio, tutti gli utilizzatori alimentati con le protezioni chiuse`, () => {
      const p = d.build();
      expect(checkWiring(p).filter((i) => i.severity === 'errore')).toEqual([]);
      for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
      const r = simulate(p);
      if (!r.ok) throw new Error(r.reason);
      for (const c of p.components) {
        if (c.params.kind !== 'load') continue;
        expect(r.loads.get(c.id)!.energized, c.params.p.name).toBe(true);
      }
      expect(r.alerts.filter((a) => a.severity === 'errore')).toEqual([]);
      const rep = runRules(d.build());
      expect(rep.outcomes.filter((o) => o.status === 'errore').map((o) => `${o.ruleId} ${o.subject}: ${o.message}`)).toEqual([]);
    });
  }
});
