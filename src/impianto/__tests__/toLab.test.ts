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

describe('Progetta impianto → laboratorio: sottoquadri e SPD', () => {
  it('officina: un pannello per il sottoquadro; negozio con SPD', () => {
    const o = plantToProject(examplePlants().find((e) => e.id === 'officina')!.make());
    expect(o.panels.length).toBe(2);
    const n = examplePlants().find((e) => e.id === 'negozio')!.make();
    n.spd = 'origine';
    const pr = plantToProject(n);
    expect(pr.components.some((c) => c.params.kind === 'spd')).toBe(true);
    expect(checkWiring(pr).filter((i) => i.severity === 'errore')).toEqual([]);
    for (const c of pr.components) if (c.params.kind !== 'load') c.closed = true;
    const r = simulate(pr);
    expect(r.ok).toBe(true);
  });
});

describe('Progetta impianto → laboratorio: pettini', () => {
  it('le linee della stessa sorgente sono collegate con un pettine', () => {
    for (const id of ['appartamento', 'negozio']) {
      const pr = plantToProject(examplePlants().find((e) => e.id === id)!.make());
      expect(pr.wires.some((w) => w.comb), id).toBe(true);
    }
  });
  it('nessun pettine a valle di una protezione oltre 63 A (generale dell\'officina da 100 A)', () => {
    const pr = plantToProject(examplePlants().find((e) => e.id === 'officina')!.make());
    const qg = pr.components.find((c) => c.label === 'QG')!;
    expect(pr.wires.some((w) => w.comb && w.from.startsWith(qg.id))).toBe(false);
  });
});
