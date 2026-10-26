import type { InverterParams, PvArrayParams, PvEnvironment } from '../model/types';

/**
 * Modello fotovoltaico SEMPLIFICATO (lato in corrente continua).
 *
 * - Temperatura di cella dal NOCT: Tc = Ta + (NOCT − 20) / 800 × G.
 * - Punto di massima potenza (l'inverter lo insegue con l'MPPT):
 *     P = Pstc × G/1000 × (1 + γP·(Tc − 25))
 *     V_mp ≈ V_mp,stc × (1 + βVoc·(Tc − 25))   (si usa il coefficiente della Voc, approssimazione comune)
 *     I_mp = P / V_mp
 *   La dipendenza logaritmica della tensione dall'irraggiamento è trascurata.
 * - Tensione a vuoto e corrente di cortocircuito con i coefficienti di targa.
 * I valori reali dipendono dal modulo, dall'ombreggiamento, dallo sporco e dal mismatch: il modello serve a ragionare,
 * non a stimare la produzione di un impianto reale.
 */

export const DEFAULT_PV_ENV: PvEnvironment = { irradiance: 1000, ambientC: 25, minAmbientC: -10, maxAmbientC: 40 };

export const pvEnv = (e?: Partial<PvEnvironment>): PvEnvironment => ({ ...DEFAULT_PV_ENV, ...(e ?? {}) });

/** Temperatura di cella [°C]. */
export function cellTemperature(ambientC: number, irradiance: number, noct: number): number {
  return ambientC + ((noct - 20) / 800) * Math.max(0, irradiance);
}

export interface PvOperatingPoint {
  /** Temperatura di cella [°C] */
  tc: number;
  /** Potenza disponibile nel punto di massima potenza [W] */
  pmp: number;
  vmp: number;
  imp: number;
  voc: number;
  isc: number;
  /** Potenza nominale del generatore in condizioni STC [Wp] */
  pstc: number;
}

/** Punto di lavoro del generatore (stringhe uguali) con irraggiamento e temperatura dati. */
export function arrayOperatingPoint(p: PvArrayParams, irradiance: number, ambientC: number): PvOperatingPoint {
  const n = Math.max(1, Math.round(p.modulesPerString));
  const m = Math.max(1, Math.round(p.strings));
  const g = Math.max(0, irradiance);
  const tc = cellTemperature(ambientC, g, p.noct);
  const dT = tc - 25;
  const pstc = p.moduleWp * n * m;
  const voc = g > 0 ? n * p.voc * (1 + (p.tcVoc / 100) * dT) : 0;
  const isc = m * p.isc * (g / 1000) * (1 + (p.tcIsc / 100) * dT);
  const pmp = Math.max(0, pstc * (g / 1000) * (1 + (p.tcPmax / 100) * dT));
  const vmp = g > 0 ? n * p.vmp * (1 + (p.tcVoc / 100) * dT) : 0;
  const imp = vmp > 0 ? pmp / vmp : 0;
  return { tc, pmp, vmp, imp, voc, isc, pstc };
}

/** Tensione a vuoto massima della stringa: cella alla temperatura minima del sito, irraggiamento pieno. */
export function maxStringVoc(p: PvArrayParams, minAmbientC: number): number {
  return Math.round(p.modulesPerString) * p.voc * (1 + (p.tcVoc / 100) * (minAmbientC - 25));
}

export type InverterState =
  | 'produzione'
  | 'notte'
  | 'rete assente'
  | 'dc scollegato'
  | 'polarità invertita'
  | 'tensione dc bassa'
  | 'tensione dc eccessiva'
  | 'sovratensione rete';

export const INVERTER_STATE_TEXT: Record<InverterState, string> = {
  produzione: 'In produzione',
  notte: 'Irraggiamento insufficiente',
  'rete assente': 'Rete assente: non immette (protezione di interfaccia / anti-isola)',
  'dc scollegato': 'Generatore fotovoltaico non collegato',
  'polarità invertita': 'Polarità DC invertita: inverter bloccato',
  'tensione dc bassa': "Tensione DC sotto l'intervallo MPPT",
  'tensione dc eccessiva': "Tensione DC oltre il massimo dell'inverter: ingresso a rischio di danno",
  'sovratensione rete': 'Tensione di rete troppo alta: distacco della protezione di interfaccia',
};

/** Soglie di tensione di rete usate dal modello per il distacco dell'inverter (rapporto con la tensione nominale). */
export const GRID_MIN_RATIO = 0.85;
export const GRID_MAX_RATIO = 1.1;

