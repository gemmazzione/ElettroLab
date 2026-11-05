import type { Insulation, InstallMethod } from '../rules/ampacity';
import type { WireSection } from '../model/types';

/**
 * «Progetta impianto»: progetto di un impianto elettrico utilizzatore in bassa tensione come lo imposta un progettista.
 * Dati generali (destinazione d'uso, fornitura, sistema di distribuzione), elenco delle linee in partenza dal quadro
 * generale e risultato del dimensionamento (calc.ts). Il progetto è uno strumento di studio: non sostituisce il
 * progetto firmato da un professionista né i dati dei costruttori.
 */

export type PlantUse = 'abitazione' | 'condominio' | 'ufficio' | 'negozio' | 'industria';
export type SupplyKind = 'bt-mono' | 'bt-tri' | 'cabina';
export type LineKind = 'luce' | 'prese' | 'cucina' | 'clima' | 'scaldabagno' | 'ricarica' | 'fm' | 'motore' | 'sottoquadro' | 'generico';
export type Curve = 'B' | 'C' | 'D';

export interface PlantLine {
  id: string;
  name: string;
  kind: LineKind;
  /** 1 = monofase L-N, 3 = trifase */
  phases: 1 | 3;
  /** Solo trifase: con neutro distribuito (cavo a 5 anime) */
  withNeutral: boolean;
  /** Fase delle linee monofase in una fornitura trifase: 0 = scelta automatica (bilanciamento) */
  phase: 0 | 1 | 2 | 3;
  /** Potenza installata [W] */
  powerW: number;
  cosPhi: number;
  /** Coefficiente di utilizzazione (quota della potenza assorbita in servizio) */
  ku: number;
  lengthM: number;
  method: InstallMethod;
  insulation: Insulation;
  ambientC: number;
  /** Circuiti nella stessa canalizzazione (fattore di raggruppamento) */
  grouped: number;
  curve: Curve;
  /** Differenziale della linea [mA]: 0 = nessuno */
  rcdMa: 0 | 30 | 100 | 300;
  rcdType: 'AC' | 'A' | 'F' | 'B';
  /** Quadro da cui parte la linea: '' = quadro generale, altrimenti id della linea «sottoquadro» che lo alimenta */
  boardId: string;
  /** Differenziale di gruppo che protegge la linea ('' = differenziale proprio secondo rcdMa) */
  rcdGroup: string;
  /** Solo sottoquadri: differenziale selettivo (tipo S) sulla linea */
  rcdS?: boolean;
  /** Solo sottoquadri: contemporaneità sul sottoquadro */
  kcSub?: number;
  /** Solo motori: tipo di avviamento */
  starting?: 'diretto' | 'stella-triangolo' | 'inverter';
  /** La linea alimenta componenti in un locale da bagno o doccia (CEI 64-8 Sez. 701) */
  bathroom?: boolean;
  /** Scelte manuali del progettista (assenti = calcolate) */
  sectionOverride?: WireSection;
  inOverride?: number;
}

/** Differenziale puro che protegge un gruppo di linee dello stesso quadro. */
export interface RcdGroup {
  id: string;
  name: string;
  /** Quadro: '' = generale, altrimenti id della linea del sottoquadro */
  boardId: string;
  idnMa: 30 | 100 | 300 | 500;
  type: 'AC' | 'A' | 'F' | 'B';
  /** Selettivo (tipo S) */
  s: boolean;
}

