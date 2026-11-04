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
  /** Fasi della connessione in alternata (assente = monofase) */
  phases?: 1 | 3;
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

/** Inverter trifase «tipo» per impianti aziendali: 400 V, ingressi fino a 1100 V, più stringhe per ingresso MPPT. */
const tri = (id: string, label: string, pacW: number, mppt: number, maxDcA: number, hybrid = false): InverterSpec => ({
  id,
  label,
  pacW,
  mppt,
  efficiency: 98.6,
  euroEff: 98.2,
  maxDcV: 1100,
  mpptMinV: 200,
  mpptMaxV: 1000,
  maxDcA,
  batteryKWh: 0,
  batteryW: 0,
  hybrid,
  phases: 3,
});

export const INVERTERS: InverterSpec[] = [
  inv('i3', 'Monofase 3 kW, 2 MPPT', 3000, 2, 16),
  inv('i36', 'Monofase 3,6 kW, 2 MPPT', 3600, 2, 16),
  inv('i46', 'Monofase 4,6 kW, 2 MPPT', 4600, 2, 16),
  inv('i6', 'Monofase 6 kW, 2 MPPT', 6000, 2, 16),
  inv('h36', 'Ibrido monofase 3,6 kW, 2 MPPT', 3600, 2, 16, true),
  inv('h6', 'Ibrido monofase 6 kW, 2 MPPT', 6000, 2, 16, true),
  tri('t10', 'Trifase 10 kW, 2 MPPT', 10000, 2, 26),
  tri('t15', 'Trifase 15 kW, 2 MPPT', 15000, 2, 26),
  tri('t20', 'Trifase 20 kW, 2 MPPT', 20000, 2, 32),
  tri('t30', 'Trifase 30 kW, 3 MPPT', 30000, 3, 32),
  tri('t50', 'Trifase 50 kW, 4 MPPT', 50000, 4, 40),
  tri('t100', 'Trifase 100 kW, 10 MPPT', 100000, 10, 32),
  tri('ht10', 'Ibrido trifase 10 kW, 2 MPPT', 10000, 2, 26, true),
  tri('ht20', 'Ibrido trifase 20 kW, 2 MPPT', 20000, 2, 32, true),
];

/** Inverter trifase (connessione a 400 V). */
export const isThreePhaseInverter = (i: Pick<InverterSpec, 'phases'>) => i.phases === 3;

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
export type LoadProfileId = 'sera' | 'uniforme' | 'giorno' | 'manuale' | 'ufficio' | 'turno1' | 'turno2' | 'continuo' | 'negozio';
/** Profili delle abitazioni e delle aziende, nell'ordine dei menu. */
export const HOME_PROFILES: LoadProfileId[] = ['sera', 'uniforme', 'giorno', 'manuale'];
export const BUSINESS_PROFILES: LoadProfileId[] = ['ufficio', 'turno1', 'turno2', 'continuo', 'negozio', 'manuale'];
export const LOAD_PROFILES: Record<
  LoadProfileId,
  {
    label: string;
    weights: number[];
    /** Consumo di un sabato e di una domenica rispetto a un giorno feriale (assente = tutti i giorni uguali) */
    week?: [number, number];
  }
