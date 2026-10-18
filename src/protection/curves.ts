import type { TripCurve } from '../model/types';

/**
 * Modelli di intervento delle protezioni.
 *
 * Sono modelli SINTETICI costruiti sui punti convenzionali delle norme di prodotto
 * (CEI EN 60898-1 per i magnetotermici, CEI EN 61008/61009 per i differenziali).
 * La curva reale di un dispositivo è quella dichiarata dal costruttore: dove la norma
 * ammette una fascia di incertezza il simulatore non "sceglie" un comportamento ma lo segnala.
 */

// ------------------------------------------------------------------ sganciatore termico

/**
 * Modello termico del primo ordine sulla grandezza normalizzata H = (I/In)² filtrata:
 *   dH/dt = ((I/In)² − H) / τ        intervento quando H ≥ K_TRIP²
 * Con τ = 66 s e K_TRIP = 1,30, partendo da freddo:
 *   1,13 In → nessun intervento          (norma: non intervento entro 1 h)
 *   1,45 In → ≈ 107 s                     (norma: intervento entro 1 h)
 *   2,55 In → ≈ 20 s                      (norma: 1 s < t < 60 s per In ≤ 32 A)
 */
export const THERMAL_TAU_S = 66;
export const K_TRIP = 1.3;
export const H_TRIP = K_TRIP * K_TRIP;

/** Evoluzione esatta dello stato termico a corrente costante per un intervallo dt. */
export function heatAfter(h0: number, ratio: number, dt: number): number {
  const x = ratio * ratio;
  return x + (h0 - x) * Math.exp(-dt / THERMAL_TAU_S);
}

/** Tempo all'intervento termico a corrente costante [s]; Infinity se non interviene. */
export function thermalTripTime(h0: number, ratio: number): number {
  if (h0 >= H_TRIP) return 0;
  const x = ratio * ratio;
  if (x <= H_TRIP) return Infinity;
  return THERMAL_TAU_S * Math.log((x - h0) / (x - H_TRIP));
}

// ------------------------------------------------------------------ sganciatore magnetico

/** Fasce di intervento istantaneo (multipli di In) secondo CEI EN 60898-1. */
export const MAGNETIC_BAND: Record<TripCurve, [number, number]> = {
  B: [3, 5],
  C: [5, 10],
  D: [10, 20],
};

/** Tempo di intervento magnetico modellato (la norma richiede < 0,1 s oltre la soglia superiore). */
export const MAGNETIC_TRIP_S = 0.01;

export type MagneticZone = 'sotto' | 'incerta' | 'certa';

export function magneticZone(ratio: number, curve: TripCurve): MagneticZone {
  const [lo, hi] = MAGNETIC_BAND[curve];
  if (ratio >= hi) return 'certa';
  if (ratio >= lo) return 'incerta';
  return 'sotto';
}

// ------------------------------------------------------------------ differenziale

export type ResidualZone = 'sotto' | 'incerta' | 'certa';

/** Fino a 0,5·IΔn il differenziale non deve intervenire; da IΔn deve intervenire. */
export function residualZone(iRes: number, idnA: number): ResidualZone {
  if (iRes >= idnA) return 'certa';
  if (iRes >= 0.5 * idnA) return 'incerta';
  return 'sotto';
}

/** Tempi massimi di interruzione di norma (generale / selettivo S) per 1, 2, 5 × IΔn. */
export function residualTripTime(iRes: number, idnA: number, selective: boolean): number {
  const m = iRes / idnA;
  if (selective) return m >= 5 ? 0.15 : m >= 2 ? 0.2 : 0.5;
  return m >= 5 ? 0.04 : m >= 2 ? 0.15 : 0.3;
}

export const PROTECTION_ASSUMPTIONS: { title: string; text: string }[] = [
  {
    title: 'Sganciatore termico',
    text: `Modello del primo ordine (τ = ${THERMAL_TAU_S} s, intervento a ${K_TRIP.toLocaleString('it-IT')}·In a regime) tarato sui punti convenzionali della CEI EN 60898-1: nessun intervento a 1,13·In, intervento a 1,45·In in circa 107 s, a 2,55·In in circa 20 s. Lo stato termico ha memoria: dopo un intervento il dispositivo, se richiuso subito sul sovraccarico, scatta prima.`,
  },
  {
    title: 'Sganciatore magnetico',
    text: 'Oltre la soglia superiore della curva (B 5·In, C 10·In, D 20·In) l\'intervento è certo e modellato in 10 ms. Tra soglia inferiore e superiore (B 3–5, C 5–10, D 10–20 ·In) il comportamento dipende dal singolo esemplare: il simulatore non lo fa intervenire e lo segnala come zona di incertezza.',
  },
  {
    title: 'Potere di interruzione',
    text: 'All\'apertura su cortocircuito la corrente interrotta (calcolata dal modello) è confrontata con Icn. Se la supera, l\'esito non è calcolabile: dipende dalla protezione di back-up dichiarata dal costruttore.',
  },
  {
    title: 'Differenziale',
    text: 'Corrente differenziale = somma vettoriale delle correnti dei poli. Sotto 0,5·IΔn nessun intervento, tra 0,5 e 1·IΔn zona di incertezza (segnalata), da IΔn intervento con i tempi massimi di norma (generale 0,3/0,15/0,04 s; selettivo 0,5/0,2/0,15 s a 1/2/5·IΔn). Le correnti simulate sono sinusoidali: la distinzione tra tipi AC, A, F, B non influisce sull\'intervento in questa versione.',
  },
  {
    title: 'Scansione temporale',
    text: 'La simulazione avanza a eventi: a ogni passo si calcola il tempo di intervento di ogni protezione con le correnti attuali, interviene la più rapida e il circuito viene risolto di nuovo. La selettività (o la sua mancanza) è quindi un risultato del calcolo.',
  },
];