export interface Plant {
  version: 1;
  id: string;
  name: string;
  client: string;
  address: string;
  designer: string;
  use: PlantUse;
  areaM2: number;
  /** Ambienti particolari (DM 37/2008 art. 5 c. 2 lett. d) */
  special: { medical: boolean; explosion: boolean; fire: boolean };
  supply: {
    kind: SupplyKind;
    /** Potenza contrattuale impegnata [kW] (forniture in BT) */
    contractKW: number;
    /** Corrente di cortocircuito presunta al punto di consegna [kA] (BT, dato del distributore) */
    iccKA: number;
    /** Cabina MT/BT */
    kva: number;
    ukPct: number;
    mvSccMVA: number;
  };
  /** TT con fornitura in BT; TN-S con cabina propria */
  earthing: 'TT' | 'TN-S';
  /** Resistenza di terra dell'impianto (TT) [Ω] */
  raOhm: number;
  /** Linea dal punto di consegna (contatore o trasformatore) al quadro generale */
  feeder: { lengthM: number; method: InstallMethod; insulation: Insulation; sectionOverride?: WireSection };
  /** Coefficiente di contemporaneità sul quadro generale */
  kc: number;
  /** Caduta di tensione massima origine → utilizzatore [%] */
  maxDropPct: number;
  lines: PlantLine[];
  rcdGroups: RcdGroup[];
  /** Differenziale sull'interruttore generale [mA] (0 = nessuno) e se selettivo */
  mainRcdMa: 0 | 100 | 300 | 500 | 1000;
  mainRcdS: boolean;
  /** Batteria di rifasamento installata sul quadro generale [kvar] (0 = nessuna) */
  pfcKvar: number;
  /** Dispersore (TT): resistività del terreno [Ω·m] e lunghezza dei picchetti [m] */
  soilOhmM: number;
  rodLengthM: number;
  notes: string;
  /** Ultima modifica (per unire le copie del browser e dell'account) */
  updated: string;
}

export const USE_LABEL: Record<PlantUse, string> = {
  abitazione: 'Abitazione (singola unità)',
  condominio: 'Parti comuni condominiali',
  ufficio: 'Ufficio / terziario',
  negozio: 'Negozio / commercio',
  industria: 'Attività produttiva',
};

export const SUPPLY_LABEL: Record<SupplyKind, string> = {
  'bt-mono': 'Bassa tensione monofase 230 V',
  'bt-tri': 'Bassa tensione trifase 400 V',
  cabina: 'Media tensione con cabina MT/BT propria',
};

export const KIND_LABEL: Record<LineKind, string> = {
  luce: 'Illuminazione',
  prese: 'Prese',
  cucina: 'Cucina / forno',
  clima: 'Climatizzazione',
  scaldabagno: 'Scaldabagno',
  ricarica: 'Ricarica auto',
  fm: 'Forza motrice',
  motore: 'Motore',
  sottoquadro: 'Sottoquadro',
  generico: 'Altro',
};

export const newId = (p = 'l') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Valori tipici per una nuova linea di ogni tipo (il progettista li corregge). */
export function lineTemplate(kind: LineKind, threePhase: boolean): Omit<PlantLine, 'id'> {
  const base: Omit<PlantLine, 'id'> = {
    name: KIND_LABEL[kind],
    kind,
    phases: 1,
    withNeutral: true,
    phase: 0,
    powerW: 2000,
    cosPhi: 0.95,
    ku: 1,
    lengthM: 20,
    method: 'B1',
    insulation: 'PVC',
    ambientC: 30,
    grouped: 3,
    curve: 'C',
    rcdMa: 30,
    rcdType: 'A',
    boardId: '',
    rcdGroup: '',
  };
  switch (kind) {
    case 'luce':
      return { ...base, powerW: 1000, cosPhi: 0.9, curve: 'B', ku: 1 };
    case 'prese':
      return { ...base, powerW: 3000, ku: 0.5, cosPhi: 0.9 };
    case 'cucina':
      return { ...base, powerW: 3500, cosPhi: 1, ku: 0.8, lengthM: 12 };
    case 'clima':
      return { ...base, powerW: 2500, cosPhi: 0.9, ku: 1, lengthM: 15 };
    case 'scaldabagno':
      return { ...base, powerW: 1500, cosPhi: 1, lengthM: 10 };
    case 'ricarica':
      return threePhase
        ? { ...base, phases: 3, powerW: 11000, cosPhi: 0.99, lengthM: 25, rcdType: 'A' }
        : { ...base, powerW: 3700, cosPhi: 0.99, lengthM: 25, rcdType: 'A' };
    case 'fm':
      return { ...base, phases: threePhase ? 3 : 1, powerW: threePhase ? 9000 : 3000, cosPhi: 0.85, ku: 0.7, lengthM: 30, method: 'C', grouped: 1 };
    case 'motore':
      return { ...base, phases: threePhase ? 3 : 1, withNeutral: false, powerW: threePhase ? 8700 : 2400, cosPhi: 0.84, ku: 0.9, lengthM: 30, method: 'C', grouped: 1, curve: 'D', rcdMa: threePhase ? 300 : 30, starting: 'diretto' };
    case 'sottoquadro':
      return { ...base, phases: threePhase ? 3 : 1, powerW: threePhase ? 20000 : 4500, cosPhi: 0.9, ku: 0.7, lengthM: 40, method: 'C', grouped: 1, rcdMa: threePhase ? 300 : 0, rcdType: 'A', rcdS: true, kcSub: 0.8 };
    default:
      return base;
  }
}

