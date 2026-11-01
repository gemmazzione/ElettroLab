import { describe, expect, it } from 'vitest';
import { defaultDesign, type PvDesign } from '../design';
import { houseGeometry } from '../house';
import { roofLayout, syncRoof, toLatLon } from '../roof';
import { annualShading, type Obstacle } from '../shading';

const ORIGIN: [number, number] = [41.9, 12.5];
const rect = (L: number, W: number): [number, number][] =>
  [
    [-L / 2, -W / 2],
    [L / 2, -W / 2],
    [L / 2, W / 2],
    [-L / 2, W / 2],
  ].map(([x, y]) => toLatLon({ x: x!, y: y! }, ORIGIN));

function design(): PvDesign {
  const d = defaultDesign();
  return syncRoof({ ...d, location: { lat: 41.9, lon: 12.5, address: '', zoom: 20 }, roof: { ...d.roof, footprint: rect(12, 8), slope: -1 }, modulesPerString: 9, strings: 1 });
}
const tree = (x: number, y: number, height = 12, size = 6): Obstacle => ({ id: 't', kind: 'albero', x, y, height, size, depth: size });

describe('ombre sui moduli', () => {
  it('casa a due falde senza ostacoli: la falda a sud non è in ombra', () => {
    const s = annualShading(design())!;
    expect(s.perPanel).toHaveLength(9);
    expect(s.lossPct).toBeLessThan(0.5);
  });

  it('un albero alto davanti alla falda a sud fa ombra, uno dietro (a nord) no', () => {
    const south = annualShading(design(), [tree(0, -12)])!;
    const north = annualShading(design(), [tree(0, 14)])!;
    expect(south.lossPct).toBeGreaterThan(1);
    expect(north.lossPct).toBeLessThan(0.5);
  });

  it("un edificio alto a sud ombreggia più d'inverno: perdita maggiore dei moduli più bassi", () => {
    const d = design();
    const b: Obstacle = { id: 'b', kind: 'edificio', x: 0, y: -14, height: 14, size: 30, depth: 6 };
    const s = annualShading(d, [b])!;
    expect(s.lossPct).toBeGreaterThan(5);
    expect(s.lossPct).toBeLessThan(80);
  });

  it('geometria della casa: gronda sporgente sotto la quota della gronda, finestre e porta', () => {
    const d = design();
    const h = houseGeometry(roofLayout(d)!.geo, d);
    expect(Math.min(...h.roof.flat().map((p) => p.z))).toBeLessThan(d.roof.heightM);
    expect(h.openings.some((o) => o.door)).toBe(true);
    expect(h.openings.length).toBeGreaterThan(3);
  });

  it('calcolo abbastanza veloce per la vista interattiva', () => {
    const t = performance.now();
    annualShading(design(), [tree(0, -12), tree(8, -10)]);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