> = {
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
  // Profili aziendali indicativi: un giorno feriale tipo, con i consumi di fondo (server, frigoriferi, illuminazione di sicurezza).
  ufficio: {
    label: 'Uffici e studi (8–18, dal lunedì al venerdì)',
    weights: [0.25, 0.25, 0.25, 0.25, 0.25, 0.3, 0.45, 0.8, 1.6, 1.9, 2, 2, 1.7, 1.8, 2, 1.9, 1.8, 1.5, 0.8, 0.45, 0.35, 0.3, 0.25, 0.25],
    week: [0.35, 0.25],
  },
  turno1: {
    label: 'Produzione su un turno (7–17, dal lunedì al venerdì)',
    weights: [0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.9, 2, 2.2, 2.2, 2.2, 2.1, 1.6, 2, 2.2, 2.1, 1.8, 0.8, 0.35, 0.25, 0.2, 0.2, 0.2, 0.2],
    week: [0.3, 0.15],
  },
  turno2: {
    label: 'Produzione su due turni (6–22, dal lunedì al venerdì)',
    weights: [0.25, 0.25, 0.25, 0.25, 0.3, 0.8, 1.6, 1.7, 1.7, 1.7, 1.7, 1.6, 1.5, 1.6, 1.7, 1.7, 1.7, 1.6, 1.6, 1.6, 1.5, 1.4, 0.6, 0.3],
    week: [0.45, 0.15],
  },
  continuo: {
    label: 'Ciclo continuo (24 ore su 24, tutti i giorni)',
    weights: [0.9, 0.9, 0.9, 0.9, 0.9, 0.95, 1, 1.05, 1.1, 1.1, 1.1, 1.1, 1.05, 1.1, 1.1, 1.1, 1.05, 1, 1, 0.95, 0.95, 0.9, 0.9, 0.9],
  },
  negozio: {
    label: 'Negozio o supermercato (9–20, anche il sabato)',
    weights: [0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.45, 0.8, 1.5, 1.8, 1.8, 1.8, 1.8, 1.7, 1.7, 1.8, 1.8, 1.8, 1.8, 1.7, 1, 0.5, 0.4, 0.35],
    week: [1.05, 0.45],
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
  | 'spi'
  | 'mtWorks'
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
  { id: 'spi', label: 'Protezione di interfaccia esterna (SPI e dispositivo di interfaccia)', unit: '€', price: 1500 },
  { id: 'mtWorks', label: 'Adeguamento cabina di media tensione e protezione generale', unit: '€', price: 15000 },
  { id: 'misc', label: 'Varie e imprevisti', unit: '% sul totale', price: 5 },
];

/**
 * Listino per impianti aziendali (€, IVA esclusa): prezzi per unità più bassi grazie alla taglia. I valori sono tarati
 * perché il costo chiavi in mano cada nelle fasce di mercato riportate in BUSINESS_TURNKEY_SOURCES.
 */
export const BUSINESS_PRICES: Partial<Record<PriceId, number>> = {
  module: 0.18,
  inverter: 80,
  battery: 550,
  mounting: 30,
  dcCable: 1.4,
  acCable: 4,
  dcBox: 350,
  stringFuse: 25,
  acBox: 900,
  labour: 300,
  design: 2500,
};

/** Listino di partenza per un'abitazione o per un'azienda. */
export function defaultPrices(kind: 'casa' | 'azienda'): PriceItem[] {
  return DEFAULT_PRICES.map((p) => ({ ...p, price: kind === 'azienda' ? (BUSINESS_PRICES[p.id] ?? p.price) : p.price }));
}

/** Costo chiavi in mano di impianti aziendali: serve a controllare il listino per aziende. */
export const BUSINESS_TURNKEY_SOURCES: PriceSource[] = [
  { label: 'Solare Industriale – Impianto da 25 kW', url: 'https://www.solareindustriale.it/progetti/impianto-fotovoltaico-25-kw', date: '2026', note: '21.000–23.000 € IVA esclusa, circa 840–920 €/kWp' },
  { label: 'Solare Industriale – Impianto da 100 kW', url: 'https://www.solareindustriale.it/progetti/impianto-fotovoltaico-100-kw', date: '2026', note: '72.000–79.000 € chiavi in mano, circa 720–790 €/kWp' },
  { label: 'Solare Industriale – Impianto da 250 kW', url: 'https://www.solareindustriale.it/progetti/impianto-fotovoltaico-250-kw', date: '2026', note: '165.000–180.000 € più IVA, circa 660–720 €/kWp' },
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

/** Fonti della guida a risparmio e incentivi (verificate a novembre 2026). */
export const INCENTIVE_SOURCES: Record<'deduction' | 'rid' | 'cer' | 'pnrr' | 'other' | 'power', PriceSource[]> = {
  deduction: [
    {
      label: 'Edilizia.com – Bonus fotovoltaico 2026',
      url: 'https://www.edilizia.com/detrazioni-fiscali/bonus-fotovoltaico-2026-la-guida-alla-detrazione-50-e-requisiti-aggiornati/',
      date: '2026',
      note: '50% / 36%, limite 96.000 € per unità condiviso con le altre ristrutturazioni, 10 quote, bonifico parlante, comunicazione ENEA',
    },
    {
      label: 'MySolution – Detrazioni confermate dalla legge di bilancio 2026',
      url: 'https://www.mysolution.it/fisco/informazioni/news/2025/12/30/impianti-fotovoltaici-detrazioni-confermate-dalla-legge-di-bilancio-2026/',
      date: 'dicembre 2025',
      note: "abitazione principale: 50% nel 2026, 36% nel 2027; accumulo compreso",
    },
    {
      label: 'Infobuild – Bonus edilizi 2027: proroga del 50% e 36% in manovra',
      url: 'https://www.infobuild.it/bonus-edilizi-2027-proroga-50-36-manovra',
      date: '29 ottobre 2026',
      note: 'legge in vigore per il 2027: 36% / 30%; il DDL di bilancio 2027 propone 50% / 36%, da approvare in Parlamento',
    },
  ],
  rid: [
    {
      label: 'QualEnergia – Fine dello scambio sul posto, ritiro dedicato',
      url: 'https://www.qualenergia.it/articoli/fine-scambio-posto-nuovo-modello-unico-ritiro-dedicato/',
      date: '2025',
      note: 'niente scambio sul posto per gli impianti entrati in esercizio dopo il 29 maggio 2025',
    },
    { label: 'Solare Industriale – Ritiro dedicato', url: 'https://www.solareindustriale.it/incentivi/ritiro-dedicato', date: '2026', note: 'prezzo minimo garantito 47,5 €/MWh' },
  ],
  cer: [
    {
      label: 'ANCE – Decreto CER, nota di approfondimento',
      url: 'https://ance.it/wp-content/uploads/allegati/20240125_Decreto_CER_Nota_di_approfondimento.pdf',
      date: 'gennaio 2024',
      note: 'tariffa per 20 anni più circa 8 €/MWh di ARERA; cumulabile con la detrazione al 50%, non con il Superbonus; tariffe fino al 31 dicembre 2027',
    },
    ...ECONOMIC_SOURCES.cer.sources,
  ],
  pnrr: [
    {
      label: 'Ediltecnico – Nuovo decreto CER 2025',
      url: 'https://ediltecnico.it/nuovo-decreto-cer/',
      date: '2025',
      note: 'contributo PNRR del 40% esteso ai Comuni fino a 50.000 abitanti (DM 127/2025)',
    },
  ],
  other: [
    {
      label: 'Money.it – Fotovoltaico 2026, cosa cambia dal 2027',
      url: 'https://www.money.it/bonus-fotovoltaico-2026',
      date: '2026',
      note: 'Conto Termico 3.0 solo con una pompa di calore, alternativo alla detrazione; reddito energetico con ISEE sotto 15.000 €',
    },
    ...ECONOMIC_SOURCES.vat.sources,
  ],
  power: [
    {
      label: 'Luce-gas.it – Quanto costa aumentare la potenza del contatore',
      url: 'https://luce-gas.it/guida/contatore/potenza/aumento',
      date: 'ottobre 2026',
      note: "delibera ARERA 575/2025: 62,30 €/kW (fino a 6 kW finali) o 78,81 €/kW, 23 € di pratica; quota potenza 23,72 €/kW all'anno, IVA esclusa",
    },
  ],
};

/** Fonti delle regole e degli incentivi per gli impianti aziendali (verificate a novembre 2026). */
export const BUSINESS_SOURCES: Record<'connection' | 'spi' | 'adm' | 'fire' | 'hyper' | 'depreciation' | 'energyPrice', PriceSource[]> = {
  connection: [
    {
      label: 'ARERA – Delibera 99/08 (TICA), allegato A',
      url: 'https://arera.it/allegati/docs/08/099-08argall.pdf',
      date: 'testo integrato, versione originale',
      note: 'connessione ordinaria in bassa tensione fino a 100 kW, in media tensione fino a 6.000 kW',
    },
    {
      label: 'Solare Industriale – Bassa o media tensione per le aziende',
      url: 'https://www.solareindustriale.it/blog-fotovoltaico/differenza-impianti-bassa-o-media-tensione-per-aziende',
      date: '27 marzo 2026',
      note: 'BT fino a 100 kW, MT da 100 kW a 6 MW; il distributore può indicare soluzioni diverse',
    },
  ],
  spi: [
    {
      label: 'FIMER – Regolamento di esercizio CEI 0-21',
      url: 'https://fimer.com/sites/default/files/Compilazione%20Reg%20Esercizio_CEI0-21_%20PowerUNO%20e%20PowerX%20rev.15-10-24.pdf',
      date: 'ottobre 2024',
      note: "SPI e dispositivo di interfaccia integrati nell'inverter fino a 11,08 kW; oltre, esterni",
    },
  ],
  adm: [
    {
      label: 'Informa Impresa – Dichiarazioni per impianti oltre 20 kW',
      url: 'https://www.informaimpresa.it/obbligo-di-dichiarazione-semestrale-entro-il-30-09-2026-per-chi-detiene-impianti-elettrici-a-fonte-rinnovabile-con-potenza-superiore-a-20-kw/',
      date: '2026',
      note: "officina elettrica: denuncia all'Agenzia delle Dogane, licenza, diritto annuale e dichiarazioni periodiche",
    },
    { label: 'Certifico – Officina elettrica, TU accise e note', url: 'https://www.certifico.com/id/18197', date: '2026', note: 'testo unico accise e chiarimenti; regole 2026 (DM MEF 10 marzo 2026) da verificare sul sito ADM' },
  ],
  fire: [
    {
      label: 'Lavori Pubblici – Aggiornata la linea guida di prevenzione incendi',
      url: 'https://www.lavoripubblici.it/news/impianti-fotovoltaici-aggiornata-linea-guida-prevenzione-incendi-36270',
      date: 'settembre 2025',
      note: 'nota DCPREV 14030 del 1° settembre 2025: sostituisce la guida del 2012',
    },
  ],
  hyper: [
    {
      label: 'MyEnergy – Iperammortamento fotovoltaico 2026',
      url: 'https://www.myenergy.it/blog/incentivi-e-agevolazioni/iperammortamento-fotovoltaico-2026-guida-al-nuovo-piano-transizione-5-0/',
      date: '6 ottobre 2026',
      note: 'L. 199/2025, commi 427-436: +180% fino a 2,5 milioni; investimenti fino al 30/9/2028; moduli ENEA categoria B o C; produzione fino al 105% del fabbisogno',
    },
    {
      label: 'Iperammortamenti.it – Fotovoltaico e iperammortamento 2026',
      url: 'https://www.iperammortamenti.it/articoli/fotovoltaico-e-iperammortamento-2026-un-solo-fornitore',
      date: '2026',
      note: 'solo impianti per autoconsumo; accumuli compresi',
    },
  ],
  depreciation: [
    {
      label: 'Euroconference – Ammortamento degli impianti sul tetto',
      url: 'https://www.ecnews.it/fiscale/fisco-e-patrimonio/reddito-impresa-e-irap/ammortamento-degli-impianti-fotovoltaici-installati-sul-tetto/',
      date: 'dopo la circolare 4/E/2017',
      note: 'impianto non accatastato con il fabbricato: coefficiente 9%',
    },
  ],
  energyPrice: [
    {
      label: 'Luce-gas.it – Costo del kWh per le aziende (Eurostat)',
      url: 'https://luce-gas.it/business/offerte/costo-kwh-aziende',
      date: 'II semestre 2025',
      note: 'imprese italiane 500–2.000 MWh/anno: 25,44 c€/kWh lordo, 16,8 c€/kWh netto; media ARERA 2025 dei clienti non domestici 26,25 c€/kWh',
    },
  ],
};

/** Pesi orari del profilo dei consumi del progetto (quello disegnato a mano o uno tipico). */
export function profileWeights(c: { profile: LoadProfileId; customWeights: number[] }): number[] {
  if (c.profile === 'manuale' && c.customWeights.length === 24 && c.customWeights.some((w) => w > 0)) return c.customWeights.map((w) => Math.max(0, w));
  return LOAD_PROFILES[c.profile].weights;
}