export function line(kind: LineKind, threePhase: boolean, patch: Partial<PlantLine> = {}): PlantLine {
  return { ...lineTemplate(kind, threePhase), id: newId(), ...patch };
}

export function defaultPlant(): Plant {
  return examplePlants()[0]!.make();
}

export const isThreePhaseSupply = (p: Plant) => p.supply.kind !== 'bt-mono';

/** Coerenza dei dati dopo una modifica: linee trifase solo con forniture trifase, sistema TN-S solo con cabina. */
export function normalizePlant(raw: unknown): Plant {
  const base = defaultPlant();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<Plant>;
  const p: Plant = {
    ...base,
    ...o,
    version: 1,
    special: { ...base.special, ...(o.special ?? {}) },
    supply: { ...base.supply, ...(o.supply ?? {}) },
    feeder: { ...base.feeder, ...(o.feeder ?? {}) },
    lines: Array.isArray(o.lines) ? o.lines.map((l) => ({ ...lineTemplate((l as PlantLine).kind ?? 'generico', true), ...(l as PlantLine) })) : base.lines,
    rcdGroups: Array.isArray(o.rcdGroups) ? o.rcdGroups : [],
    updated: typeof o.updated === 'string' ? o.updated : '',
  };
  return coherent(p);
}

export function coherent(p: Plant): Plant {
  const tri = isThreePhaseSupply(p);
  const earthing = p.supply.kind === 'cabina' ? 'TN-S' : 'TT';
  // Quadri esistenti: le linee di un sottoquadro eliminato tornano sul generale; i gruppi seguono il loro quadro.
  const boards = new Set(['', ...p.lines.filter((l) => l.kind === 'sottoquadro').map((l) => l.id)]);
  const rcdGroups = p.rcdGroups.filter((g) => boards.has(g.boardId));
  const groups = new Map(rcdGroups.map((g) => [g.id, g]));
  const phasesOf = new Map(p.lines.map((l) => [l.id, l.phases]));
  const lines = p.lines.map((l) => {
    let x = l;
    if (!tri) x = { ...x, phases: 1, phase: 0 };
    if (!boards.has(x.boardId) || x.boardId === x.id) x = { ...x, boardId: '' };
    // Un sottoquadro monofase alimenta solo linee monofase.
    if (x.boardId && phasesOf.get(x.boardId) === 1) x = { ...x, phases: 1, phase: 0 };
    const g = groups.get(x.rcdGroup);
    if (x.rcdGroup && (!g || g.boardId !== x.boardId)) x = { ...x, rcdGroup: '' };
    return x;
  });
  return { ...p, earthing, lines, rcdGroups };
}

