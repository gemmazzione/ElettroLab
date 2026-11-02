// Analisi economiche intorno al calcolo principale: agevolazioni a confronto, scenari, finanziamento,
// bolletta mese per mese e potenza del contatore con i nuovi carichi.

import { computeEconomics, EV_KWH_PER_KM, type Bands, type Economics, type YieldResult } from './calc';
import { deductionRate, type PvDesign } from './design';

const withEcon = (d: PvDesign, patch: Partial<PvDesign['economics']>): PvDesign => ({ ...d, economics: { ...d.economics, ...patch } });

// ------------------------------------------------------------------ agevolazioni a confronto

export interface IncentiveOption {
  id: string;
  label: string;
  note: string;
  /** Opzione scelta ora nel progetto */
  current: boolean;
  /** Spesa iniziale al netto del contributo [€] */
  upfront: number;
  /** Detrazione recuperata [€] */
  deduction: number;
  /** Incentivo CER nei 20 anni [€] */
  cer20: number;
  paybackYears: number | null;
  npv: number;
}

/** Le strade possibili per lo stesso impianto: detrazione con le varie aliquote, comunità energetica, contributo PNRR. */
export function incentiveOptions(d: PvDesign, y: YieldResult): IncentiveOption[] {
  const e = d.economics;
  const main = deductionRate('2026', e.mainHome);
  const later = deductionRate('2027', e.mainHome);
  const variants: { id: string; label: string; note: string; patch: Partial<PvDesign['economics']> }[] = [
    { id: 'none', label: 'Nessuna agevolazione', note: 'Solo risparmio in bolletta ed energia venduta', patch: { deductionPct: 0, cer: false, grantPct: 0 } },
    { id: 'ded', label: `Detrazione ${main}%`, note: `Spesa nel 2026${e.mainHome ? ', abitazione principale' : ''}`, patch: { deductionPct: main, cer: false, grantPct: 0 } },
    { id: 'ded27', label: `Detrazione ${later}%`, note: 'Spesa nel 2027 con la legge in vigore', patch: { deductionPct: later, cer: false, grantPct: 0 } },
    { id: 'dedcer', label: `Detrazione ${main}% + CER`, note: 'Si sommano: tariffa sull\'energia condivisa per 20 anni', patch: { deductionPct: main, cer: true, grantPct: 0 } },
    { id: 'pnrr', label: 'CER + contributo PNRR 40%', note: 'Comuni fino a 50.000 abitanti, se lo sportello è aperto: niente detrazione, tariffa CER dimezzata', patch: { deductionPct: 0, cer: true, grantPct: 40 } },
  ];
  return variants.map((v) => {
    const ec = computeEconomics(withEcon(d, v.patch), y);
    const p = { ...e, ...v.patch };
    return {
      id: v.id,
      label: v.label,
      note: v.note,
      current: p.deductionPct === e.deductionPct && p.cer === e.cer && p.grantPct === e.grantPct,
      upfront: ec.total - ec.grant,
      deduction: ec.deductionUsed,
      cer20: ec.firstYearCer * Math.min(20, e.years),
      paybackYears: ec.paybackYears,
      npv: ec.npv,
    };
  });
}

// ------------------------------------------------------------------ scenari

export interface Scenario {
  id: 'prudente' | 'atteso' | 'ottimista';
  label: string;
  note: string;
  economics: Economics;
}

/** Produzione e consumi propri scalati (anni meno soleggiati o più soleggiati). */
function scaleYield(y: YieldResult, k: number): YieldResult {
  const self = y.bands.self.map((v) => v * k) as Bands;
  return {
    ...y,
    productionKWh: y.productionKWh * k,
    selfKWh: y.selfKWh * k,
    exportKWh: y.exportKWh * k,
    importKWh: y.importKWh + y.selfKWh * (1 - k),
    bands: { load: y.bands.load, self, import: y.bands.load.map((v, i) => v - self[i]!) as Bands },
  };
}

/** Il rientro con ipotesi più prudenti e più favorevoli su prezzi, rincari e produzione. */
export function scenarios(d: PvDesign, y: YieldResult): Scenario[] {
  const e = d.economics;
  const prices = (k: number): Partial<PvDesign['economics']> => ({
    importPrice: e.importPrice * k,
    exportPrice: e.exportPrice * k,
    bandPrices: e.bandPrices.map((p) => p * k) as [number, number, number],
  });
  return [
    {
      id: 'prudente',
      label: 'Prudente',
      note: 'energia −20%, nessun rincaro, produzione −10%',
      economics: computeEconomics(withEcon(d, { ...prices(0.8), energyInflationPct: 0 }), scaleYield(y, 0.9)),
    },
    { id: 'atteso', label: 'Atteso', note: 'le ipotesi del progetto', economics: computeEconomics(d, y) },
    {
      id: 'ottimista',
      label: 'Favorevole',
      note: `energia +15%, rincaro ${e.energyInflationPct + 1}% all'anno, produzione +5%`,
      economics: computeEconomics(withEcon(d, { ...prices(1.15), energyInflationPct: e.energyInflationPct + 1 }), scaleYield(y, 1.05)),
    },
  ];
}

// ------------------------------------------------------------------ finanziamento

export interface LoanPlan {
  financed: number;
  monthly: number;
  interest: number;
  /** Risparmio medio al mese del primo anno (bolletta, energia venduta, CER, rata della detrazione) [€] */
  monthlyBenefit: number;
  /** Saldo cumulato anno per anno, con il prestito */
  cashflow: { year: number; cumulative: number }[];
  paybackYears: number | null;
}

