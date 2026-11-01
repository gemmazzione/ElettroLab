import { describe, expect, it } from 'vitest';
import { bandFractions, computeDesign, computeYield, EV_KWH_PER_KM, generatorChecks, moduleCount } from '../calc';
import { INVERTERS } from '../data';
import { defaultDesign, type PvDesign } from '../design';
import { sunPosition, syncRoof, toLatLon } from '../roof';
import { annualShading, stringPower } from '../shading';
import type { Weather } from '../weather';

/** Anno tipo sintetico di prova: cielo sereno con il modello di Meinel, diffusa al 15%. */
function synthWeather(lat = 41.9, lon = 12.5, horizonDeg = 0): Weather {
  const g: number[] = [];
  const b: number[] = [];
  const dd: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < 8760; i++) {
    const n = Math.floor(i / 24) + 1;
    const sp = sunPosition(lat, n, (i % 24) + 0.5 + lon / 15);
    const el = (Math.max(0, sp.elevation) * Math.PI) / 180;
    const dni = sp.elevation > 0 ? 1000 * Math.pow(0.7, Math.pow(1 / Math.sin(el), 0.678)) : 0;
    const dhi = dni * 0.15 * Math.sin(el);
    b.push(Math.round(dni));
    dd.push(Math.round(dhi));
    g.push(Math.round(dni * Math.sin(el) + dhi));
    t.push(15 + 8 * Math.sin(((n - 110) / 365) * 2 * Math.PI));
  }
  const horizon: [number, number][] = [];
  for (let a = -180; a <= 180; a += 7.5) horizon.push([a, horizonDeg]);
  return { source: 'prova', period: '', lat, lon, g, b, d: dd, t, horizon };
}

