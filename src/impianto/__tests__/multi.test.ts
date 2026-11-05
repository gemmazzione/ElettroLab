import { describe, expect, it } from 'vitest';
import { computePlant } from '../calc';
import { examplePlants } from '../model';
import { multiLine } from '../multifilare';

describe('schema multifilare', () => {
  for (const e of examplePlants()) {
    it(`${e.title}: un tratto per ogni conduttore e il PE fino a ogni utilizzatore`, () => {
      const p = e.make();
      const r = computePlant(p);
      for (const b of r.boards) {
        const d = multiLine(p, r, b.id);
        const pe = d.prims.filter((x) => x.t === 'line' && x.wire === 'PE');
        expect(pe.length).toBe(b.lines.length + 1);
        expect(d.prims.some((x) => x.t === 'line' && x.wire === 'N')).toBe(true);
      }
    });
  }
});
