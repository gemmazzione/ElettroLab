import type { Conductor, TerminalFunction, WireColor, WireSection } from './types';

/**
 * Costanti fisiche e approssimazioni del modello.
 * Ogni valore è documentato in MODEL_ASSUMPTIONS, che l'interfaccia mostra all'utente.
 */

/** Resistività del rame a 70 °C (temperatura di servizio per isolante PVC) [Ω·mm²/m] */
export const RHO_CU_70 = 0.0214;

/** Resistenza di un contatto chiuso di un dispositivo modulare, per polo [Ω] */
export const CONTACT_RESISTANCE = 0.005;

/** Tensione nominale a cui è riferita la potenza di targa degli utilizzatori [V] */
export const LOAD_RATED_VOLTAGE = 230;

/** Resistenza minima di un guasto "franco" [Ω] */
export const MIN_FAULT_RESISTANCE = 0.001;

/** Lunghezza minima di un conduttore: evita impedenze nulle nel sistema [m] */
export const MIN_WIRE_LENGTH = 0.01;

/** Soglia di impedenza esterna sotto la quale l'assorbimento è classificato come cortocircuito [Ω] */
export const SHORT_CIRCUIT_Z_THRESHOLD = 2;

/** Tensione sopra la quale un morsetto è segnalato "in tensione" verso terra [V] */
export const LIVE_THRESHOLD_V = 50;

export const MODEL_ASSUMPTIONS: { title: string; text: string }[] = [
  {
    title: 'Regime sinusoidale permanente',
    text: 'Il circuito viene risolto a 50 Hz con fasori complessi (Analisi Nodale Modificata). Non sono simulati transitori né armoniche.',
  },
  {
    title: 'Sorgente',
    text: 'La rete del distributore è un generatore ideale da 230 V con impedenza dell\'anello di rete R + jX (parametri della fornitura), ripartita a metà tra fase e neutro. Sistema TT: neutro di cabina a terra tramite RB.',
  },
  {
    title: 'Conduttori',
    text: `Ogni conduttore è una resistenza R = ρ·L/S con ρ = ${RHO_CU_70} Ω·mm²/m (rame a 70 °C). Induttanza dei cavi trascurata (sezioni ≤ 25 mm²).`,
  },
  {
    title: 'Contatti',
    text: `Un contatto chiuso vale ${CONTACT_RESISTANCE * 1000} mΩ per polo. Un contatto aperto è un circuito aperto ideale (nessuna dispersione).`,
  },
  {
    title: 'Carichi',
    text: 'Gli utilizzatori sono impedenze costanti ricavate da potenza nominale e cos φ alla tensione nominale (R = Un²/Pn per i carichi resistivi, R + jX per motori e compressori): la potenza assorbita varia con il quadrato della tensione effettiva. Correnti di spunto e funzionamento ciclico non sono simulati.',
  },
  {
    title: 'Nodi isolati',
    text: 'I nodi non collegati galvanicamente alla sorgente hanno potenziale indeterminato e vengono mostrati come "—" invece di 0 V.',
  },
  {
    title: 'Guasti',
    text: 'I guasti sono rami reali del circuito: cortocircuito L-N e guasto a massa L-PE con resistenza di guasto, contatto fase-terra (persona), interruzione di fase, neutro, PE o di un singolo conduttore. Le correnti di guasto risultano dalle impedenze del modello, non da valori prefissati.',
  },
  {
    title: 'Cortocircuito',
    text: `Un assorbimento con impedenza vista dalla fornitura inferiore a ${SHORT_CIRCUIT_Z_THRESHOLD} Ω viene classificato come cortocircuito: nessun utilizzatore domestico realistico ha un'impedenza così bassa. La Icc presunta è calcolata con un guasto franco (1 mΩ), utilizzatori spenti e resistività a 70 °C: per la Icc minima di progetto le norme considerano temperature più elevate dei conduttori, quindi il valore minimo reale può essere inferiore.`,
  },
];

// ---------------------------------------------------------------- colori conduttori

export const WIRE_COLOR_HEX: Record<WireColor, string> = {
  marrone: '#9a5b2c',
  nero: '#111111',
  grigio: '#9ca3af',
  blu: '#4f9cf5',
  'giallo-verde': '#22a447',
};

export const WIRE_COLOR_LABEL: Record<WireColor, string> = {
  marrone: 'Marrone',
  nero: 'Nero',
  grigio: 'Grigio',
  blu: 'Blu chiaro',
  'giallo-verde': 'Giallo-verde',
};

export const DEFAULT_COLOR_FOR: Record<Conductor, WireColor> = {
  L1: 'marrone',
  L2: 'nero',
  L3: 'grigio',
  N: 'blu',
  PE: 'giallo-verde',
};

export const CONDUCTOR_LABEL: Record<Conductor, string> = {
  L1: 'L1 — Fase 1',
  L2: 'L2 — Fase 2',
  L3: 'L3 — Fase 3',
  N: 'N — Neutro',
  PE: 'PE — Protezione',
};

export const FN_COLOR_HEX: Record<TerminalFunction, string> = {
  L: '#c47a3c',
  N: '#4f9cf5',
  PE: '#22c55e',
};

export const WIRE_STROKE_FOR_SECTION: Record<WireSection, number> = {
  1.5: 2,
  2.5: 2.6,
  4: 3.2,
  6: 3.8,
  10: 4.6,
  16: 5.4,
  25: 6.2,
};
