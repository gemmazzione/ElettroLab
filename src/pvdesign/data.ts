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
export type LoadProfileId = 'sera' | 'uniforme' | 'giorno' | 'manuale';
export const LOAD_PROFILES: Record<LoadProfileId, { label: string; weights: number[] }> = {
  sera: {
    label: 'Fuori casa di giorno (consumi la sera)',
    weights: [0.5, 0.4, 0.4, 0.4, 0.4, 0.5, 0.9, 1.4, 1.1, 0.6, 0.5, 0.5, 0.8, 0.8, 0.5, 0.5, 0.6, 0.9, 1.6, 2.2, 2.4, 2.0, 1.4, 0.8],
  },
  uniforme: {
    label: 'Presenza mista',
    weights: [0.5, 0.4, 0.4, 0.4, 0.4, 0.5, 0.8, 1.2, 1.1, 1.0, 1.0, 1.1, 1.4, 1.3, 1.0, 0.9, 0.9, 1.1, 1.5, 1.9, 2.0, 1.7, 1.2, 0.7],
  },
  manuale: {
    label: 'Manuale: disegna tu i consumi ora per ora',
    // Valori usati solo se il profilo disegnato è vuoto (tutti zero).
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

export interface PriceSource {
  label: string;
  url: string;
  /** Periodo a cui si riferisce il dato della fonte */
  date: string;
  /** Il dato riportato dalla fonte, in breve */
  note: string;
}

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
  | 'optimizer'
  | 'misc';

/** Data dell'ultimo controllo dei prezzi e delle fonti. */
export const PRICES_CHECKED = 'ottobre 2026';

/** Listino indicativo (€, IVA esclusa). Il prezzo dell'inverter si applica per kW di potenza nominale. */
export const DEFAULT_PRICES: PriceItem[] = [
  { id: 'module', label: 'Moduli fotovoltaici', unit: '€/Wp', price: 0.2 },
  { id: 'inverter', label: 'Inverter', unit: '€/kW', price: 220 },
  { id: 'battery', label: 'Batteria di accumulo', unit: '€/kWh', price: 750 },
  { id: 'mounting', label: 'Strutture di fissaggio', unit: '€/modulo', price: 45 },
  { id: 'dcCable', label: 'Cavo solare (per conduttore)', unit: '€/m', price: 1.6 },
  { id: 'acCable', label: 'Cavo lato alternata (per conduttore)', unit: '€/m', price: 1.2 },
  { id: 'dcBox', label: 'Quadro di campo DC (sezionatore e SPD)', unit: '€', price: 230 },
  { id: 'stringFuse', label: 'Portafusibili e fusibili di stringa', unit: '€/stringa', price: 35 },
  { id: 'acBox', label: 'Quadro lato alternata (magnetotermico differenziale, SPD)', unit: '€', price: 180 },
  { id: 'labour', label: 'Manodopera e installazione', unit: '€/kWp', price: 750 },
  { id: 'design', label: 'Progetto, pratiche di connessione e dichiarazioni', unit: '€', price: 500 },
  { id: 'optimizer', label: 'Ottimizzatori di potenza', unit: '€/modulo', price: 40 },
  { id: 'misc', label: 'Varie e imprevisti', unit: '% sul totale', price: 5 },
];

/**
 * Da dove vengono i prezzi: fonti consultate a ottobre 2026. Le voci senza fonte sono stime.
 * I prezzi del listino sono IVA esclusa e comprendono il margine di chi vende e installa: per questo sono
 * più alti dei prezzi all'ingrosso riportati da alcune fonti.
 */
export const PRICE_SOURCES: Partial<Record<PriceId, { why: string; sources: PriceSource[] }>> = {
  module: {
    why: "Prezzo al cliente finale, sopra quello all'ingrosso.",
    sources: [
      {
        label: 'Deentra – Prezzi pannelli solari',
        url: 'https://www.deentra.io/blog-fotovoltaico/prezzi-pannelli-solarii',
        date: '8 ottobre 2026',
        note: "all'ingrosso 0,135–0,145 €/Wp (alta efficienza); al cliente finale 0,14–0,20 €/Wp",
      },
      { label: 'pvXchange – Indice dei prezzi dei moduli', url: 'https://www.pvxchange.com/Price-Index', date: 'ottobre 2026', note: "andamento dei prezzi all'ingrosso in Europa, per tipo di modulo" },
    ],
  },
  inverter: {
    why: "Listini online al netto di IVA, più il margine dell'installatore; gli ibridi costano un po' di più.",
    sources: [
      { label: 'Panpower – Huawei SUN2000-3KTL-L1 (3 kW)', url: 'https://panpower.eu/it/inverter/6981-huawei-sun2000-3ktl-l1-3-kw.html', date: 'ottobre 2026', note: '388 € IVA esclusa, circa 130 €/kW' },
      { label: 'Panpower – Sofar HYD6000-EP ibrido (6 kW)', url: 'https://panpower.eu/it/inverter/4232-sofar-hyd6000-ep-6-kw.html', date: 'ottobre 2026', note: '1.127 € IVA esclusa, circa 190 €/kW' },
    ],
  },
  battery: {
    why: 'Prezzo installato riportato IVA esclusa (circa 825 €/kWh con IVA al 10%).',
    sources: [
      {
        label: 'Enpal – Costo batteria di accumulo',
        url: 'https://www.enpal.com/it/batterie/costo-batteria-accumulo-fotovoltaico',
        date: 'febbraio 2026',
        note: 'circa 10 kWh installati: 8.000–11.000 €, cioè 800–1.100 €/kWh',
      },
    ],
  },
  optimizer: {
    why: "Listino online IVA esclusa più il margine dell'installatore.",
    sources: [{ label: 'Panpower – Tigo TS4-A-O 700 W', url: 'https://panpower.eu/it/ottimizzatori-potenza-accessori-fotovoltaici/4238-ottimizzatore-tigo-ts4-a-o-700w.html', date: 'ottobre 2026', note: '33,26 € IVA esclusa per modulo' }],
  },
  labour: {
    why: 'Tarata perché il totale chiavi in mano cada nella fascia di mercato.',
    sources: [
      {
        label: 'Selectra – Pannelli fotovoltaici: costi 2026',
        url: 'https://climate.selectra.com/it/pannelli-fotovoltaici',
        date: 'giugno–luglio 2026',
        note: 'impianto chiavi in mano senza accumulo: 1.500–2.800 €/kWp',
      },
    ],
  },
};

/** Fonti dei parametri economici (prezzo dell'energia, valore dell'energia venduta, IVA, detrazione). */
export const ECONOMIC_SOURCES: Record<'importPrice' | 'exportPrice' | 'vat' | 'deduction' | 'cer', { why: string; sources: PriceSource[] }> = {
  cer: {
    why: 'Con i prezzi zonali sopra 180 €/MWh (come a ottobre 2026) resta solo la parte fissa: 80 €/MWh. Verifica la cumulabilità con la detrazione fiscale.',
    sources: [
      {
        label: 'Assolombarda – Decreto CER, criteri di incentivazione',
        url: 'https://www.assolombarda.it/servizi/energia/informazioni/decreto-cer-pubblicati-i-criteri-di-incentivazione-per-lenergia-condivisa',
        date: 'DM MASE 414/2023',
        note: 'impianti fino a 200 kW: 80 €/MWh + max(0; 180 − prezzo zonale), al massimo 120 €/MWh, per 20 anni',
      },
    ],
  },
  importPrice: {
    why: "Il risparmio vale sulla parte variabile della bolletta, un po' più bassa del prezzo medio con quote fisse.",
    sources: [
      {
        label: 'ARERA – Maggior tutela, IV trimestre 2026',
        url: 'https://www.arera.it/comunicati-stampa/dettaglio/elettricita-maggior-tutela-373-nel-iv-trimestre-2026-per-i-clienti-vulnerabili',
        date: 'dal 1° ottobre 2026',
        note: '43,43 centesimi/kWh tasse incluse per il cliente tipo',
      },
    ],
  },
  exportPrice: {
    why: 'Valore prudente: il ritiro dedicato paga il prezzo zonale orario, più basso nelle ore di sole, con un minimo garantito.',
    sources: [
      { label: 'Solare Industriale – Ritiro dedicato', url: 'https://www.solareindustriale.it/incentivi/ritiro-dedicato', date: '2026', note: 'prezzo minimo garantito 47,5 €/MWh (0,0475 €/kWh)' },
      {
        label: 'ComparaSemplice – PUN al 27/10/2026',
        url: 'https://www.comparasemplice.it/informazioni/news/pun-aggiornamento-del-27-10-2026',
        date: 'ottobre 2026',
        note: 'media di ottobre fino al 27: 246,67 €/MWh (0,25 €/kWh)',
      },
    ],
  },
  vat: {
    why: 'Aliquota ridotta per i beni destinati agli impianti fotovoltaici; verifica il tuo caso.',
    sources: [
      {
        label: 'Euroconference News – IVA al 10% per i componenti degli impianti',
        url: 'https://www.ecnews.it/fiscale/?p=56929',
        date: 'maggio 2021',
        note: 'DPR 633/72, tabella A, parte III, n. 127-quinquies e 127-sexies',
      },
    ],
  },
  deduction: {
    why: "Valore per l'abitazione principale nel 2026; dal 2027 è previsto un calo.",
    sources: [
      {
        label: 'Edilizia.com – Bonus fotovoltaico 2026',
        url: 'https://www.edilizia.com/detrazioni-fiscali/bonus-fotovoltaico-2026-la-guida-alla-detrazione-50-e-requisiti-aggiornati/',
        date: '2026',
        note: '50% abitazione principale, 36% altri immobili, in 10 rate; accumuli compresi',
      },
    ],
  },
};

/** Pesi orari del profilo dei consumi del progetto (quello disegnato a mano o uno tipico). */
export function profileWeights(c: { profile: LoadProfileId; customWeights: number[] }): number[] {
  if (c.profile === 'manuale' && c.customWeights.length === 24 && c.customWeights.some((w) => w > 0)) return c.customWeights.map((w) => Math.max(0, w));
  return LOAD_PROFILES[c.profile].weights;
}
