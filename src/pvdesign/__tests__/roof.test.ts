import { describe, expect, it } from 'vitest';
import { computeDesign } from '../calc';
import { MODULES, SITES } from '../data';
import { defaultDesign, type PvDesign } from '../design';
import { climateFromLatitude, layoutPanels, minAreaRect, roofCapacity, roofGeometry, sunPosition, syncRoof, toLatLon, toLocal, type RoofSpec } from '../roof';

const ORIGIN: [number, number] = [41.9, 12.5];
/** Rettangolo L × W [m] ruotato di `deg` gradi, come punti [lat, lon]. */
function rect(L: number, W: number, deg: number): [number, number][] {
  const a = (deg * Math.PI) / 180;
  const pts = [
    [-L / 2, -W / 2],
    [L / 2, -W / 2],
    [L / 2, W / 2],
    [-L / 2, W / 2],
  ];
  return pts.map(([x, y]) => toLatLon({ x: x! * Math.cos(a) - y! * Math.sin(a), y: x! * Math.sin(a) + y! * Math.cos(a) }, ORIGIN));
}
const roof = (patch: Partial<RoofSpec> = {}): RoofSpec => ({ footprint: rect(12, 8, 0), type: 'due-falde', pitch: 20, heightM: 6, slope: 0, setbackM: 0.4, orientation: 'verticale', ...patch });

describe('tetto disegnato sul satellite', () => {
  it('rettangolo di area minima di una pianta ruotata', () => {
    const r = minAreaRect(toLocal(rect(12, 8, 30)));
    expect(r.length).toBeCloseTo(12, 1);
    expect(r.width).toBeCloseTo(8, 1);
    expect(Math.abs(Math.cos(r.angle - (30 * Math.PI) / 180))).toBeCloseTo(1, 3);
  });

  it('tetto a capanna con colmo est-ovest: una falda a sud e una a nord', () => {
    const g = roofGeometry(roof(), 30)!;
    expect(g.footprintM2).toBeCloseTo(96, 0);
    const az = g.slopes.map((s) => Math.round(s.azimuth)).sort((a, b) => a - b);
    expect(az).toEqual([0, 180]);
    expect(g.rise).toBeCloseTo(4 * Math.tan((20 * Math.PI) / 180), 3);
  });

  it('padiglione: due trapezi e due triangoli', () => {
    const g = roofGeometry(roof({ type: 'padiglione' }), 30)!;
    expect(g.slopes).toHaveLength(4);
    expect(g.slopes.filter((s) => s.top === 0)).toHaveLength(2);
    expect(g.slopes.find((s) => s.top > 0)!.top).toBeCloseTo(4, 3);
  });

  it('posa: sulla falda a sud di 12 × 4,26 m stanno 1 fila da 9 moduli, 2 file con 30 cm dai bordi', () => {
    const g = roofGeometry(roof(), 30)!;
    const south = g.slopes.find((s) => Math.abs(s.azimuth) < 1)!;
    const l = layoutPanels(south, roof(), MODULES[1]!, 41.9, false);
    expect(l.panels).toHaveLength(9);
    expect(layoutPanels(south, roof({ setbackM: 0.3 }), MODULES[1]!, 41.9, false).panels).toHaveLength(18);
    expect(l.slopeM2).toBeCloseTo(12 * (4 / Math.cos((20 * Math.PI) / 180)), 1);
  });

  it('tetto piano: le file sono distanziate per non farsi ombra a dicembre', () => {
    const r = roof({ type: 'piano', footprint: rect(12, 10, 0) });
    const g = roofGeometry(r, 30)!;
    const l = layoutPanels(g.slopes[0]!, r, MODULES[1]!, 41.9, true);
    expect(Math.round(g.slopes[0]!.azimuth)).toBe(0);
    expect(l.winterSunDeg).toBeCloseTo(24.65, 1);
    expect(l.rowPitch).toBeGreaterThan(3);
    expect(l.panels.length).toBeGreaterThan(0);
  });

  it('il progetto prende latitudine, clima, inclinazione e orientamento dal tetto', () => {
    const d: PvDesign = { ...defaultDesign(), location: { lat: 45.46, lon: 9.19, address: 'Milano', zoom: 19 }, roof: { ...roof(), footprint: rect(12, 8, 90) } };
    d.site = { ...d.site, presetId: 'auto' };
    const s = syncRoof(d);
    expect(s.site.latitude).toBeCloseTo(45.46, 2);
    expect(s.site.hDay[6]).toBeCloseTo(SITES[0]!.hDay[6]!, 0);
    expect(s.site.tilt).toBe(20);
    // colmo nord-sud: falde verso est e ovest
    expect(Math.abs(s.site.azimuth)).toBe(90);
    expect(roofCapacity(s)).toBeGreaterThan(0);
    expect(computeDesign(s).checks.some((c) => c.id === 'roof-fit')).toBe(true);
  });

  it('clima dalla latitudine: coincide con le zone di riferimento', () => {
    expect(climateFromLatitude(41.9).hDay).toEqual(SITES[1]!.hDay);
    const mid = climateFromLatitude(43.7);
    expect(mid.hDay[6]!).toBeLessThan(SITES[1]!.hDay[6]!);
    expect(mid.hDay[6]!).toBeGreaterThan(SITES[0]!.hDay[6]!);
  });

  it('posizione del sole: mezzogiorno all\'equinozio', () => {
    const s = sunPosition(42, 80, 12);
    expect(s.elevation).toBeCloseTo(48, 0);
    expect(Math.abs(s.azimuth)).toBeLessThan(0.5);
    expect(sunPosition(42, 80, 15).azimuth).toBeGreaterThan(0);
  });
});