/** Rata costante (ammortamento alla francese) e saldo con il prestito. */
export function loanPlan(e: PvDesign['economics'], ec: Economics): LoanPlan {
  const financed = Math.max(0, (ec.total - ec.grant) * (Math.min(100, Math.max(0, e.loan.pct)) / 100));
  const n = Math.max(1, Math.round(e.loan.years * 12));
  const r = e.loan.tanPct / 100 / 12;
  const monthly = financed === 0 ? 0 : r > 0 ? (financed * r) / (1 - (1 + r) ** -n) : financed / n;
  const cashflow: LoanPlan['cashflow'] = [];
  let cum = ec.grant - ec.total + financed;
  let payback: number | null = null;
  cashflow.push({ year: 0, cumulative: cum });
  for (const c of ec.cashflow.slice(1)) {
    const months = Math.max(0, Math.min(12, n - (c.year - 1) * 12));
    const flow = c.flow - months * monthly;
    const prev = cum;
    cum += flow;
    if (payback === null && cum >= 0 && flow > 0) payback = c.year - 1 + (prev < 0 ? -prev / flow : 0);
    cashflow.push({ year: c.year, cumulative: cum });
  }
  return {
    financed,
    monthly,
    interest: monthly * n - financed,
    monthlyBenefit: (ec.cashflow[1]?.flow ?? 0) / 12,
    cashflow,
    paybackYears: payback,
  };
}

// ------------------------------------------------------------------ bolletta mese per mese

export interface MonthBill {
  before: number;
  after: number;
}

/**
 * Spesa per l'energia di ogni mese senza e con l'impianto (solo la parte a consumo, con il prezzo medio dell'anno),
 * al netto dell'energia venduta e dell'incentivo CER.
 */
export function monthlyBills(d: PvDesign, y: YieldResult, ec: Economics): MonthBill[] {
  const sum = (b: Bands) => b[0] + b[1] + b[2];
  const loadK = sum(y.bands.load);
  const impK = sum(y.bands.import);
  const before = loadK > 0 ? ec.billBefore / loadK : d.economics.importPrice;
  const imp = impK > 0 ? (ec.billAfter + ec.firstYearExport) / impK : before;
  const cerPerKWh = y.exportKWh > 0 ? ec.firstYearCer / y.exportKWh : 0;
  return y.months.map((m) => ({
    before: m.consumptionKWh * before,
    after: m.importKWh * imp - m.exportKWh * (d.economics.exportPrice + cerPerKWh),
  }));
}

// ------------------------------------------------------------------ potenza del contatore

/** Costi 2026 per l'aumento di potenza (delibera ARERA 575/2025/R/eel), IVA esclusa. */
export const POWER_COSTS = { perKWUpTo6: 62.3, perKWOver6: 78.81, paperwork: 23, perKWYear: 23.72 } as const;
/** Picco contemporaneo stimato degli elettrodomestici di casa [kW] */
const HOUSE_PEAK_KW = 2.5;
/** Ricarica lenta dell'auto da una presa domestica o wallbox a 10 A [kW] */
const EV_CHARGE_KW = 2.3;

export interface PowerAdvice {
  items: { label: string; kW: number }[];
  /** Potenza che si può assorbire nello stesso momento [kW] */
  peakKW: number;
  /** Potenza impegnata consigliata [kW] (il contatore tollera il 10% in più) */
  suggestedKW: number;
  /** Serve un aumento */
  raise: boolean;
  oneOff: number;
  yearlyExtra: number;
}

const STEPS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Basta la potenza del contatore con pompa di calore e auto elettrica? Stima indicativa del picco. */
export function powerAdvice(c: PvDesign['consumption']): PowerAdvice | null {
  const measuredPeak = c.measured ? Math.max(...c.measured.flat()) : 0;
  const items: PowerAdvice['items'] = [{ label: c.measured && measuredPeak > HOUSE_PEAK_KW ? 'Casa (dai consumi misurati)' : 'Elettrodomestici accesi insieme', kW: Math.max(HOUSE_PEAK_KW, measuredPeak) }];
  // Pompa di calore: potenza elettrica dai kWh annui, con circa 1.200 ore equivalenti di funzionamento.
  if (c.heatPumpKWh > 0) items.push({ label: 'Pompa di calore', kW: Math.min(4, Math.max(1, c.heatPumpKWh / 1200)) });
  if (c.evKm > 0) items.push({ label: `Ricarica dell'auto (${Math.round(c.evKm * EV_KWH_PER_KM)} kWh all'anno)`, kW: EV_CHARGE_KW });
  if (items.length === 1 && !c.measured) return null;
  const peakKW = items.reduce((a, x) => a + x.kW, 0);
  const suggestedKW = STEPS.find((s) => s * 1.1 >= peakKW) ?? Math.ceil(peakKW);
  const raise = suggestedKW > c.contractKW;
  const delta = raise ? suggestedKW - c.contractKW : 0;
  return {
    items,
    peakKW,
    suggestedKW,
    raise,
    // Il contributo per kW dipende dalla potenza finale: fino a 6 kW o oltre.
    oneOff: raise ? delta * (suggestedKW <= 6 ? POWER_COSTS.perKWUpTo6 : POWER_COSTS.perKWOver6) + POWER_COSTS.paperwork : 0,
    yearlyExtra: delta * POWER_COSTS.perKWYear,
  };
}
