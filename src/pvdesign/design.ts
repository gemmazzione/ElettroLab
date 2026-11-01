import type { InstallMethod } from '../rules/ampacity';
import type { RoofSpec } from './roof';
import type { Obstacle } from './shading';
import type { Weather } from './weather';
import { DEFAULT_PRICES, INVERTERS, LOAD_PROFILES, MODULES, SITES, type InverterSpec, type LoadProfileId, type ModuleSpec, type MountingId, type PriceItem } from './data';

/** Dati di un progetto di impianto fotovoltaico (sezione «Progetta FV»). */
export interface PvDesign {
  name: string;
  /** Posizione della casa scelta sulla mappa */
  location: { lat: number | null; lon: number | null; address: string; zoom: number };
  /** Tetto disegnato sulla foto satellitare */
  roof: RoofSpec;
  /** Alberi ed edifici vicini che possono fare ombra (vista 3D) */
  obstacles: Obstacle[];
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
    /** Dati meteo ora per ora del sito (anno tipo PVGIS); null = stima mensile */
    weather: Weather | null;
  };
  consumption: {
    annualKWh: number;
    profile: LoadProfileId;
    /** Profilo disegnato a mano: peso relativo di ciascuna delle 24 ore (si normalizza sul consumo annuo) */
    customWeights: number[];
    contractKW: number;
    /** Consumi misurati (curva del distributore): potenza media [kW] per mese (12) e ora (24); null = profilo tipico */
    measured: number[][] | null;
    /** Descrizione del file importato */
    measuredSource: string;
    /** Pompa di calore in arrivo: consumo annuo aggiuntivo [kWh] */
    heatPumpKWh: number;
    /** Auto elettrica: chilometri all'anno ricaricati a casa */
    evKm: number;
    /** Quando si ricarica l'auto */
    evCharge: 'giorno' | 'sera';
  };
  module: ModuleSpec;
  modulesPerString: number;
  strings: number;
  /** Seconda falda (impianti est-ovest): stringhe su un altro ingresso MPPT */
  field2: Field2;
  /** Ottimizzatori di potenza su ogni modulo */
  optimizers: boolean;
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
    /** Versione del listino con cui sono stati impostati i prezzi */
    pricesVersion?: string;
    /** Tariffa: prezzo unico o per fasce orarie F1, F2, F3 */
    tariff: 'monoraria' | 'fasce';
    /** Prezzi per fascia F1, F2, F3 [€/kWh] */
    bandPrices: [number, number, number];
    /** Comunità energetica rinnovabile */
    cer: boolean;
    /** Quota dell'energia immessa che risulta condivisa nella comunità [%] */
    cerSharedPct: number;
    /** Incentivo sull'energia condivisa [€/kWh] */
    cerIncentive: number;
  };
}

export interface Field2 {
  enabled: boolean;
  /** Falda del tetto (indice tra quelle disponibili) */
  slope: number;
  modulesPerString: number;
  strings: number;
  /** Inclinazione e orientamento: dalla falda, oppure a mano senza tetto disegnato */
  tilt: number;
  azimuth: number;
  /** Posti esclusi sulla falda (camini, lucernari...) */
  excluded: number[];
}

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function defaultDesign(): PvDesign {
  const s = SITES[1]!;
  return {
    name: 'Impianto fotovoltaico domestico',
    location: { lat: null, lon: null, address: '', zoom: 6 },
    obstacles: [],
    roof: { footprint: [], type: 'due-falde', pitch: 20, heightM: 6, slope: 0, setbackM: 0.4, orientation: 'verticale', excluded: [] },
    site: { presetId: s.id, latitude: s.latitude, hDay: [...s.hDay], tMean: [...s.tMean], tMin: s.tMin, tMax: s.tMax, tilt: 25, azimuth: 0, albedo: 0.2, shadingPct: 2, roofM2: 0, mounting: 'complanare', weather: null },
    consumption: {
      annualKWh: 3500,
      profile: 'uniforme',
      contractKW: 3,
      customWeights: [...LOAD_PROFILES.uniforme.weights],
      measured: null,
      measuredSource: '',
      heatPumpKWh: 0,
      evKm: 0,
      evCharge: 'sera',
    },
    module: copy(MODULES[1]!),
    modulesPerString: 8,
    strings: 1,
    field2: { enabled: false, slope: -1, modulesPerString: 6, strings: 1, tilt: 25, azimuth: 90, excluded: [] },
    optimizers: false,
    inverter: copy(INVERTERS[0]!),
    batteryKWh: 0,
    losses: { opticalPct: 3, soilingPct: 2, mismatchPct: 1.5, availabilityPct: 1, degradationPct: 0.5 },
    cables: { dcLengthM: 20, dcSection: null, dcAmbientC: 50, acLengthM: 10, acSection: null, acMethod: 'B1' },
    economics: {
      prices: copy(DEFAULT_PRICES),
      vatPct: 10,
      deductionPct: 50,
      deductionYears: 10,
      importPrice: 0.4,
      exportPrice: 0.1,
      energyInflationPct: 2,
      omPerYear: 60,
      inverterReplaceYear: 12,
      years: 25,
      discountPct: 3,
      pricesVersion: PRICES_VERSION,
      tariff: 'monoraria',
      bandPrices: [0.42, 0.4, 0.37],
      cer: false,
      cerSharedPct: 60,
      cerIncentive: 0.08,
    },
  };
}

/** Completa un progetto salvato con i campi mancanti (versioni precedenti, dati incompleti). */
/** Versione del listino attuale (ottobre 2026). */
export const PRICES_VERSION = '2026-10';
/** Predefiniti del listino precedente che sono cambiati. */
const OLD_DEFAULT_PRICES: Partial<Record<string, number>> = { battery: 450, labour: 450 };

export function normalizeDesign(x: unknown): PvDesign {
  const d = defaultDesign();
  if (!x || typeof x !== 'object') return d;
  const o = x as Partial<PvDesign>;
  let prices = DEFAULT_PRICES.map((p) => ({ ...p, price: o.economics?.prices?.find((q) => q.id === p.id)?.price ?? p.price }));
  let econ = { ...d.economics, ...o.economics };
  // Progetti salvati con il listino precedente: si aggiornano solo i valori rimasti uguali ai vecchi predefiniti
  // (quelli cambiati dall'utente restano com'erano).
  if (o.economics?.pricesVersion !== PRICES_VERSION) {
    prices = prices.map((p) => (OLD_DEFAULT_PRICES[p.id] === p.price ? { ...p, price: DEFAULT_PRICES.find((q) => q.id === p.id)!.price } : p));
    if (econ.importPrice === 0.28) econ = { ...econ, importPrice: d.economics.importPrice };
    econ = { ...econ, pricesVersion: PRICES_VERSION };
  }
  return {
    ...d,
    ...o,
    location: { ...d.location, ...o.location },
    roof: { ...d.roof, ...o.roof },
    obstacles: Array.isArray(o.obstacles) ? o.obstacles.map((ob) => ({ ...ob, z0: ob.z0 ?? 0 })) : [],
    field2: { ...d.field2, ...o.field2 },
    site: { ...d.site, ...o.site },
    consumption: { ...d.consumption, ...o.consumption },
    module: { ...d.module, ...o.module },
    inverter: { ...d.inverter, ...o.inverter },
    losses: { ...d.losses, ...o.losses },
    cables: { ...d.cables, ...o.cables },
    economics: { ...econ, prices },
  };
}

export const isHybrid = (d: PvDesign) => d.inverter.hybrid;
