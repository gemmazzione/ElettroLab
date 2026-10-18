import type { ComponentKind, ComponentParams, LoadCategory, MountType } from './types';

export type CatalogCategory =
  | 'Alimentazione'
  | 'Impianto di terra'
  | 'Manovra e sezionamento'
  | 'Magnetotermici'
  | 'Differenziali'
  | 'Magnetotermici differenziali'
  | 'Distribuzione'
  | 'Utilizzatori'
  | 'Protezione dalle sovratensioni'
  | 'Altri dispositivi';

export interface CatalogItem {
  id: string;
  kind: ComponentKind | 'unavailable';
  name: string;
  category: CatalogCategory;
  description: string;
  mount: MountType;
  /** Larghezza in moduli DIN (solo per montaggio DIN) */
  modules: number;
  labelPrefix: string;
  /** Parametri iniziali; assente per articoli non ancora implementati */
  defaults?: ComponentParams;
  /** Motivo per cui l'articolo non è utilizzabile in questa versione */
  unavailableReason?: string;
  /** Al massimo un'istanza per progetto */
  singleton?: boolean;
}

const load = (
  id: string,
  name: string,
  category: LoadCategory,
  powerW: number,
  cableSection: 1.5 | 2.5 | 4 | 6,
  description: string,
  cosPhi = 1,
): CatalogItem => ({
  id,
  kind: 'load',
  name,
  category: 'Utilizzatori',
  description,
  mount: 'free',
  modules: 0,
  labelPrefix: 'U',
  defaults: {
    kind: 'load',
    p: { name, category, powerW, on: true, cableLength: 15, cableSection, ...(cosPhi < 1 ? { cosPhi } : {}) },
  },
});

const unavailable = (id: string, name: string, category: CatalogCategory, phase: string): CatalogItem => ({
  id,
  kind: 'unavailable',
  name,
  category,
  description: '',
  mount: 'din',
  modules: 1,
  labelPrefix: '',
  unavailableReason: `Funzionalità non implementata in questa versione (${phase}).`,
});

