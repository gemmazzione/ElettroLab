/**
 * Modello dati di ElectroLab.
 * Il progetto è la fonte di verità: la vista grafica e il motore di simulazione
 * ne derivano rispettivamente il disegno e il circuito elettrico.
 */

export type XY = { x: number; y: number };

/** Funzione elettrica di un morsetto. "L" indica un conduttore di fase generico. */
export type TerminalFunction = 'L' | 'N' | 'PE';

/** Identificazione del conduttore (funzione + fase). */
export type Conductor = 'L1' | 'L2' | 'L3' | 'N' | 'PE';

export type WireColor = 'marrone' | 'nero' | 'grigio' | 'blu' | 'giallo-verde';

export const WIRE_SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25] as const;
export type WireSection = (typeof WIRE_SECTIONS)[number];

export type ComponentKind =
  | 'supply'
  | 'earth'
  | 'switch'
  | 'mcb'
  | 'fuse'
  | 'rcd'
  | 'rcbo'
  | 'bar'
  | 'spd'
  | 'relay'
  | 'button'
  | 'load';

export type MountType = 'din' | 'free';

export type PoleConfig = '1P' | '1P+N' | '2P' | '3P' | '3P+N' | '4P';

/** Fase della rete (1 = L1, 2 = L2, 3 = L3) */
export type Phase = 1 | 2 | 3;

export type TripCurve = 'B' | 'C' | 'D';
export type RcdType = 'AC' | 'A' | 'F' | 'B';
export type LoadCategory =
  | 'refrigerazione'
  | 'riscaldamento'
  | 'illuminazione'
  | 'prese'
  | 'cucina'
  | 'scaldabagno'
  | 'climatizzazione'
  | 'lavaggio'
  | 'generico';

// ---------------------------------------------------------------- parametri

export interface SupplyParams {
  /** Tensione nominale fase-neutro [V] */
  voltage: number;
  frequency: number;
  /** Potenza contrattuale impegnata [kW] */
  contractKW: number;
  /** Resistenza dell'anello di rete a monte (fase + neutro) [Ω] */
  rNetwork: number;
  /** Reattanza dell'anello di rete a monte (fase + neutro) [Ω] */
  xNetwork: number;
  /** Resistenza di terra del neutro in cabina, sistema TT [Ω] */
  rb: number;
  /** 1 = monofase L-N, 3 = trifase L1-L2-L3-N (default 1) */
  phases?: 1 | 3;
}

export interface EarthParams {
  /** Resistenza del dispersore dell'impianto utente [Ω] */
  ra: number;
  /** RA proviene da una misura strumentale (altrimenti è un valore di progetto) */
  raMeasured?: boolean;
}

/** Dati di posa della conduttura, necessari alla verifica di dimensionamento. */
export interface CableInstall {
  method: 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'E';
  insulation: 'PVC' | 'EPR';
  /** Temperatura ambiente [°C] */
  ambientC: number;
  /** Numero di circuiti raggruppati (incluso questo) */
  grouped: number;
  /** Portata Iz inserita dall'utente (tabella CEI-UNEL o costruttore) [A] */
  izOverride?: number | null;
}

export interface SwitchParams {
  poles: PoleConfig;
  in: number;
}

export interface McbParams {
  poles: PoleConfig;
  in: number;
  curve: TripCurve;
  /** Potere di interruzione nominale Icn [kA] */
  icn: number;
}

/** Sezionatore portafusibili modulare con cartucce cilindriche gG. */
export interface FuseParams {
  poles: '1P' | '1P+N' | '3P' | '3P+N';
  /** Corrente nominale della cartuccia [A] */
  in: number;
  /** Formato della cartuccia */
  size: '10x38';
  /** Potere di interruzione nominale [kA] */
  icn: number;
}

export interface RcdParams {
  poles: PoleConfig;
  in: number;
  /** Corrente differenziale nominale IΔn [mA] */
  idn: number;
  rcdType: RcdType;
  selective: boolean;
}

export interface RcboParams {
  poles: PoleConfig;
  in: number;
  curve: TripCurve;
  icn: number;
  idn: number;
  rcdType: RcdType;
}

/** Scaricatore di sovratensione (SPD) */
export interface SpdParams {
  /** '1P+N' (L, N, PE) oppure '3P+N' (L1, L2, L3, N, PE) */
  poles: '1P+N' | '3P+N';
  /** Tipo di prova secondo la norma di prodotto: 1, 2 o 3 */
  spdType: 1 | 2 | 3;
  /** Tensione massima continuativa Uc [V] */
  uc: number;
  /** Livello di protezione Up [kV] */
  up: number;
  /** Corrente nominale di scarica In [kA] */
  inKA: number;
}

/** Relè passo-passo (bistabile): il contatto cambia stato a ogni impulso sulla bobina A1-A2. */
export interface RelayParams {
  /** Corrente nominale del contatto [A] */
  in: number;
  /** Tensione nominale della bobina [V] */
  coilV: number;
}

/** Pulsante di comando (contatto momentaneo, normalmente aperto). */
export interface ButtonParams {
  name: string;
}

export interface BarParams {
  barFn: TerminalFunction;
  ways: number;
}

