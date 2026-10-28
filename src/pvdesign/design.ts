import type { InstallMethod } from '../rules/ampacity';
import { DEFAULT_PRICES, INVERTERS, MODULES, SITES, type InverterSpec, type LoadProfileId, type ModuleSpec, type MountingId, type PriceItem } from './data';

/** Dati di un progetto di impianto fotovoltaico (sezione «Progetta FV»). */
export interface PvDesign {
  name: string;
  site: {
    presetId: string;
    latitude: number;
    hDay: number[];
    tMean: number[];
    tMin: number;
    tMax: number;
    /** Inclinazione dei moduli sull'orizzontale [°] */
    tilt: number;
    /** Orientamento: 0 = sud, −90 = est, +90 = ovest [°] */
    azimuth: number;
    /** Riflettanza del suolo (albedo) */
    albedo: number;
    /** Perdita media per ombreggiamento [%] */
    shadingPct: number;
    /** Superficie di copertura disponibile [m²] (0 = non indicata) */
    roofM2: number;
    /** Montaggio dei moduli: influisce sulla temperatura delle celle */
    mounting: MountingId;
  };
  consumption: {
    annualKWh: number;
    profile: LoadProfileId;
    contractKW: number;
  };
  module: ModuleSpec;
  modulesPerString: number;
  strings: number;
  inverter: InverterSpec;
  batteryKWh: number;
  losses: {
    /** Riflessione con il sole obliquo, spettro e basso irraggiamento [%] */
    opticalPct: number;
    soilingPct: number;
    mismatchPct: number;
    availabilityPct: number;
    degradationPct: number;
  };
  cables: {
    /** Lunghezza di una stringa fino all'inverter, sola andata [m] */
    dcLengthM: number;
    /** Sezione del cavo solare [mm²] (null = scelta automatica) */
    dcSection: number | null;
    /** Temperatura dell'aria attorno ai cavi DC (sul tetto) [°C] */
    dcAmbientC: number;
    /** Lunghezza della linea inverter → quadro, sola andata [m] */
    acLengthM: number;
    acSection: number | null;
    acMethod: InstallMethod;
  };
  economics: {
    prices: PriceItem[];
    vatPct: number;
    deductionPct: number;
    deductionYears: number;
    importPrice: number;
    exportPrice: number;
    energyInflationPct: number;
    omPerYear: number;
    inverterReplaceYear: number;
    years: number;
    discountPct: number;
  };
}

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function defaultDesign(): PvDesign {
  const s = SITES[1]!;
  return {
    name: 'Impianto fotovoltaico domestico',
    site: { presetId: s.id, latitude: s.latitude, hDay: [...s.hDay], tMean: [...s.tMean], tMin: s.tMin, tMax: s.tMax, tilt: 25, azimuth: 0, albedo: 0.2, shadingPct: 2, roofM2: 0, mounting: 'complanare' },
    consumption: { annualKWh: 3500, profile: 'uniforme', contractKW: 3 },
    module: copy(MODULES[1]!),
    modulesPerString: 8,
    strings: 1,
    inverter: copy(INVERTERS[0]!),
    batteryKWh: 0,
    losses: { opticalPct: 3, soilingPct: 2, mismatchPct: 1.5, availabilityPct: 1, degradationPct: 0.5 },
    cables: { dcLengthM: 20, dcSection: null, dcAmbientC: 50, acLengthM: 10, acSection: null, acMethod: 'B1' },
    economics: {
      prices: copy(DEFAULT_PRICES),
      vatPct: 10,
      deductionPct: 50,
      deductionYears: 10,
      importPrice: 0.28,
      exportPrice: 0.1,
      energyInflationPct: 2,
      omPerYear: 60,
      inverterReplaceYear: 12,
      years: 25,
      discountPct: 3,
    },
  };
}

/** Completa un progetto salvato con i campi mancanti (versioni precedenti, dati incompleti). */
export function normalizeDesign(x: unknown): PvDesign {
  const d = defaultDesign();
  if (!x || typeof x !== 'object') return d;
  const o = x as Partial<PvDesign>;
  const prices = DEFAULT_PRICES.map((p) => ({ ...p, price: o.economics?.prices?.find((q) => q.id === p.id)?.price ?? p.price }));
  return {
    ...d,
    ...o,
    site: { ...d.site, ...o.site },
    consumption: { ...d.consumption, ...o.consumption },
    module: { ...d.module, ...o.module },
    inverter: { ...d.inverter, ...o.inverter },
    losses: { ...d.losses, ...o.losses },
    cables: { ...d.cables, ...o.cables },
    economics: { ...d.economics, ...o.economics, prices },
  };
}

export const isHybrid = (d: PvDesign) => d.inverter.hybrid;
