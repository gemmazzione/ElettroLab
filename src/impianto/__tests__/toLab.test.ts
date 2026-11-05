import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { checkWiring } from '../../graph/erc';
import { examplePlants } from '../model';
import { plantToProject } from '../toLab';

describe('Progetta impianto → laboratorio', () => {
  for (const e of examplePlants().filter((x) => x.id !== 'vuoto')) {
    it(`${e.title}: cablaggio corretto e utilizzatori alimentati`, () => {
      const p = plantToProject(e.make());
      expect(checkWiring(p).filter((i) => i.severity === 'errore').map((i) => i.message)).toEqual([]);
      for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
      const r = simulate(p);
      if (!r.ok) throw new Error(r.reason);
      for (const c of p.components) if (c.params.kind === 'load') expect(r.loads.get(c.id)!.energized, c.params.p.name).toBe(true);
      expect(r.alerts.filter((a) => a.severity === 'errore').map((a) => a.message)).toEqual([]);
    });
  }
});