export const CATALOG: CatalogItem[] = [
  {
    id: 'supply-mono',
    kind: 'supply',
    name: 'Fornitura monofase 230 V (TT)',
    category: 'Alimentazione',
    description:
      'Punto di consegna del distributore (contatore). Fornisce fase e neutro; il neutro è collegato a terra in cabina (sistema TT). Il conduttore PE non arriva dal distributore: proviene dal dispersore dell\'utente.',
    mount: 'free',
    modules: 0,
    labelPrefix: 'CNT',
    singleton: true,
    defaults: {
      kind: 'supply',
      p: { voltage: 230, frequency: 50, contractKW: 3, rNetwork: 0.25, xNetwork: 0.08, rb: 2 },
    },
  },
  {
    id: 'supply-tri',
    kind: 'supply',
    name: 'Fornitura trifase 400/230 V (TT)',
    category: 'Alimentazione',
    description:
      'Punto di consegna trifase: tre fasi L1, L2, L3 sfasate di 120° e neutro. 400 V tra due fasi (tensione concatenata), 230 V tra fase e neutro. Neutro a terra in cabina (sistema TT).',
    mount: 'free',
    modules: 0,
    labelPrefix: 'CNT',
    singleton: true,
    defaults: {
      kind: 'supply',
      p: { voltage: 230, frequency: 50, contractKW: 10, rNetwork: 0.2, xNetwork: 0.08, rb: 2, phases: 3 },
    },
  },
  {
    id: 'earth',
    kind: 'earth',
    name: 'Impianto di terra (dispersore)',
    category: 'Impianto di terra',
    description:
      'Dispersore dell\'utente con collettore di terra. RA è la resistenza di terra misurata del dispersore: da essa dipende la tensione di contatto in caso di guasto verso massa.',
    mount: 'free',
    modules: 0,
    labelPrefix: 'T',
    defaults: { kind: 'earth', p: { ra: 50 } },
  },
  {
    id: 'switch-2p',
    kind: 'switch',
    name: 'Interruttore-sezionatore 2P',
    category: 'Manovra e sezionamento',
    description:
      'Apre e chiude il circuito su fase e neutro e garantisce il sezionamento. Non protegge da sovracorrenti né da dispersioni.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'Q',
    defaults: { kind: 'switch', p: { poles: '2P', in: 40 } },
  },
  {
    id: 'switch-4p',
    kind: 'switch',
    name: 'Interruttore-sezionatore 4P',
    category: 'Manovra e sezionamento',
    description: 'Sezionamento di una linea trifase con neutro su tutti i conduttori attivi. Non è una protezione.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'Q',
    defaults: { kind: 'switch', p: { poles: '4P', in: 63 } },
  },
  {
    id: 'mcb-1p',
    kind: 'mcb',
    name: 'Magnetotermico 1P',
    category: 'Magnetotermici',
    description:
      'Protegge la sola fase da sovraccarico (sganciatore termico) e cortocircuito (sganciatore magnetico). Non interrompe il neutro.',
    mount: 'din',
    modules: 1,
    labelPrefix: 'Q',
    defaults: { kind: 'mcb', p: { poles: '1P', in: 10, curve: 'C', icn: 4.5 } },
  },
  {
    id: 'mcb-1pn',
    kind: 'mcb',
    name: 'Magnetotermico 1P+N',
    category: 'Magnetotermici',
    description:
      'Fase protetta, neutro sezionato ma non protetto. È la soluzione più diffusa per i circuiti terminali monofase.',
    mount: 'din',
    modules: 1,
    labelPrefix: 'Q',
    defaults: { kind: 'mcb', p: { poles: '1P+N', in: 16, curve: 'C', icn: 4.5 } },
  },
  {
    id: 'mcb-2p',
    kind: 'mcb',
    name: 'Magnetotermico 2P',
    category: 'Magnetotermici',
    description: 'Due poli entrambi protetti. Usato spesso come interruttore generale monofase.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'Q',
    defaults: { kind: 'mcb', p: { poles: '2P', in: 25, curve: 'C', icn: 6 } },
  },
  {
    id: 'mcb-3p',
    kind: 'mcb',
    name: 'Magnetotermico 3P',
    category: 'Magnetotermici',
    description: 'Protegge le tre fasi di una linea trifase senza neutro (es. carico trifase equilibrato). Un guasto su una fase apre tutti e tre i poli.',
    mount: 'din',
    modules: 3,
    labelPrefix: 'Q',
    defaults: { kind: 'mcb', p: { poles: '3P', in: 16, curve: 'C', icn: 6 } },
  },
  {
    id: 'mcb-3pn',
    kind: 'mcb',
    name: 'Magnetotermico 3P+N',
    category: 'Magnetotermici',
    description: 'Tre fasi protette e neutro sezionato non protetto: generale o linea di distribuzione trifase con neutro.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'Q',
    defaults: { kind: 'mcb', p: { poles: '3P+N', in: 25, curve: 'C', icn: 10 } },
  },
  {
    id: 'mcb-4p',
    kind: 'mcb',
    name: 'Magnetotermico 4P',
    category: 'Magnetotermici',
    description: 'Quattro poli protetti (fasi e neutro).',
    mount: 'din',
    modules: 4,
    labelPrefix: 'Q',
    defaults: { kind: 'mcb', p: { poles: '4P', in: 32, curve: 'C', icn: 10 } },
  },
  {
    id: 'rcd-2p',
    kind: 'rcd',
    name: 'Differenziale puro 2P',
    category: 'Differenziali',
    description:
      'Confronta la corrente che entra e quella che esce: se la differenza (corrente differenziale) supera la soglia di intervento apre il circuito. Non protegge da sovraccarico né da cortocircuito.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'Q',
    defaults: { kind: 'rcd', p: { poles: '2P', in: 40, idn: 30, rcdType: 'A', selective: false } },
  },
  {
    id: 'rcd-4p',
    kind: 'rcd',
    name: 'Differenziale puro 4P',
    category: 'Differenziali',
    description: 'Misura la somma vettoriale delle correnti di L1, L2, L3 e N: in assenza di dispersioni è zero anche con carichi squilibrati.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'Q',
    defaults: { kind: 'rcd', p: { poles: '4P', in: 40, idn: 30, rcdType: 'A', selective: false } },
  },
  {
    id: 'rcbo-1pn',
    kind: 'rcbo',
    name: 'Magnetotermico differenziale 1P+N',
    category: 'Magnetotermici differenziali',
    description:
      'Riunisce in un solo dispositivo la protezione magnetotermica della fase e la protezione differenziale del circuito.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'Q',
    defaults: {
      kind: 'rcbo',
      p: { poles: '1P+N', in: 16, curve: 'C', icn: 4.5, idn: 30, rcdType: 'A' },
    },
  },
  {
    id: 'bar-n-8',
    kind: 'bar',
    name: 'Morsettiera neutro 8 vie',
    category: 'Distribuzione',
    description: 'Tutti i morsetti sono allo stesso potenziale. Ogni gruppo differenziale deve avere il proprio neutro.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'XN',
    defaults: { kind: 'bar', p: { barFn: 'N', ways: 8 } },
  },
  {
    id: 'bar-pe-8',
    kind: 'bar',
    name: 'Morsettiera PE 8 vie',
    category: 'Distribuzione',
    description: 'Collettore dei conduttori di protezione: va collegato all\'impianto di terra.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'XPE',
    defaults: { kind: 'bar', p: { barFn: 'PE', ways: 8 } },
  },
  {
    id: 'bar-l-4',
    kind: 'bar',
    name: 'Morsettiera di fase 4 vie',
    category: 'Distribuzione',
    description: 'Ripartisce una fase su più conduttori.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'XL',
    defaults: { kind: 'bar', p: { barFn: 'L', ways: 4 } },
  },
  unavailable('comb', 'Pettine di alimentazione', 'Distribuzione', 'usa ponticelli in conduttore'),
  load('load-luce', 'Illuminazione', 'illuminazione', 300, 1.5, 'Circuito luci: carico resistivo equivalente.'),
  load('load-prese', 'Prese', 'prese', 1500, 2.5, 'Circuito prese con un carico resistivo equivalente (es. stufetta, ferro da stiro).'),
  load('load-forno', 'Forno elettrico', 'cucina', 2000, 2.5, 'Forno a resistenza: carico puramente resistivo.'),
  load('load-boiler', 'Scaldabagno', 'scaldabagno', 1200, 2.5, 'Scaldacqua elettrico a resistenza.'),
  load('load-generico', 'Carico generico', 'generico', 1000, 2.5, 'Carico resistivo con potenza configurabile.'),
  load(
    'load-clima',
    'Climatizzatore',
    'climatizzazione',
    1000,
    2.5,
    'Climatizzatore con compressore: carico ohmico-induttivo. Potenza e cos φ sono valori tipici indicativi: usa i dati di targa dell\'apparecchio.',
    0.95,
  ),
  load(
    'load-frigo',
    'Frigorifero',
    'refrigerazione',
    150,
    2.5,
    'Frigorifero con compressore a funzionamento ciclico: carico ohmico-induttivo con cos φ basso. Valori tipici indicativi, modificabili.',
    0.7,
  ),
  load(
    'load-caldaia',
    'Caldaia a gas',
    'riscaldamento',
    120,
    1.5,
    'Parte elettrica di una caldaia a gas (scheda elettronica, ventilatore, circolatore). Valori tipici indicativi, modificabili.',
    0.9,
  ),
  {
    id: 'load-tri',
    kind: 'load',
    name: 'Carico trifase resistivo',
    category: 'Utilizzatori',
    description: 'Tre resistenze uguali collegate a stella (es. riscaldatore trifase). Il centro stella può essere collegato al neutro.',
    mount: 'free',
    modules: 0,
    labelPrefix: 'U',
    defaults: {
      kind: 'load',
      p: { name: 'Carico trifase', category: 'generico', powerW: 6000, on: true, cableLength: 15, cableSection: 2.5, phases: 3, withNeutral: false },
    },
  },
  {
    id: 'spd-1pn',
    kind: 'spd',
    name: 'Scaricatore di sovratensione 1P+N',
    category: 'Protezione dalle sovratensioni',
    description:
      'SPD per impianti monofase: limita le sovratensioni impulsive (fulmini, manovre) scaricandole verso il PE. In servizio ordinario non conduce. Valori di targa tipici di un tipo 2, modificabili.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'F',
    defaults: { kind: 'spd', p: { poles: '1P+N', spdType: 2, uc: 275, up: 1.5, inKA: 20 } },
  },
  {
    id: 'spd-3pn',
    kind: 'spd',
    name: 'Scaricatore di sovratensione 3P+N',
    category: 'Protezione dalle sovratensioni',
    description: 'SPD per impianti trifase con neutro. Valori di targa tipici di un tipo 2, modificabili.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'F',
    defaults: { kind: 'spd', p: { poles: '3P+N', spdType: 2, uc: 275, up: 1.5, inKA: 20 } },
  },
  unavailable('contactor', 'Contattore modulare', 'Altri dispositivi', 'richiede circuiti di comando ausiliari'),
  unavailable('step-relay', 'Relè passo-passo', 'Altri dispositivi', 'richiede circuiti di comando ausiliari'),
  unavailable('voltage-relay', 'Relè di controllo tensione', 'Altri dispositivi', 'richiede circuiti di comando ausiliari'),
  unavailable('energy-meter', 'Misuratore di energia', 'Altri dispositivi', "l'integrazione dell'energia nel tempo non è modellata"),
  unavailable('psu', 'Alimentatore modulare', 'Altri dispositivi', 'i circuiti in bassissima tensione non sono modellati'),
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export function catalogItem(id: string): CatalogItem {
  const item = CATALOG_BY_ID[id];
  if (!item) throw new Error(`Articolo di catalogo sconosciuto: ${id}`);
  return item;
}

export const KIND_LABEL: Record<ComponentKind, string> = {
  supply: 'Punto di fornitura',
  earth: 'Impianto di terra',
  switch: 'Interruttore-sezionatore',
  mcb: 'Interruttore magnetotermico',
  rcd: 'Interruttore differenziale puro',
  rcbo: 'Magnetotermico differenziale',
  bar: 'Morsettiera',
  spd: 'Scaricatore di sovratensione (SPD)',
  load: 'Utilizzatore',
};

export const IN_VALUES_MCB = [6, 10, 16, 20, 25, 32, 40, 50, 63];
export const IN_VALUES_RCD = [25, 40, 63];
export const IN_VALUES_RCBO = [6, 10, 16, 20, 25, 32];
export const IN_VALUES_SWITCH = [32, 40, 63, 80, 100];
export const ICN_VALUES = [3, 4.5, 6, 10, 15, 25];
export const IDN_VALUES = [10, 30, 100, 300];
export const RCD_TYPES = ['AC', 'A', 'F', 'B'] as const;
export const CURVES = ['B', 'C', 'D'] as const;
export const CONTRACT_KW = [1.5, 3, 4.5, 6, 10];
