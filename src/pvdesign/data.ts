import type { InverterParams, PvArrayParams } from '../model/types';

/**
 * Dati di partenza della progettazione fotovoltaica.
 *
 * TUTTI i valori di questo file sono INDICATIVI e modificabili dall'utente:
 * - i moduli e gli inverter sono prodotti «tipo» con dati di targa plausibili, non modelli commerciali;
 * - l'irraggiamento mensile dei siti è un ordine di grandezza per tre località italiane: per un progetto vero
 *   vanno usati i dati del sito (per esempio UNI 10349 o PVGIS);
 * - i prezzi sono una stima di mercato di massima, da sostituire con i preventivi.
 */

export type ModuleSpec = Omit<PvArrayParams, 'name' | 'modulesPerString' | 'strings'> & {
  id: string;
  label: string;
  /** Superficie del modulo [m²] */
  areaM2: number;
  /** Massima corrente del fusibile in serie dichiarata dal costruttore [A] */
  maxSeriesFuseA: number;
};

export const MODULES: ModuleSpec[] = [
  { id: 'm400', label: 'Monocristallino 400 Wp (54 celle half-cut)', moduleWp: 400, vmp: 34, imp: 11.77, voc: 41, isc: 12.5, tcVoc: -0.27, tcPmax: -0.35, tcIsc: 0.05, noct: 45, areaM2: 1.95, maxSeriesFuseA: 25 },
  { id: 'm430', label: 'Monocristallino 430 Wp (n-type, 108 celle)', moduleWp: 430, vmp: 32.3, imp: 13.32, voc: 38.6, isc: 14.1, tcVoc: -0.25, tcPmax: -0.3, tcIsc: 0.046, noct: 43, areaM2: 1.95, maxSeriesFuseA: 25 },
  { id: 'm460', label: 'Monocristallino 460 Wp (144 celle half-cut)', moduleWp: 460, vmp: 42.2, imp: 10.9, voc: 50.3, isc: 11.6, tcVoc: -0.27, tcPmax: -0.35, tcIsc: 0.048, noct: 45, areaM2: 2.17, maxSeriesFuseA: 20 },
  { id: 'm500', label: 'Monocristallino 500 Wp (grande formato)', moduleWp: 500, vmp: 38.1, imp: 13.13, voc: 45.6, isc: 13.95, tcVoc: -0.26, tcPmax: -0.32, tcIsc: 0.046, noct: 44, areaM2: 2.38, maxSeriesFuseA: 25 },
];

export type InverterSpec = InverterParams & {
  id: string;
  label: string;
  /** Numero di inseguitori MPPT indipendenti */
  mppt: number;
  /** Rendimento europeo [%] (media pesata sui carichi parziali) */
  euroEff: number;
  /** Inverter ibrido: accetta una batteria di accumulo */
  hybrid: boolean;
};

const inv = (id: string, label: string, pacW: number, mppt: number, maxDcA: number, hybrid = false): InverterSpec => ({
  id,
  label,
  pacW,
  mppt,
  efficiency: 97.6,
  euroEff: 97,
  maxDcV: 600,
  mpptMinV: 90,
  mpptMaxV: 550,
  maxDcA,
  batteryKWh: 0,
  batteryW: 0,
  hybrid,
});

export const INVERTERS: InverterSpec[] = [
  inv('i3', 'Monofase 3 kW, 2 MPPT', 3000, 2, 16),
  inv('i36', 'Monofase 3,6 kW, 2 MPPT', 3600, 2, 16),
  inv('i46', 'Monofase 4,6 kW, 2 MPPT', 4600, 2, 16),
  inv('i6', 'Monofase 6 kW, 2 MPPT', 6000, 2, 16),
  inv('h36', 'Ibrido monofase 3,6 kW, 2 MPPT', 3600, 2, 16, true),
  inv('h6', 'Ibrido monofase 6 kW, 2 MPPT', 6000, 2, 16, true),
];

export interface SitePreset {
  id: string;
  label: string;
  latitude: number;
  /** Irraggiamento globale medio giornaliero su piano orizzontale, per mese [kWh/m² al giorno] */
  hDay: number[];
  /** Temperatura media mensile dell'aria [°C] */
  tMean: number[];
  /** Temperature di progetto per le verifiche di stringa [°C] */
  tMin: number;
  tMax: number;
}

export const SITES: SitePreset[] = [
  { id: 'nord', label: 'Nord Italia (indicativo, area di Milano)', latitude: 45.5, hDay: [1.2, 1.9, 3.2, 4.4, 5.4, 6.0, 6.3, 5.3, 3.9, 2.5, 1.4, 1.0], tMean: [2, 4, 9, 13, 18, 22, 25, 24, 19, 14, 8, 3], tMin: -10, tMax: 36 },
  { id: 'centro', label: 'Centro Italia (indicativo, area di Roma)', latitude: 41.9, hDay: [2.0, 2.8, 4.0, 5.2, 6.3, 6.9, 7.1, 6.2, 4.8, 3.4, 2.2, 1.7], tMean: [8, 9, 11, 14, 18, 22, 25, 25, 21, 17, 12, 9], tMin: -5, tMax: 38 },
  { id: 'sud', label: 'Sud Italia e isole (indicativo, area di Palermo)', latitude: 38.1, hDay: [2.4, 3.2, 4.5, 5.6, 6.6, 7.2, 7.4, 6.6, 5.2, 3.9, 2.7, 2.1], tMean: [12, 12, 13, 15, 19, 23, 26, 27, 24, 20, 16, 13], tMin: 0, tMax: 40 },
];

