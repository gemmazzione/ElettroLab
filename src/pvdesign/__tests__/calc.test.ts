import { describe, expect, it } from 'vitest';
import { computeDesign, extraterrestrialDaily, monthSun, proposeSizing } from '../calc';
import { INVERTERS, SITES } from '../data';
import { defaultDesign } from '../design';

describe('progettazione fotovoltaica', () => {
  it('irraggiamento extraterrestre: valore dei manuali', () => {
    // Duffie & Beckman, esempio 1.10.1: 43° N, 15 aprile (n = 105) → H0 ≈ 33,8 MJ/m² = 9,4 kWh/m²
    expect(extraterrestrialDaily(43, 105)).toBeCloseTo(33.8 / 3.6, 0);
  });

  it('il piano orizzontale restituisce l\'irraggiamento di partenza', () => {
    const s = monthSun(41.9, 5, 6.9, 0, 0, 0.2);
    expect(s.hPoa).toBeCloseTo(6.9, 2);
  });

  it('inclinare verso sud aumenta l\'irraggiamento annuo, verso nord lo riduce', () => {
    const site = SITES[1]!;
    const year = (tilt: number, az: number) => site.hDay.reduce((a, h, m) => a + monthSun(site.latitude, m, h, tilt, az, 0.2).hPoa, 0);
    const flat = year(0, 0);
    expect(year(30, 0) / flat).toBeGreaterThan(1.08);
    expect(year(30, 0) / flat).toBeLessThan(1.2);
    expect(year(30, 180)).toBeLessThan(flat);
    expect(year(30, -90)).toBeLessThan(year(30, 0));
  });

  it('produzione specifica e indice di rendimento in un intervallo plausibile', () => {
    const r = computeDesign(defaultDesign());
    expect(r.yield.specificYield).toBeGreaterThan(1150);
    expect(r.yield.specificYield).toBeLessThan(1550);
    expect(r.yield.pr).toBeGreaterThan(0.72);
    expect(r.yield.pr).toBeLessThan(0.9);
    // bilancio energetico
    const y = r.yield;
    expect(y.selfKWh + y.importKWh).toBeCloseTo(y.consumptionKWh, 0);
    expect(y.selfKWh + y.exportKWh).toBeCloseTo(y.productionKWh, 0);
    const lost = y.losses.reduce((a, l) => a + l.kWh, 0);
    expect(y.idealKWh - lost).toBeCloseTo(y.productionKWh, 0);
  });

  it('la batteria aumenta l\'autoconsumo', () => {
    const d = defaultDesign();
    d.inverter = { ...INVERTERS.find((i) => i.hybrid)! };
    const without = computeDesign(d).yield;
    const withBat = computeDesign({ ...d, batteryKWh: 5 }).yield;
    expect(withBat.selfConsumptionPct).toBeGreaterThan(without.selfConsumptionPct + 10);
    expect(withBat.productionKWh).toBeCloseTo(without.productionKWh, 3);
  });

  it('stringhe in parallelo: fusibili solo oltre il criterio', () => {
    const d = defaultDesign();
    expect(computeDesign({ ...d, strings: 2, inverter: { ...d.inverter, mppt: 1 } }).protection.fusesNeeded).toBe(false);
    expect(computeDesign({ ...d, strings: 4, inverter: { ...d.inverter, mppt: 1, maxDcA: 100 } }).protection.fusesNeeded).toBe(true);
  });

  it('dimensionamento proposto: configurazione valida vicina ai consumi', () => {
    const d = defaultDesign();
    const p = proposeSizing(d, INVERTERS)!;
    expect(p).not.toBeNull();
    const r = computeDesign({ ...d, modulesPerString: p.modulesPerString, strings: p.strings, inverter: INVERTERS.find((i) => i.id === p.inverterId)! });
    expect(r.checks.some((c) => c.ok === false)).toBe(false);
    expect(Math.abs(r.yield.productionKWh - d.consumption.annualKWh) / d.consumption.annualKWh).toBeLessThan(0.15);
  });

  it('costi e ritorno dell\'investimento', () => {
    const r = computeDesign(defaultDesign());
    const e = r.economics;
    expect(e.total).toBeCloseTo(e.subtotal * 1.1, 6);
    expect(e.perKWp).toBeGreaterThan(800);
    expect(e.perKWp).toBeLessThan(3000);
    expect(e.paybackYears).not.toBeNull();
    expect(e.paybackYears!).toBeGreaterThan(2);
    expect(e.paybackYears!).toBeLessThan(15);
    expect(e.cashflow).toHaveLength(26);
  });
});