/** Quadri dell'impianto: il generale e uno per ogni linea «sottoquadro». */
export function boardsOf(p: Plant): { id: string; name: string }[] {
  return [{ id: '', name: 'Quadro generale' }, ...p.lines.filter((l) => l.kind === 'sottoquadro').map((l) => ({ id: l.id, name: l.name }))];
}

// ------------------------------------------------------------------ esempi

export interface PlantExample {
  id: string;
  title: string;
  text: string;
  make: () => Plant;
}

const plantBase = (patch: Partial<Plant>): Plant => ({
  version: 1,
  id: newId('imp'),
  name: 'Nuovo impianto',
  client: '',
  address: '',
  designer: '',
  use: 'abitazione',
  areaM2: 100,
  special: { medical: false, explosion: false, fire: false },
  supply: { kind: 'bt-mono', contractKW: 6, iccKA: 6, kva: 400, ukPct: 4, mvSccMVA: 500 },
  earthing: 'TT',
  raOhm: 30,
  feeder: { lengthM: 15, method: 'B1', insulation: 'PVC' },
  kc: 0.8,
  maxDropPct: 4,
  lines: [],
  rcdGroups: [],
  mainRcdMa: 0,
  mainRcdS: true,
  pfcKvar: 0,
  soilOhmM: 100,
  rodLengthM: 1.5,
  notes: '',
  updated: '',
  ...patch,
});

const G = (id: string, name: string, idnMa: RcdGroup['idnMa'] = 30, extra: Partial<RcdGroup> = {}): RcdGroup => ({ id, name, boardId: '', idnMa, type: 'A', s: false, ...extra });