/**
 * Montaggio dei moduli. Il NOCT è misurato con il modulo su un telaio aperto e ventilato: aderente al tetto
 * o integrato nella copertura il modulo si scalda di più. Sovratemperature indicative.
 */
export type MountingId = 'ventilato' | 'complanare' | 'integrato';
export const MOUNTINGS: Record<MountingId, { label: string; extraC: number }> = {
  ventilato: { label: 'Su telaio inclinato, ben ventilato', extraC: 0 },
  complanare: { label: 'Complanare al tetto, distanziato di pochi cm', extraC: 10 },
  integrato: { label: 'Integrato nella copertura (poco ventilato)', extraC: 18 },
};

export const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Giorno dell'anno rappresentativo della media mensile (Klein, 1977). */
export const MONTH_REP_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

/** Profilo dei consumi di casa nelle 24 ore: peso relativo di ogni ora (si normalizza). */
export type LoadProfileId = 'sera' | 'uniforme' | 'giorno';
export const LOAD_PROFILES: Record<LoadProfileId, { label: string; weights: number[] }> = {
  sera: {
    label: 'Fuori casa di giorno (consumi la sera)',
    weights: [0.5, 0.4, 0.4, 0.4, 0.4, 0.5, 0.9, 1.4, 1.1, 0.6, 0.5, 0.5, 0.8, 0.8, 0.5, 0.5, 0.6, 0.9, 1.6, 2.2, 2.4, 2.0, 1.4, 0.8],
  },
  uniforme: {
    label: 'Presenza mista',
    weights: [0.5, 0.4, 0.4, 0.4, 0.4, 0.5, 0.8, 1.2, 1.1, 1.0, 1.0, 1.1, 1.4, 1.3, 1.0, 0.9, 0.9, 1.1, 1.5, 1.9, 2.0, 1.7, 1.2, 0.7],
  },
  giorno: {
    label: 'In casa di giorno (smart working, pensionati)',
    weights: [0.5, 0.4, 0.4, 0.4, 0.4, 0.5, 0.8, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.6, 1.4, 1.3, 1.3, 1.4, 1.6, 1.8, 1.8, 1.5, 1.1, 0.7],
  },
};

/** Ripartizione mensile tipica dei consumi elettrici di un'abitazione (peso relativo, si normalizza). */
export const MONTH_LOAD_WEIGHTS = [1.12, 1.05, 1.0, 0.92, 0.9, 0.95, 1.05, 0.95, 0.9, 0.95, 1.05, 1.16];

// ------------------------------------------------------------------ cavi

/** Portata indicativa di un cavo solare unipolare (tipo H1Z2Z2-K) posato in aria a 30 °C [A]: valori di catalogo tipici. */
export const SOLAR_CABLE_AMPACITY: Record<number, number> = { 2.5: 41, 4: 55, 6: 70, 10: 98, 16: 132 };
export const SOLAR_CABLE_SECTIONS = [4, 6, 10, 16] as const;

// ------------------------------------------------------------------ listino prezzi

export interface PriceItem {
  id: PriceId;
  label: string;
  unit: string;
  price: number;
}

export type PriceId =
  | 'module'
  | 'inverter'
  | 'battery'
  | 'mounting'
  | 'dcCable'
  | 'acCable'
  | 'dcBox'
  | 'stringFuse'
  | 'acBox'
  | 'labour'
  | 'design'
  | 'misc';

/** Listino indicativo (€, IVA esclusa). Il prezzo dell'inverter si applica per kW di potenza nominale. */
export const DEFAULT_PRICES: PriceItem[] = [
  { id: 'module', label: 'Moduli fotovoltaici', unit: '€/Wp', price: 0.2 },
  { id: 'inverter', label: 'Inverter', unit: '€/kW', price: 220 },
  { id: 'battery', label: 'Batteria di accumulo', unit: '€/kWh', price: 450 },
  { id: 'mounting', label: 'Strutture di fissaggio', unit: '€/modulo', price: 45 },
  { id: 'dcCable', label: 'Cavo solare (per conduttore)', unit: '€/m', price: 1.6 },
  { id: 'acCable', label: 'Cavo lato alternata (per conduttore)', unit: '€/m', price: 1.2 },
  { id: 'dcBox', label: 'Quadro di campo DC (sezionatore e SPD)', unit: '€', price: 230 },
  { id: 'stringFuse', label: 'Portafusibili e fusibili di stringa', unit: '€/stringa', price: 35 },
  { id: 'acBox', label: 'Quadro lato alternata (magnetotermico differenziale, SPD)', unit: '€', price: 180 },
  { id: 'labour', label: 'Manodopera e installazione', unit: '€/kWp', price: 450 },
  { id: 'design', label: 'Progetto, pratiche di connessione e dichiarazioni', unit: '€', price: 500 },
  { id: 'misc', label: 'Varie e imprevisti', unit: '% sul totale', price: 5 },
];
