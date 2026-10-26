import type { CombType, ComponentKind, ComponentParams, LoadCategory, MountType } from './types';

export type CatalogCategory =
  | 'Alimentazione'
  | 'Impianto di terra'
  | 'Manovra e sezionamento'
  | 'Magnetotermici'
  | 'Portafusibili'
  | 'Differenziali'
  | 'Magnetotermici differenziali'
  | 'Distribuzione'
  | 'Utilizzatori'
  | 'Protezione dalle sovratensioni'
  | 'Comando'
  | 'Fotovoltaico'
  | 'Altri dispositivi';

export interface CatalogItem {
  id: string;
  /** 'comb' = pettine: non è un componente, crea tratti di barra tra dispositivi affiancati */
  kind: ComponentKind | 'unavailable' | 'comb';
  /** Solo pettini: conduttori portati */
  combType?: CombType;
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
  /** Apparecchio collegato con presa a spina di questa corrente nominale [A] */
  socketRating?: number,
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
    p: { name, category, powerW, on: true, cableLength: 15, cableSection, ...(cosPhi < 1 ? { cosPhi } : {}), ...(socketRating ? { hasSockets: true, socketRating } : {}) },
  },
});

// Gli articoli non ancora simulati si aggiungono con kind "unavailable" e unavailableReason (lucchetto nel catalogo).

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
    id: 'fuse-1p',
    kind: 'fuse',
    name: 'Portafusibili 1P (10,3×38)',
    category: 'Portafusibili',
    description:
      'Sezionatore con una cartuccia gG sulla fase. Quando la corrente è eccessiva l\'elemento fusibile fonde: la cartuccia va sostituita, non si riarma.',
    mount: 'din',
    modules: 1,
    labelPrefix: 'F',
    defaults: { kind: 'fuse', p: { poles: '1P', in: 16, size: '10x38', icn: 100 } },
  },
  {
    id: 'fuse-1pn',
    kind: 'fuse',
    name: 'Portafusibili 1P+N (10,3×38)',
    category: 'Portafusibili',
    description:
      'Cartuccia gG sulla fase e neutro sezionato (barretta, senza fusibile). Aprendo la maniglia si sezionano entrambi i conduttori.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'F',
    defaults: { kind: 'fuse', p: { poles: '1P+N', in: 16, size: '10x38', icn: 100 } },
  },
  {
    id: 'fuse-3p',
    kind: 'fuse',
    name: 'Portafusibili 3P (10,3×38)',
    category: 'Portafusibili',
    description:
      'Tre cartucce gG sulle fasi. Ogni fusibile fonde da solo: se ne fonde uno solo il carico trifase resta alimentato da due fasi.',
    mount: 'din',
    modules: 3,
    labelPrefix: 'F',
    defaults: { kind: 'fuse', p: { poles: '3P', in: 16, size: '10x38', icn: 100 } },
  },
  {
    id: 'fuse-3pn',
    kind: 'fuse',
    name: 'Portafusibili 3P+N (10,3×38)',
    category: 'Portafusibili',
    description:
      'Tre cartucce gG sulle fasi e neutro sezionato senza fusibile.',
    mount: 'din',
    modules: 4,
    labelPrefix: 'F',
    defaults: { kind: 'fuse', p: { poles: '3P+N', in: 25, size: '10x38', icn: 100 } },
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
  {
    id: 'comb-1p',
    kind: 'comb',
    combType: '1P',
    name: 'Pettine 1P',
    category: 'Distribuzione',
    description:
      'Barra in rame isolata che porta la fase a più dispositivi affiancati. Trascinalo sul primo dispositivo della fila: collega gli ingressi di tutti i dispositivi adiacenti compatibili.',
    mount: 'din',
    modules: 0,
    labelPrefix: 'W',
  },
  {
    id: 'comb-1pn',
    kind: 'comb',
    combType: '1P+N',
    name: 'Pettine 1P+N',
    category: 'Distribuzione',
    description:
      'Porta fase e neutro agli ingressi di più magnetotermici 1P+N affiancati, al posto dei ponticelli in cavo. Trascinalo sul primo dispositivo della fila.',
    mount: 'din',
    modules: 0,
    labelPrefix: 'W',
  },
  {
    id: 'comb-3p',
    kind: 'comb',
    combType: '3P',
    name: 'Pettine 3P',
    category: 'Distribuzione',
    description:
      'Porta L1, L2, L3 agli ingressi di più dispositivi tripolari affiancati.',
    mount: 'din',
    modules: 0,
    labelPrefix: 'W',
  },
  {
    id: 'comb-3pn',
    kind: 'comb',
    combType: '3P+N',
    name: 'Pettine 3P+N',
    category: 'Distribuzione',
    description:
      'Porta L1, L2, L3 e N agli ingressi di più dispositivi 3P+N o 4P affiancati.',
    mount: 'din',
    modules: 0,
    labelPrefix: 'W',
  },
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
    'load-lavatrice',
    'Lavatrice',
    'lavaggio',
    2000,
    2.5,
    'Lavatrice: la potenza massima è quella della resistenza che scalda l\'acqua (circa 2 kW), a cui si somma il motore del cestello. Valori tipici indicativi, modificabili.',
    0.95,
    16,
  ),
  {
    ...load(
      'load-wallbox',
      'Wallbox (ricarica auto)',
      'ricarica',
      3700,
      6,
      "Stazione di ricarica per auto elettrica: carico grande e prolungato su linea dedicata. Può ridurre la potenza per non superare il contratto o usare solo il surplus del fotovoltaico. Valori tipici di una 16 A monofase, modificabili.",
      0.99,
    ),
    get defaults() {
      return { kind: 'load' as const, p: { name: 'Wallbox', category: 'ricarica' as const, powerW: 3700, on: true, cableLength: 15, cableSection: 6 as const, cosPhi: 0.99, evse: { mode: 'limitata' as const, minW: 1400 } } };
    },
  },
  load(
    'load-lavastoviglie',
    'Lavastoviglie',
    'lavaggio',
    1900,
    2.5,
    'Lavastoviglie: resistenza di riscaldamento dell\'acqua (circa 1,8–2 kW) più la pompa di lavaggio. Valori tipici indicativi, modificabili.',
    0.95,
    16,
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
  {
    id: 'pv-string',
    kind: 'pv-array',
    name: 'Generatore fotovoltaico (stringhe di moduli)',
    category: 'Fotovoltaico',
    description:
      'Moduli fotovoltaici in serie (stringa) e stringhe in parallelo. Produce corrente continua in funzione di irraggiamento e temperatura. Dati di targa di un modulo da 400 Wp tipico, modificabili.',
    mount: 'free',
    modules: 0,
    labelPrefix: 'PV',
    defaults: {
      kind: 'pv-array',
      p: { name: 'Falda sud', moduleWp: 400, vmp: 34, imp: 11.77, voc: 41, isc: 12.5, tcVoc: -0.27, tcPmax: -0.35, tcIsc: 0.05, noct: 45, modulesPerString: 8, strings: 1 },
    },
  },
  {
    id: 'pv-inverter',
    kind: 'inverter',
    name: 'Inverter fotovoltaico monofase',
    category: 'Fotovoltaico',
    description:
      "Converte la corrente continua dei moduli in alternata a 230 V e la immette nell'impianto. Insegue il punto di massima potenza (MPPT) e si spegne se manca la rete. Dati tipici di un 3 kW, modificabili.",
    mount: 'free',
    modules: 0,
    labelPrefix: 'INV',
    defaults: { kind: 'inverter', p: { pacW: 3000, efficiency: 97, maxDcV: 600, mpptMinV: 90, mpptMaxV: 550, maxDcA: 16, batteryKWh: 0, batteryW: 0 } },
  },
  {
    id: 'pv-inverter-hybrid',
    kind: 'inverter',
    name: 'Inverter ibrido con accumulo',
    category: 'Fotovoltaico',
    description:
      "Inverter fotovoltaico con batteria: l'energia prodotta in più viene accumulata e usata quando i moduli non bastano. L'accumulo è considerato nell'analisi della giornata tipo.",
    mount: 'free',
    modules: 0,
    labelPrefix: 'INV',
    defaults: { kind: 'inverter', p: { pacW: 3000, efficiency: 97, maxDcV: 600, mpptMinV: 90, mpptMaxV: 550, maxDcA: 16, batteryKWh: 5, batteryW: 2500 } },
  },
  {
    id: 'dc-switch-2p',
    kind: 'dc-switch',
    name: 'Sezionatore DC 2P (fotovoltaico)',
    category: 'Fotovoltaico',
    description:
      "Sezionatore per corrente continua tra moduli e inverter: permette di separare l'inverter dalla stringa. Va aperto solo a inverter spento: un arco in continua non si estingue da solo come in alternata.",
    mount: 'din',
    modules: 2,
    labelPrefix: 'QDC',
    defaults: { kind: 'dc-switch', p: { in: 25, maxV: 1000 } },
  },
  {
    id: 'spd-dc',
    kind: 'spd',
    name: 'Scaricatore di sovratensione DC (fotovoltaico)',
    category: 'Fotovoltaico',
    description: 'SPD per il lato in corrente continua del fotovoltaico, collegato tra +, − e terra. Valori tipici di un tipo 2 per 1000 V DC, modificabili.',
    mount: 'din',
    modules: 3,
    labelPrefix: 'FDC',
    defaults: { kind: 'spd', p: { poles: 'DC', spdType: 2, uc: 1000, up: 4, inKA: 20 } },
  },
  {
    id: 'contactor',
    kind: 'contactor',
    name: 'Contattore modulare 2NA',
    category: 'Comando',
    description:
      "Interruttore comandato da una bobina: i contatti restano chiusi finché A1-A2 sono alimentati. Si usa per comandare carichi da un interruttore, un orologio o un altro circuito di comando.",
    mount: 'din',
    modules: 2,
    labelPrefix: 'KM',
    defaults: { kind: 'contactor', p: { poles: '2NO', in: 25, coilV: 230 } },
  },
  {
    id: 'contactor-4no',
    kind: 'contactor',
    name: 'Contattore modulare 4NA',
    category: 'Comando',
    description: 'Contattore a quattro contatti NA per carichi trifase con neutro, comandato dalla bobina A1-A2.',
    mount: 'din',
    modules: 3,
    labelPrefix: 'KM',
    defaults: { kind: 'contactor', p: { poles: '4NO', in: 25, coilV: 230 } },
  },
  {
    id: 'step-relay',
    kind: 'relay',
    name: 'Relè passo-passo (bistabile)',
    category: 'Comando',
    description:
      'Comanda una luce da più punti con pulsanti: a ogni impulso sulla bobina A1-A2 il contatto 1-2 cambia stato e resta nella nuova posizione. Ha anche la leva per il comando manuale.',
    mount: 'din',
    modules: 1,
    labelPrefix: 'KA',
    defaults: { kind: 'relay', p: { in: 16, coilV: 230 } },
  },
  {
    id: 'pushbutton',
    kind: 'button',
    name: 'Pulsante (normalmente aperto)',
    category: 'Comando',
    description: 'Pulsante a parete: chiude il contatto solo mentre è premuto. Collegato in parallelo ad altri pulsanti invia l\'impulso alla bobina del relè passo-passo.',
    mount: 'free',
    modules: 0,
    labelPrefix: 'SB',
    defaults: { kind: 'button', p: { name: 'Pulsante' } },
  },
  {
    id: 'wall-switch',
    kind: 'wall-switch',
    name: 'Interruttore unipolare (comando luce)',
    category: 'Comando',
    description:
      "Comanda una luce da un punto: apre o chiude la fase. Morsetti L (ingresso) e 1 (uscita verso la lampada).",
    mount: 'free',
    modules: 0,
    labelPrefix: 'S',
    defaults: { kind: 'wall-switch', p: { type: 'interruttore', name: 'Interruttore unipolare' } },
  },
  {
    id: 'wall-deviatore',
    kind: 'wall-switch',
    name: 'Deviatore',
    category: 'Comando',
    description:
      "Commutatore a due vie: il comune C si collega al morsetto 1 oppure al 2. Due deviatori collegati con i conduttori navetta comandano una luce da due punti.",
    mount: 'free',
    modules: 0,
    labelPrefix: 'S',
    defaults: { kind: 'wall-switch', p: { type: 'deviatore', name: 'Deviatore' } },
  },
  {
    id: 'wall-invertitore',
    kind: 'wall-switch',
    name: 'Invertitore',
    category: 'Comando',
    description:
      "Inserito tra due deviatori, sui conduttori navetta, aggiunge un punto di comando: collega 1-3 e 2-4 oppure le incrocia (1-4 e 2-3).",
    mount: 'free',
    modules: 0,
    labelPrefix: 'S',
    defaults: { kind: 'wall-switch', p: { type: 'invertitore', name: 'Invertitore' } },
  },
  {
    id: 'voltage-relay',
    kind: 'voltage-relay',
    name: 'Relè di controllo tensione (min/max)',
    category: 'Comando',
    description:
      "Controlla la tensione fase-neutro e apre la fase verso gli utilizzatori se esce dall'intervallo impostato (es. neutro interrotto, sovratensioni). Si richiude da solo quando la tensione rientra.",
    mount: 'din',
    modules: 2,
    labelPrefix: 'KV',
    defaults: { kind: 'voltage-relay', p: { umin: 184, umax: 264 } },
  },
  {
    id: 'energy-meter',
    kind: 'meter',
    name: 'Misuratore di energia 1P+N',
    category: 'Distribuzione',
    description:
      'Misura potenza ed energia che lo attraversano nei due versi (prelievo e immissione). Usato come contatore di produzione del fotovoltaico o per misurare un circuito.',
    mount: 'din',
    modules: 2,
    labelPrefix: 'P',
    defaults: { kind: 'meter', p: { name: 'Contatore' } },
  },
  {
    id: 'psu',
    kind: 'psu',
    name: 'Alimentatore modulare 12 V DC',
    category: 'Distribuzione',
    description:
      "Trasforma i 230 V in bassissima tensione continua (12 o 24 V) per circuiti di comando, strisce LED, campanelli. L'uscita è isolata dalla rete.",
    mount: 'din',
    modules: 2,
    labelPrefix: 'G',
    defaults: { kind: 'psu', p: { vout: 12, pmaxW: 60, loadW: 30, efficiency: 88 } },
  },
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
  fuse: 'Sezionatore portafusibili',
  rcd: 'Interruttore differenziale puro',
  rcbo: 'Magnetotermico differenziale',
  bar: 'Morsettiera',
  spd: 'Scaricatore di sovratensione (SPD)',
  relay: 'Relè passo-passo',
  button: 'Pulsante',
  'wall-switch': 'Comando luce a parete',
  contactor: 'Contattore',
  'voltage-relay': 'Relè di controllo tensione',
  psu: 'Alimentatore',
  'pv-array': 'Generatore fotovoltaico',
  inverter: 'Inverter fotovoltaico',
  'dc-switch': 'Sezionatore DC',
  meter: 'Misuratore di energia',
  load: 'Utilizzatore',
};

export const IN_VALUES_MCB = [6, 10, 16, 20, 25, 32, 40, 50, 63];
/** Correnti nominali delle cartucce gG 10,3×38 */
export const IN_VALUES_FUSE = [2, 4, 6, 8, 10, 12, 16, 20, 25, 32];
export const IN_VALUES_RCD = [25, 40, 63];
export const IN_VALUES_RCBO = [6, 10, 16, 20, 25, 32];
export const IN_VALUES_SWITCH = [32, 40, 63, 80, 100];
export const ICN_VALUES = [3, 4.5, 6, 10, 15, 25];
export const IDN_VALUES = [10, 30, 100, 300];
export const RCD_TYPES = ['AC', 'A', 'F', 'B'] as const;
export const CURVES = ['B', 'C', 'D'] as const;
export const CONTRACT_KW = [1.5, 3, 4.5, 6, 10];