/**
 * Potenza AC che l'inverter può immettere dato il punto di lavoro DC.
 * Rendimento costante (approssimazione) e limitazione alla potenza nominale (clipping).
 */
export function inverterOutput(
  inv: InverterParams,
  op: PvOperatingPoint,
  dcLossOhm: number,
): { state: InverterState | null; pdc: number; pac: number; clipped: boolean; dcLossW: number } {
  if (op.voc > inv.maxDcV) return { state: 'tensione dc eccessiva', pdc: 0, pac: 0, clipped: false, dcLossW: 0 };
  if (op.pmp <= 1) return { state: 'notte', pdc: 0, pac: 0, clipped: false, dcLossW: 0 };
  if (op.vmp < inv.mpptMinV) return { state: 'tensione dc bassa', pdc: 0, pac: 0, clipped: false, dcLossW: 0 };
  // Oltre il massimo dell'MPPT l'inverter lavora a tensione limitata: produzione ridotta (stima prudente).
  const derate = op.vmp > inv.mpptMaxV ? inv.mpptMaxV / op.vmp : 1;
  // Corrente DC limitata dall'ingresso dell'inverter.
  const idc = Math.min(op.imp, inv.maxDcA);
  const dcLossW = idc * idc * dcLossOhm;
  const pdc = Math.max(0, Math.min(op.pmp * derate, op.vmp * idc) - dcLossW);
  const pacAvail = pdc * (inv.efficiency / 100);
  const pac = Math.min(pacAvail, inv.pacW);
  return { state: null, pdc, pac, clipped: pacAvail > inv.pacW + 0.5, dcLossW };
}

// ------------------------------------------------------------------ giornata tipo

export interface DayPoint {
  hour: number;
  irradiance: number;
  pv: number;
  load: number;
  /** Potenza scambiata con la rete: > 0 prelievo, < 0 immissione [W] */
  grid: number;
  /** Stato di carica della batteria [kWh] */
  soc: number;
}

export interface DaySummary {
  points: DayPoint[];
  producedKWh: number;
  consumedKWh: number;
  selfConsumedKWh: number;
  exportedKWh: number;
  importedKWh: number;
  /** Quota della produzione consumata in casa (autoconsumo) */
  selfConsumptionPct: number;
  /** Quota dei consumi coperta dal fotovoltaico (autosufficienza) */
  selfSufficiencyPct: number;
}

/**
 * Giornata tipo serena: irraggiamento a campana tra alba e tramonto con il valore di picco indicato,
 * consumo costante dato (utilizzatori accesi), passo di 15 minuti. Con l'accumulo la batteria si carica
 * con l'eccedenza e si scarica per coprire i consumi (rendimento di andata e ritorno 90%, valore indicativo).
 */
export function dayProfile(
  arr: PvArrayParams[],
  inv: InverterParams,
  env: PvEnvironment,
  loadW: (hour: number) => number,
  opts: { sunrise?: number; sunset?: number; peak?: number } = {},
): DaySummary {
  const sunrise = opts.sunrise ?? 6;
  const sunset = opts.sunset ?? 18;
  const peak = opts.peak ?? env.irradiance;
  const step = 0.25;
  const capWh = inv.batteryKWh * 1000;
  const eta = 0.9;
  let soc = capWh * 0.2;
  const points: DayPoint[] = [];
  let prod = 0;
  let cons = 0;
  let self = 0;
  let exp = 0;
  let imp = 0;
  for (let h = 0; h < 24; h += step) {
    const mid = h + step / 2;
    const g = mid > sunrise && mid < sunset ? peak * Math.sin((Math.PI * (mid - sunrise)) / (sunset - sunrise)) : 0;
    // Temperatura ambiente: minima all'alba, massima nel primo pomeriggio (andamento semplificato).
    const ta = env.ambientC - 5 * Math.cos((Math.PI * (mid - 3)) / 12);
    let pv = 0;
    for (const a of arr) {
      const out = inverterOutput(inv, arrayOperatingPoint(a, g, ta), 0);
      pv += out.pac;
    }
    pv = Math.min(pv, inv.pacW);
    const load = loadW(mid);
    let net = load - pv; // > 0 manca energia, < 0 eccedenza
    if (capWh > 0) {
      if (net < 0) {
        const charge = Math.min(-net, inv.batteryW, (capWh - soc) / (step * eta));
        soc += charge * step * eta;
        net += charge;
      } else if (net > 0) {
        const discharge = Math.min(net, inv.batteryW, soc / step);
        soc -= discharge * step;
        net -= discharge;
      }
    }
    prod += pv * step;
    cons += load * step;
    self += Math.min(pv, load) * step;
    if (net > 0) imp += net * step;
    else exp += -net * step;
    points.push({ hour: h, irradiance: g, pv, load, grid: net, soc: soc / 1000 });
  }
  const kwh = (wh: number) => wh / 1000;
  // Con l'accumulo l'energia autoconsumata comprende anche quella passata dalla batteria.
  const selfTotal = cons - imp;
  return {
    points,
    producedKWh: kwh(prod),
    consumedKWh: kwh(cons),
    selfConsumedKWh: kwh(capWh > 0 ? selfTotal : self),
    exportedKWh: kwh(exp),
    importedKWh: kwh(imp),
    selfConsumptionPct: prod > 0 ? ((capWh > 0 ? selfTotal : self) / prod) * 100 : 0,
    selfSufficiencyPct: cons > 0 ? ((cons - imp) / cons) * 100 : 0,
  };
}