export function examplePlants(): PlantExample[] {
  return [
    {
      id: 'appartamento',
      title: 'Appartamento 110 m², 6 kW',
      text: 'Fornitura monofase, sistema TT, due differenziali di gruppo e un bagno.',
      make: () => {
        const g1 = 'g' + newId();
        const g2 = 'g' + newId();
        const grp = (id: string) => ({ rcdGroup: id, rcdMa: 0 as const });
        return plantBase({
          name: 'Appartamento 110 m²',
          areaM2: 110,
          kc: 0.5,
          rcdGroups: [G(g1, 'Luci e prese'), G(g2, 'Cucina e servizi')],
          lines: [
            line('luce', false, { name: 'Luci zona giorno', powerW: 800, lengthM: 22, ...grp(g1) }),
            line('luce', false, { name: 'Luci zona notte e bagno', powerW: 600, lengthM: 26, bathroom: true, ...grp(g1) }),
            line('prese', false, { name: 'Prese zona giorno', lengthM: 24, ...grp(g1) }),
            line('prese', false, { name: 'Prese zona notte e bagno', lengthM: 28, bathroom: true, ...grp(g1) }),
            line('cucina', false, { name: 'Piano a induzione', powerW: 3700, ku: 0.6, lengthM: 10, ...grp(g2) }),
            line('prese', false, { name: 'Lavatrice e lavastoviglie', powerW: 4000, ku: 0.5, cosPhi: 0.95, lengthM: 14, ...grp(g2) }),
            line('scaldabagno', false, { name: 'Scaldabagno', powerW: 1200, lengthM: 9, bathroom: true, ...grp(g2) }),
            line('clima', false, { name: 'Climatizzatori', powerW: 2600, lengthM: 20 }),
          ],
        });
      },
    },
    {
      id: 'negozio',
      title: 'Negozio 250 m², 20 kW trifase',
      text: 'Fornitura trifase, linee monofase bilanciate sulle fasi, condizionamento e ricarica trifase.',
      make: () => {
        const g1 = 'g' + newId();
        return plantBase({
          name: 'Negozio 250 m²',
          use: 'negozio',
          areaM2: 250,
          supply: { kind: 'bt-tri', contractKW: 20, iccKA: 10, kva: 400, ukPct: 4, mvSccMVA: 500 },
          feeder: { lengthM: 25, method: 'B1', insulation: 'EPR' },
          kc: 0.75,
          rcdGroups: [G(g1, 'Luci', 30)],
          lines: [
            line('luce', true, { name: 'Luci area vendita', powerW: 2400, lengthM: 35, rcdGroup: g1, rcdMa: 0 }),
            line('luce', true, { name: 'Luci vetrine e insegna', powerW: 1200, lengthM: 20, rcdGroup: g1, rcdMa: 0 }),
            line('luce', true, { name: 'Luci retro e servizi', powerW: 500, lengthM: 30, rcdGroup: g1, rcdMa: 0, bathroom: true }),
            line('prese', true, { name: 'Prese area vendita', lengthM: 35 }),
            line('prese', true, { name: 'Prese ufficio e cassa', powerW: 2500, lengthM: 18 }),
            line('clima', true, { name: 'Pompa di calore', phases: 3, powerW: 8000, cosPhi: 0.9, lengthM: 30, method: 'C', grouped: 1 }),
            line('ricarica', true, { name: 'Wallbox clienti', lengthM: 40, method: 'C', grouped: 1 }),
          ],
        });
      },
    },
    {
      id: 'officina',
      title: 'Officina con cabina 400 kVA',
      text: 'Cabina MT/BT propria, sistema TN-S, motori, forza motrice e il sottoquadro degli uffici.',
      make: () => {
        const qu = line('sottoquadro', true, { name: 'Quadro uffici', lengthM: 60, method: 'E', insulation: 'EPR', kcSub: 0.8 });
        const gu = 'g' + newId();
        const sub = (kind: LineKind, patch: Partial<PlantLine>) => line(kind, true, { boardId: qu.id, lengthM: 18, ...patch });
        return plantBase({
          name: 'Officina meccanica',
          use: 'industria',
          areaM2: 1200,
          supply: { kind: 'cabina', contractKW: 250, iccKA: 15, kva: 400, ukPct: 4, mvSccMVA: 500 },
          earthing: 'TN-S',
          feeder: { lengthM: 10, method: 'E', insulation: 'EPR' },
          kc: 0.7,
          rcdGroups: [G(gu, 'Uffici luci e prese', 30, { boardId: qu.id })],
          lines: [
            line('motore', true, { name: 'Compressore 30 kW', powerW: 33000, cosPhi: 0.86, lengthM: 40, method: 'E', insulation: 'EPR', starting: 'stella-triangolo' }),
            line('motore', true, { name: 'Tornio 11 kW', powerW: 12600, cosPhi: 0.85, lengthM: 35, method: 'E', insulation: 'EPR' }),
            line('fm', true, { name: 'Forza motrice banchi', powerW: 15000, lengthM: 50, method: 'E', insulation: 'EPR' }),
            qu,
            line('luce', true, { name: 'Illuminazione capannone', phases: 3, powerW: 6000, cosPhi: 0.95, lengthM: 70, method: 'E', insulation: 'EPR', grouped: 1, rcdMa: 0 }),
            line('prese', true, { name: 'Prese CEE reparto', phases: 3, powerW: 10000, ku: 0.5, lengthM: 45, method: 'E', insulation: 'EPR', grouped: 1 }),
            sub('luce', { name: 'Luci uffici', powerW: 1500, rcdGroup: gu, rcdMa: 0 }),
            sub('prese', { name: 'Prese uffici', powerW: 3500, rcdGroup: gu, rcdMa: 0 }),
            sub('prese', { name: 'Prese servizi e bagni', powerW: 2000, lengthM: 22, rcdGroup: gu, rcdMa: 0, bathroom: true }),
            sub('clima', { name: 'Climatizzazione uffici', phases: 3, powerW: 7000, rcdMa: 30 }),
          ],
        });
      },
    },
    {
      id: 'vuoto',
      title: 'Progetto vuoto',
      text: 'Abitazione monofase senza linee: le aggiungi tu.',
      make: () => plantBase({ name: 'Nuovo impianto' }),
    },
  ];
}
