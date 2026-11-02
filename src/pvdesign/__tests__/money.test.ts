import { describe, expect, it } from 'vitest';
import { computeDesign, computeEconomics } from '../calc';
import { defaultDesign, deductionRate, type PvDesign } from '../design';
import { incentiveOptions, loanPlan, monthlyBills, powerAdvice, scenarios } from '../money';

const base = () => defaultDesign();
const econ = (d: PvDesign, patch: Partial<PvDesign['economics']>) => ({ ...d, economics: { ...d.economics, ...patch } });

describe('detrazione e contributi', () => {
  it("con poca IRPEF parte della detrazione si perde e il rientro si allunga", () => {
    const d = base();
    const r = computeDesign(d);
    const low = computeEconomics(econ(d, { taxPerYear: 100 }), r.yield);
    expect(r.economics.deductionLost).toBeCloseTo(0, 6);
    expect(low.deductionUsed).toBeCloseTo(100 * d.economics.deductionYears, 6);
    expect(low.deductionLost).toBeGreaterThan(0);
    expect(low.npv).toBeLessThan(r.economics.npv);
  });

  it('il contributo PNRR del 40% riduce la spesa e dimezza la tariffa CER', () => {
    const d = econ(base(), { cer: true, deductionPct: 0 });
    const y = computeDesign(d).yield;
    const no = computeEconomics(d, y);
    const pnrr = computeEconomics(econ(d, { grantPct: 40 }), y);
    expect(pnrr.grant).toBeCloseTo(no.total * 0.4, 6);
    expect(pnrr.firstYearCer).toBeCloseTo(no.firstYearCer / 2, 6);
    expect(pnrr.cashflow[0]!.flow).toBeCloseTo(-no.total * 0.6, 6);
  });

  it('aliquote per anno e tipo di immobile', () => {
    expect(deductionRate('2026', true)).toBe(50);
    expect(deductionRate('2026', false)).toBe(36);
    expect(deductionRate('2027', true)).toBe(36);
    expect(deductionRate('2027', false)).toBe(30);
    expect(deductionRate('2027-manovra', true)).toBe(50);
  });

  it('confronto: la detrazione più alta conviene più di nessuna agevolazione', () => {
    const d = base();
    const o = incentiveOptions(d, computeDesign(d).yield);
    const npv = (id: string) => o.find((x) => x.id === id)!.npv;
    expect(npv('ded')).toBeGreaterThan(npv('ded27'));
    expect(npv('ded27')).toBeGreaterThan(npv('none'));
    expect(npv('dedcer')).toBeGreaterThan(npv('ded'));
    expect(o.find((x) => x.id === 'ded')!.current).toBe(true);
  });
});

describe('scenari e finanziamento', () => {
  it('lo scenario prudente si ripaga dopo quello atteso, il favorevole prima', () => {
    const d = base();
    const [p, a, f] = scenarios(d, computeDesign(d).yield).map((s) => s.economics.paybackYears ?? 99);
    expect(p).toBeGreaterThan(a!);
    expect(a).toBeGreaterThan(f!);
  });

  it('rata alla francese: 10.000 € al 7% in 10 anni', () => {
    const d = base();
    const ec = computeDesign(d).economics;
    const fake = { ...ec, total: 10000, grant: 0 };
    const l = loanPlan({ ...d.economics, loan: { enabled: true, pct: 100, tanPct: 7, years: 10 } }, fake);
    expect(l.monthly).toBeCloseTo(116.11, 1);
    expect(l.interest).toBeCloseTo(116.11 * 120 - 10000, -1);
    expect(l.cashflow[0]!.cumulative).toBeCloseTo(0, 6);
  });
});

describe('bolletta e contatore', () => {
  it('le bollette dei mesi sommano quella annua', () => {
    const d = base();
    const r = computeDesign(d);
    const m = monthlyBills(d, r.yield, r.economics);
    expect(m).toHaveLength(12);
    expect(m.reduce((a, x) => a + x.before, 0)).toBeCloseTo(r.economics.billBefore, 0);
    expect(m.reduce((a, x) => a + x.after, 0)).toBeCloseTo(r.economics.billAfter, 0);
  });

  it('con pompa di calore e auto elettrica 3 kW non bastano', () => {
    const c = { ...base().consumption, heatPumpKWh: 3000, evKm: 12000 };
    const a = powerAdvice(c)!;
    expect(a.raise).toBe(true);
    expect(a.suggestedKW).toBeGreaterThan(6);
    expect(a.oneOff).toBeCloseTo((a.suggestedKW - 3) * 78.81 + 23, 6);
    expect(powerAdvice(base().consumption)).toBeNull();
  });
});
