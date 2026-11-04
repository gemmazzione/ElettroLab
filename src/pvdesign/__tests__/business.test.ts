import { describe, expect, it } from 'vitest';
import { acCable, acPowerW, batteryOptions, computeDesign, computeEconomics, mpptInputs, peakW, proposeSizing, stringsPerMppt } from '../calc';
import { connectionInfo } from '../connection';
import { INVERTERS, LOAD_PROFILES } from '../data';
import { sunPosition } from '../roof';
import type { Weather } from '../weather';
import { defaultDesign, normalizeDesign, withKind, type PvDesign } from '../design';
import { incentiveOptions } from '../money';
import { buildPvDesignPdf } from '../pdf';

const business = () => withKind(defaultDesign(), 'azienda');
const inv = (id: string) => ({ ...INVERTERS.find((i) => i.id === id)! });

describe('progetto aziendale', () => {
  it('parte con valori da azienda e torna a quelli di casa', () => {
    const d = business();
    expect(d.kind).toBe('azienda');
    expect(d.inverter.phases).toBe(3);
    expect(d.economics.vatPct).toBe(22);
    expect(d.economics.deductionPct).toBe(0);
    expect(d.economics.prices.find((p) => p.id === 'labour')!.price).toBe(300);
    const home = withKind(d, 'casa');
    expect(home.kind).toBe('casa');
    expect(home.inverterCount).toBe(1);
    expect(home.economics.deductionPct).toBe(50);
  });

  it('i progetti salvati prima restano abitazioni con un inverter', () => {
    const old = JSON.parse(JSON.stringify(defaultDesign())) as Partial<PvDesign>;
    delete old.kind;
    delete old.inverterCount;
    const d = normalizeDesign(old);
    expect(d.kind).toBe('casa');
    expect(d.inverterCount).toBe(1);
    expect(d.economics.business.depreciationPct).toBe(9);
  });

  it('più inverter: potenza, ingressi MPPT e stringhe per ingresso si sommano', () => {
    const d: PvDesign = { ...business(), inverter: inv('t50'), inverterCount: 3, modulesPerString: 18, strings: 24 };
    expect(acPowerW(d)).toBe(150000);
    expect(mpptInputs(d)).toBe(12);
    expect(stringsPerMppt(d)).toBe(2);
    expect(computeDesign(d).checks.filter((c) => c.ok === false)).toEqual([]);
  });

  it('linea trifase: corrente a 400 V e sezione fino a 240 mm²', () => {
    const d: PvDesign = { ...business(), inverter: inv('t100'), inverterCount: 1, cables: { ...business().cables, acLengthM: 50 } };
    const ac = acCable(d);
    expect(ac.ib).toBeCloseTo(100000 / (Math.sqrt(3) * 400), 3);
    expect(ac.inA).toBe(160);
    expect(ac.iz!).toBeGreaterThanOrEqual(160);
    expect(ac.dropPct).toBeLessThanOrEqual(1);
    expect(ac.ok).toBe(true);
  });

  it('dimensionamento automatico con inverter trifase che supera le verifiche', () => {
    const d = business();
    const p = proposeSizing(d, INVERTERS)!;
    const out: PvDesign = { ...d, modulesPerString: p.modulesPerString, strings: p.strings, inverter: inv(p.inverterId), inverterCount: p.inverterCount };
    expect(out.inverter.phases).toBe(3);
    expect(computeDesign(out).checks.some((c) => c.ok === false)).toBe(false);
    expect(Math.abs(peakW(out) / 1000 - p.targetKWp) / p.targetKWp).toBeLessThan(0.1);
  });
});

describe('economia d\'impresa', () => {
  it("con l'IVA detraibile il costo è l'imponibile; senza, l'IVA si somma", () => {
    const d = business();
    const y = computeDesign(d).yield;
    const a = computeEconomics(d, y);
    expect(a.vatIncluded).toBe(false);
    expect(a.total).toBeCloseTo(a.subtotal, 6);
    const b = computeEconomics({ ...d, economics: { ...d.economics, business: { ...d.economics.business, vatRecoverable: false } } }, y);
    expect(b.total).toBeCloseTo(a.subtotal * 1.22, 6);
  });

  it('imposte sul risparmio e ammortamento nel primo anno', () => {
    const d = business();
    const y = computeDesign(d).yield;
    const ec = computeEconomics(d, y);
    const t = 0.279;
    const om = d.economics.omPerYear;
    expect(ec.afterTax).toBe(true);
    expect(ec.firstYearTax).toBeCloseTo(t * (ec.firstYearSaving + ec.firstYearExport - om), 6);
    expect(ec.firstYearShield).toBeCloseTo(ec.total * 0.045 * t, 6);
    expect(ec.cashflow[1]!.flow).toBeCloseTo(ec.firstYearSaving + ec.firstYearExport - om - ec.firstYearTax + ec.firstYearShield, 6);
    // In tutta la vita dell'ammortamento si deduce tutto il costo, una sola volta.
    expect(ec.shieldTotal).toBeCloseTo(ec.total * t, 3);
  });

  it("l'iperammortamento aggiunge la maggiorazione solo sull'IRES", () => {
    const d = business();
    const y = computeDesign(d).yield;
    const base = computeEconomics(d, y);
    const hyper = computeEconomics({ ...d, economics: { ...d.economics, business: { ...d.economics.business, hyperPct: 180 } } }, y);
    expect(hyper.hyperTotal).toBeCloseTo(base.total * 1.8 * 0.24, 3);
    expect(hyper.npv).toBeGreaterThan(base.npv);
    const opts = incentiveOptions(d, y);
    expect(opts.map((o) => o.id)).toEqual(['amm', 'iper', 'ipercer', 'pnrr']);
    expect(opts.find((o) => o.id === 'amm')!.current).toBe(true);
  });

  it("l'accumulo di un'azienda è in alternata e si dimensiona sui kWp", () => {
    const d = business();
    const sizes = batteryOptions(d);
    expect(sizes[0]).toBe(0);
    expect(Math.max(...sizes)).toBeGreaterThan(50);
    const withBat = computeDesign({ ...d, batteryKWh: 50 });
    expect(withBat.yield.selfKWh).toBeGreaterThan(computeDesign(d).yield.selfKWh);
  });
});