describe('motore di calcolo: fasce, due falde, extra, anno tipo', () => {
  it('fasce orarie: ogni ora si ripartisce interamente tra F1, F2, F3', () => {
    for (let h = 0; h < 24; h++) expect(bandFractions(h).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 9);
    expect(bandFractions(12)[0]).toBeCloseTo(5 / 7, 9);
    expect(bandFractions(3)[2]).toBeCloseTo(1, 9);
  });

  it('due falde: moduli sommati, verifiche per falda, serve un inverter con due MPPT', () => {
    const d: PvDesign = { ...defaultDesign(), field2: { ...defaultDesign().field2, enabled: true, modulesPerString: 6, strings: 1, tilt: 20, azimuth: 90 } };
    expect(moduleCount(d)).toBe(8 + 6);
    const checks = generatorChecks(d);
    expect(checks.some((c) => c.id === 'voc-max-1') && checks.some((c) => c.id === 'voc-max-2')).toBe(true);
    expect(checks.find((c) => c.id === 'mppt-fields')!.ok).toBe(true);
    const one = generatorChecks({ ...d, inverter: { ...d.inverter, mppt: 1 } });
    expect(one.find((c) => c.id === 'mppt-fields')!.ok).toBe(false);
    // est-ovest produce meno per kWp del solo sud, ma più energia totale
    const solo = computeYield(defaultDesign());
    const eo = computeYield(d);
    expect(eo.productionKWh).toBeGreaterThan(solo.productionKWh);
    expect(eo.specificYield).toBeLessThan(solo.specificYield);
  });

  it('pompa di calore e auto elettrica si aggiungono ai consumi', () => {
    const d = defaultDesign();
    const base = computeYield(d);
    const more = computeYield({ ...d, consumption: { ...d.consumption, heatPumpKWh: 2000, evKm: 10000, evCharge: 'giorno' } });
    expect(more.consumptionKWh - base.consumptionKWh).toBeCloseTo(2000 + 10000 * EV_KWH_PER_KM, -1);
    expect(more.extrasKWh).toBeCloseTo(2000 + 10000 * EV_KWH_PER_KM, -1);
    expect(more.selfKWh).toBeGreaterThan(base.selfKWh);
  });

  it('anno tipo ora per ora: bilanci energetici e orizzonte che toglie il sole', () => {
    const d = { ...defaultDesign(), site: { ...defaultDesign().site, weather: synthWeather() } };
    const y = computeYield(d);
    expect(y.hourly).toBe(true);
    expect(y.selfKWh + y.importKWh).toBeCloseTo(y.consumptionKWh, -1);
    expect(y.productionKWh).toBeGreaterThan(3000);
    const bandsLoad = y.bands.load.reduce((a, x) => a + x, 0);
    expect(bandsLoad).toBeCloseTo(y.consumptionKWh, -1);
    const hills = computeYield({ ...d, site: { ...d.site, weather: synthWeather(41.9, 12.5, 25) } });
    expect(hills.productionKWh).toBeLessThan(y.productionKWh * 0.9);
  });

  it('fasce con lo stesso prezzo = tariffa unica; la comunità energetica aggiunge l\'incentivo', () => {
    const d = defaultDesign();
    const p = d.economics.importPrice;
    const mono = computeDesign(d).economics;
    const fasce = computeDesign({ ...d, economics: { ...d.economics, tariff: 'fasce', bandPrices: [p, p, p] } }).economics;
    expect(fasce.firstYearSaving).toBeCloseTo(mono.firstYearSaving, 6);
    const cer = computeDesign({ ...d, economics: { ...d.economics, cer: true } }).economics;
    expect(cer.firstYearCer).toBeGreaterThan(0);
    expect(cer.npv).toBeGreaterThan(mono.npv);
  });

  it('ottimizzatori: costano, riducono il disaccoppiamento', () => {
    const d = defaultDesign();
    const a = computeDesign(d);
    const b = computeDesign({ ...d, optimizers: true });
    expect(b.economics.total).toBeGreaterThan(a.economics.total);
    expect(b.economics.lines.some((l) => l.id === 'optimizer')).toBe(true);
  });

  it('effetto stringa: un modulo in ombra frena la stringa senza ottimizzatori', () => {
    expect(stringPower([1, 1, 1, 1])).toBe(4);
    expect(stringPower([1, 1, 1, 0.2])).toBe(3);
    const O: [number, number] = [41.9, 12.5];
    const fp = [[-7, -5], [7, -5], [7, 5], [-7, 5]].map(([x, y]) => toLatLon({ x: x!, y: y! }, O));
    const d = syncRoof({ ...defaultDesign(), location: { lat: 41.9, lon: 12.5, address: '', zoom: 20 }, roof: { ...defaultDesign().roof, footprint: fp, slope: -1 }, modulesPerString: 9, strings: 1 });
    const s = annualShading(d, [{ id: 't', kind: 'albero', x: 5, y: -10, height: 11, size: 5, depth: 5, z0: 0 }])!;
    expect(s.stringLossPct).toBeGreaterThan(s.lossPct);
    // camino a est dei moduli, sulla falda a sud (quota del tetto in quel punto circa 6,7 m)
    const chimney = annualShading(d, [{ id: 'c', kind: 'camino', x: 6.3, y: -3, height: 1.5, size: 0.8, depth: 0.8, z0: 6.7 }])!;
    expect(chimney.lossPct).toBeGreaterThan(0);
  });

  it('due falde sul tetto a capanna: la seconda falda prende l\'altra metà del tetto', () => {
    const O: [number, number] = [41.9, 12.5];
    const fp = [[-7, -5], [7, -5], [7, 5], [-7, 5]].map(([x, y]) => toLatLon({ x: y!, y: x! }, O)); // colmo nord-sud: falde est e ovest
    const base = defaultDesign();
    const d = syncRoof({ ...base, inverter: { ...INVERTERS.find((i) => i.id === 'i46')! }, location: { lat: 41.9, lon: 12.5, address: '', zoom: 20 }, roof: { ...base.roof, footprint: fp, slope: -1 }, field2: { ...base.field2, enabled: true, slope: -1 } });
    expect(Math.abs(d.site.azimuth)).toBe(90);
    expect(Math.abs(d.field2.azimuth)).toBe(90);
    expect(Math.sign(d.field2.azimuth)).toBe(-Math.sign(d.site.azimuth));
  });
});