// ------------------------------------------------------------------ verifiche di dimensionamento

export interface PvCheck {
  id: string;
  title: string;
  ok: boolean | null;
  detail: string;
}

const f = (v: number, d = 0) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Verifiche tecniche stringa-inverter basate sui dati di targa (non sono prescrizioni normative). */
export function stringChecks(a: PvArrayParams, inv: InverterParams, env: PvEnvironment): PvCheck[] {
  const n = Math.round(a.modulesPerString);
  const vocMax = maxStringVoc(a, env.minAmbientC);
  const tcHot = cellTemperature(env.maxAmbientC, 1000, a.noct);
  const tcCold = cellTemperature(env.minAmbientC, 1000, a.noct);
  const vmpHot = n * a.vmp * (1 + (a.tcVoc / 100) * (tcHot - 25));
  const vmpCold = n * a.vmp * (1 + (a.tcVoc / 100) * (tcCold - 25));
  const iscMax = a.strings * a.isc * (1 + (a.tcIsc / 100) * (tcHot - 25));
  const pstc = a.moduleWp * n * a.strings;
  const ratio = pstc / inv.pacW;
  return [
    {
      id: 'voc-max',
      title: 'Tensione a vuoto massima ≤ massima tensione DC dell\'inverter',
      ok: vocMax <= inv.maxDcV,
      detail: `${n} × ${f(a.voc, 1)} V × (1 ${a.tcVoc < 0 ? '−' : '+'} ${f(Math.abs(a.tcVoc), 2)}% × (${f(env.minAmbientC)} − 25) °C) = ${f(vocMax)} V ${vocMax <= inv.maxDcV ? '≤' : '>'} ${f(inv.maxDcV)} V. Con il freddo la tensione sale: è il caso critico.`,
    },
    {
      id: 'vmp-min',
      title: 'Tensione MPP con cella calda ≥ minimo MPPT',
      ok: vmpHot >= inv.mpptMinV,
      detail: `Cella a ${f(tcHot)} °C (ambiente ${f(env.maxAmbientC)} °C, 1000 W/m²): ${f(vmpHot)} V ${vmpHot >= inv.mpptMinV ? '≥' : '<'} ${f(inv.mpptMinV)} V.`,
    },
    {
      id: 'vmp-max',
      title: 'Tensione MPP con cella fredda ≤ massimo MPPT',
      ok: vmpCold <= inv.mpptMaxV,
      detail: `Cella a ${f(tcCold)} °C: ${f(vmpCold)} V ${vmpCold <= inv.mpptMaxV ? '≤' : '>'} ${f(inv.mpptMaxV)} V. Oltre il massimo l'inseguitore non lavora nel punto ottimale.`,
    },
    {
      id: 'isc-max',
      title: 'Corrente di cortocircuito ≤ massima corrente DC in ingresso',
      ok: iscMax <= inv.maxDcA,
      detail: `${a.strings} × ${f(a.isc, 2)} A corretta per la temperatura = ${f(iscMax, 2)} A ${iscMax <= inv.maxDcA ? '≤' : '>'} ${f(inv.maxDcA)} A.`,
    },
    {
      id: 'dc-ac',
      title: 'Rapporto potenza DC / AC',
      ok: ratio >= 0.8 && ratio <= 1.3 ? true : null,
      detail: `${f(pstc)} Wp / ${f(inv.pacW)} W = ${f(ratio, 2)}. Valori tra circa 0,8 e 1,3 sono comuni (indicazione di massima, non una regola): sopra, l'inverter limita la potenza nelle ore migliori; sotto, è sovradimensionato.`,
    },
  ];
}