export interface LoadParams {
  name: string;
  category: LoadCategory;
  /** Potenza nominale alla tensione nominale [W] */
  powerW: number;
  /** Utilizzatore acceso (interruttore locale/apparecchio in funzione) */
  on: boolean;
  /** Lunghezza della conduttura quadro → utilizzatore [m] */
  cableLength: number;
  /** Sezione dei conduttori della conduttura [mm²] */
  cableSection: WireSection;
  /** Dati di posa (assenti = dati insufficienti per le verifiche di dimensionamento) */
  install?: CableInstall;
  /** Il circuito alimenta prese a spina (default: categoria "prese") */
  hasSockets?: boolean;
  /** Corrente nominale delle prese a spina [A] */
  socketRating?: number;
  /** 1 = monofase (L, N), 3 = trifase a stella (L1, L2, L3) (default 1) */
  phases?: 1 | 3;
  /** Solo trifase: centro stella collegato al neutro */
  withNeutral?: boolean;
  /** Fattore di potenza (carico ohmico-induttivo); 1 = resistivo (default) */
  cosPhi?: number;
}

export type ComponentParams =
  | { kind: 'supply'; p: SupplyParams }
  | { kind: 'earth'; p: EarthParams }
  | { kind: 'switch'; p: SwitchParams }
  | { kind: 'mcb'; p: McbParams }
  | { kind: 'fuse'; p: FuseParams }
  | { kind: 'rcd'; p: RcdParams }
  | { kind: 'rcbo'; p: RcboParams }
  | { kind: 'bar'; p: BarParams }
  | { kind: 'spd'; p: SpdParams }
  | { kind: 'relay'; p: RelayParams }
  | { kind: 'button'; p: ButtonParams }
  | { kind: 'load'; p: LoadParams };

export interface RailPlacement {
  /** Quadro di appartenenza (assente = primo quadro del progetto) */
  panelId?: string;
  row: number;
  slot: number;
}

export interface ComponentInstance {
  id: string;
  /** Chiave dell'articolo di catalogo */
  catalogId: string;
  label: string;
  params: ComponentParams;
  /** Posizione per componenti a montaggio libero (fuori dal quadro) */
  position: XY;
  /** Posizione sulle guide DIN (solo componenti DIN) */
  rail?: RailPlacement;
  /** Stato dei contatti di manovra (dispositivi con leva) */
  closed: boolean;
  /** Portafusibili: indici dei poli con la cartuccia fusa (da sostituire) */
  blown?: number[];
}

export interface Wire {
  id: string;
  /** Identificativo del morsetto di partenza "<compId>:<key>" */
  from: string;
  to: string;
  conductor: Conductor;
  color: WireColor;
  section: WireSection;
  /** Lunghezza [m] */
  length: number;
}

/**
 * Guasti simulabili. Sono elementi reali aggiunti (o tolti) dal circuito, non effetti grafici.
 * - short-LN: cortocircuito fase-neutro all'utilizzatore
 * - L-PE: guasto d'isolamento verso la massa dell'apparecchio
 * - L-earth: contatto diretto fase-terra (es. persona) con resistenza Rf
 * - open-N / open-PE / open-L: interruzione del conduttore nella linea dell'utilizzatore
 * - open-wire: interruzione di un conduttore del quadro
 */
export type FaultType = 'overload' | 'short-LN' | 'short-LL' | 'L-PE' | 'L-earth' | 'open-N' | 'open-PE' | 'open-L' | 'open-wire';

export interface Fault {
  id: string;
  type: FaultType;
  /** Utilizzatore (per i guasti di linea) o conduttore (per open-wire) */
  targetId: string;
  /** Resistenza di guasto [Ω] per short-LN, short-LL, L-PE, L-earth */
  resistance: number;
  /** Guasto nascosto (esercizi di ricerca guasti): non mostrato nell'interfaccia */
  hidden?: boolean;
  /** Sovraccarico: potenza aggiuntiva collegata alla linea [W] */
  powerW?: number;
}

/** Parametri del contesto normativo del progetto. */
export interface NormSettings {
  /** Locali ad uso abitativo */
  residential: boolean;
  /** Tensione di contatto limite convenzionale UL [V] */
  ul: number;
  /** Corrente di cortocircuito dichiarata dal distributore al punto di consegna [kA] */
  declaredIccKA?: number | null;
}

export interface PanelConfig {
  modulesPerRow: number;
  rows: number;
}

/** Quadro elettrico: involucro con guide DIN, posizionato nell'area di lavoro. */
export interface PanelDef extends PanelConfig {
  id: string;
  name: string;
  /** Angolo superiore sinistro nell'area di lavoro */
  origin: XY;
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  /** Quadri del progetto (il primo è il quadro generale) */
  panels: PanelDef[];
  components: ComponentInstance[];
  wires: Wire[];
  /** Guasti attivi (scenario di simulazione) */
  faults?: Fault[];
  /** Contesto normativo (assente = valori predefiniti) */
  norm?: NormSettings;
  updatedAt: string;
}

// ---------------------------------------------------------------- morsetti

export type TerminalSide = 'top' | 'bottom';
/** Ruolo del morsetto rispetto al polo: ingresso, uscita o morsetto di barra/utenza */
export type TerminalRole = 'in' | 'out' | 'bus';

export interface TerminalDef {
  key: string;
  /** Marcatura stampata sul dispositivo (1, 2, N, PE…) */
  label: string;
  fn: TerminalFunction;
  role: TerminalRole;
  side: TerminalSide;
  /** Indice del polo (dispositivi di manovra) */
  pole?: number;
  /** Fase fissa del morsetto (solo punto di fornitura) */
  phase?: Phase;
  /** Posizione orizzontale del morsetto rispetto al bordo sinistro [px] */
  x: number;
}

/** Morsetto risolto di un'istanza: conosce il componente e la propria funzione. */
export interface Terminal extends TerminalDef {
  id: string;
  componentId: string;
}

export interface PoleDef {
  index: number;
  fn: TerminalFunction;
  inKey: string;
  outKey: string;
  /** Polo protetto da sganciatore di sovracorrente */
  protected: boolean;
}
