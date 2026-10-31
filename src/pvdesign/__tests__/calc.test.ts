import { describe, expect, it } from 'vitest';
import { BATTERY_MIN_KWH_PER_KWH, batteryAdvice, computeDesign, extraterrestrialDaily, monthSun, proposeSizing, withBattery } from '../calc';
import { INVERTERS, SITES } from '../data';
import { defaultDesign, normalizeDesign } from '../design';

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

describe('profilo dei consumi disegnato a mano', () => {
  it('sposta i consumi nelle ore di sole e aumenta l\'autoconsumo, a parità di energia', () => {
    const d = defaultDesign();
    const night = Array.from({ length: 24 }, (_, h) => (h >= 19 || h < 6 ? 1 : 0.05));
    const day = Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 17 ? 1 : 0.05));
    const yn = computeDesign({ ...d, consumption: { ...d.consumption, profile: 'manuale', customWeights: night } }).yield;
    const yd = computeDesign({ ...d, consumption: { ...d.consumption, profile: 'manuale', customWeights: day } }).yield;
    expect(yd.consumptionKWh).toBeCloseTo(yn.consumptionKWh, 3);
    expect(yd.consumptionKWh).toBeCloseTo(d.consumption.annualKWh, 0);
    expect(yd.selfConsumptionPct).toBeGreaterThan(yn.selfConsumptionPct + 20);
  });

  it('profilo vuoto: si usa quello tipico', () => {
    const d = defaultDesign();
    const y0 = computeDesign({ ...d, consumption: { ...d.consumption, profile: 'manuale', customWeights: Array(24).fill(0) } }).yield;
    const yu = computeDesign({ ...d, consumption: { ...d.consumption, profile: 'uniforme' } }).yield;
    expect(y0.selfKWh).toBeCloseTo(yu.selfKWh, 3);
  });
});

describe('accumulo consigliato', () => {
  it('più batteria = più autosufficienza, con rendimenti decrescenti', () => {
    const a = batteryAdvice(defaultDesign());
    const ss = a.options.map((o) => o.selfSufficiencyPct);
    for (let i = 1; i < ss.length; i++) expect(ss[i]!).toBeGreaterThanOrEqual(ss[i - 1]! - 0.01);
    const m = a.options.slice(1).map((o) => o.marginal!);
    expect(m[m.length - 1]!).toBeLessThan(m[0]!);
    expect(a.options[0]!.extraCost).toBe(0);
    expect(a.options[2]!.extraCost).toBeGreaterThan(a.options[1]!.extraCost);
  });

  it('consiglia la capacità più grande ancora ben sfruttata', () => {
    const a = batteryAdvice(defaultDesign());
    expect(a.recommended).toBeGreaterThan(0);
    const rec = a.options.find((o) => o.kWh === a.recommended)!;
    expect(rec.marginal!).toBeGreaterThanOrEqual(BATTERY_MIN_KWH_PER_KWH);
    const next = a.options.find((o) => o.kWh > a.recommended);
    if (next) expect(next.marginal!).toBeLessThan(BATTERY_MIN_KWH_PER_KWH);
  });

  it('con la batteria passa a un inverter ibrido di potenza adeguata', () => {
    const d = defaultDesign();
    const w = withBattery(d, 5);
    expect(w.inverter.hybrid).toBe(true);
    expect(w.inverter.pacW).toBeGreaterThanOrEqual(d.inverter.pacW);
    expect(withBattery(w, 0).batteryKWh).toBe(0);
  });
});

describe('listino dei progetti salvati', () => {
  it('aggiorna i prezzi rimasti ai vecchi predefiniti e conserva quelli cambiati', () => {
    const old = defaultDesign();
    const saved = JSON.parse(JSON.stringify(old));
    delete saved.economics.pricesVersion;
    saved.economics.importPrice = 0.28;
    saved.economics.prices = saved.economics.prices.map((p: { id: string; price: number }) => (p.id === 'battery' ? { ...p, price: 450 } : p.id === 'labour' ? { ...p, price: 600 } : p));
    const n = normalizeDesign(saved);
    expect(n.economics.prices.find((p) => p.id === 'battery')!.price).toBe(750);
    expect(n.economics.prices.find((p) => p.id === 'labour')!.price).toBe(600);
    expect(n.economics.importPrice).toBe(0.4);
    expect(n.economics.pricesVersion).toBe('2026-10');
  });
});