describe('connessione e pratiche', () => {
  it('soglie: SPI esterna oltre 11,08 kW, officina oltre 20 kW, media tensione oltre 100 kW', () => {
    const small = connectionInfo({ ...business(), inverter: inv('t10'), inverterCount: 1 });
    expect(small.find((x) => x.id === 'spi')!.ok).toBe(true);
    expect(small.some((x) => x.id === 'adm')).toBe(false);
    const mid = connectionInfo({ ...business(), inverter: inv('t50'), inverterCount: 1 });
    expect(mid.find((x) => x.id === 'level')!.summary).toContain('Bassa tensione');
    expect(mid.some((x) => x.id === 'adm')).toBe(true);
    const big = connectionInfo({ ...business(), inverter: inv('t100'), inverterCount: 2 });
    expect(big.find((x) => x.id === 'level')!.summary).toContain('Media tensione');
  });

  it('il listino aggiunge SPI esterna e opere di media tensione quando servono', () => {
    const d: PvDesign = { ...business(), inverter: inv('t100'), inverterCount: 2, modulesPerString: 20, strings: 22 };
    const ids = computeDesign(d).economics.lines.map((l) => l.id);
    expect(ids).toContain('spi');
    expect(ids).toContain('mtWorks');
  });

  it('la relazione PDF di un\'azienda contiene connessione e fiscalità', () => {
    const d = { ...business(), economics: { ...business().economics, business: { ...business().economics.business, hyperPct: 180 } } };
    const doc = buildPvDesignPdf(d, computeDesign(d));
    const text = Array.from({ length: doc.getNumberOfPages() }, (_, i) => (doc.internal as unknown as { pages: string[][] }).pages[i + 1]!.join('\n')).join('\n');
    for (const k of ['Connessione alla rete e pratiche', 'Iperammortamento', 'Ammortamento', "Incentivi, imposte e obblighi per un'azienda"]) expect(text).toContain(k);
  });
});

describe('settimana lavorativa nel calcolo ora per ora', () => {
  /** Anno tipo di prova: cielo sereno (modello di Meinel), diffusa al 15%. */
  function clearSky(lat = 41.9, lon = 12.5): Weather {
    const g: number[] = [];
    const b: number[] = [];
    const dd: number[] = [];
    const t: number[] = [];
    for (let i = 0; i < 8760; i++) {
      const sp = sunPosition(lat, Math.floor(i / 24) + 1, (i % 24) + 0.5 + lon / 15);
      const el = (Math.max(0, sp.elevation) * Math.PI) / 180;
      const dni = sp.elevation > 0 ? 1000 * Math.pow(0.7, Math.pow(1 / Math.sin(el), 0.678)) : 0;
      const dhi = dni * 0.15 * Math.sin(el);
      b.push(dni);
      dd.push(dhi);
      g.push(dni * Math.sin(el) + dhi);
      t.push(15);
    }
    return { source: 'prova', period: '', lat, lon, g, b, d: dd, t, horizon: null };
  }

  it('sabato e domenica ridotti: consumi annui invariati, meno autoconsumo che con tutti i giorni uguali', () => {
    const base = business();
    const d: PvDesign = { ...base, site: { ...base.site, weather: clearSky() }, consumption: { ...base.consumption, profile: 'ufficio', annualKWh: 50000 } };
    const office = computeDesign(d).yield;
    expect(office.hourly).toBe(true);
    expect(office.consumptionKWh / 50000).toBeGreaterThan(0.985);
    expect(office.consumptionKWh / 50000).toBeLessThan(1.015);
    // Stesse ore del giorno feriale ma senza differenze tra i giorni della settimana.
    const flat = computeDesign({ ...d, consumption: { ...d.consumption, profile: 'manuale', customWeights: [...LOAD_PROFILES.ufficio.weights] } }).yield;
    expect(office.selfKWh).toBeLessThan(flat.selfKWh);
  });
});
