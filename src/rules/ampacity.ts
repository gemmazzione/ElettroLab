import type { WireSection } from '../model/types';

/**
 * Portata dei cavi in rame, 2 conduttori caricati (circuito monofase), temperatura ambiente 30 °C.
 *
 * FONTE DEI VALORI: IEC 60364-5-52, Allegato B (Tab. B.52.2–B.52.5 portate, B.52.14 temperatura,
 * B.52.17 raggruppamento). La CEI 64-8:2007 (art. 523.1.2) rimanda invece alle Tabelle CEI-UNEL
 * 35024/1, che non sono contenute nel testo disponibile: i valori possono differire leggermente.
 * Per una verifica rigorosa l'utente può inserire la portata Iz ricavata da CEI-UNEL o dal costruttore.
 */
export const AMPACITY_SOURCE =
  'Valori di riferimento IEC 60364-5-52 All. B (rame, 2 conduttori caricati, 30 °C). La CEI 64-8:2007 rimanda alle Tabelle CEI-UNEL 35024/1 (art. 523.1.2), non incluse: inserire Iz da tabella o costruttore per una verifica rigorosa.';

export type InstallMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'E';
export type Insulation = 'PVC' | 'EPR';

export const INSTALL_METHODS: { id: InstallMethod; label: string }[] = [
  { id: 'A1', label: 'A1 — cavi unipolari in tubo in parete termicamente isolante' },
  { id: 'A2', label: 'A2 — cavo multipolare in tubo in parete termicamente isolante' },
  { id: 'B1', label: 'B1 — cavi unipolari in tubo su o in parete (muratura)' },
  { id: 'B2', label: 'B2 — cavo multipolare in tubo su o in parete' },
  { id: 'C', label: 'C — cavo multipolare fissato su parete' },
  { id: 'E', label: 'E — cavo multipolare in aria libera / passerella forata' },
];

const SECTIONS: WireSection[] = [1.5, 2.5, 4, 6, 10, 16, 25];

const TABLE: Record<Insulation, Record<InstallMethod, number[]>> = {
  PVC: {
    A1: [14.5, 19.5, 26, 34, 46, 61, 80],
    A2: [14, 18.5, 25, 32, 43, 57, 75],
    B1: [17.5, 24, 32, 41, 57, 76, 101],
    B2: [16.5, 23, 30, 38, 52, 69, 90],
    C: [19.5, 27, 36, 46, 63, 85, 112],
    E: [22, 30, 40, 51, 70, 94, 119],
  },
  EPR: {
    A1: [19, 26, 35, 45, 61, 81, 106],
    A2: [18.5, 25, 33, 42, 57, 76, 99],
    B1: [23, 31, 42, 54, 75, 100, 133],
    B2: [22, 30, 40, 51, 69, 91, 119],
    C: [24, 33, 45, 58, 80, 107, 138],
    E: [26, 36, 49, 63, 86, 115, 149],
  },
};

/** Fattore di correzione per temperatura ambiente diversa da 30 °C (posa in aria). */
const K_TEMP: Record<Insulation, [number, number][]> = {
  PVC: [[10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5]],
  EPR: [[10, 1.15], [15, 1.12], [20, 1.08], [25, 1.04], [30, 1], [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82], [55, 0.76], [60, 0.71]],
};

/** Fattore di raggruppamento: circuiti raggruppati in fascio, annegati o in tubo. */
const K_GROUP: [number, number][] = [[1, 1], [2, 0.8], [3, 0.7], [4, 0.65], [5, 0.6], [6, 0.57], [7, 0.54], [8, 0.52], [9, 0.5], [12, 0.45], [16, 0.41], [20, 0.38]];

export function tempFactor(ins: Insulation, ambientC: number): number | null {
  const t = K_TEMP[ins];
  const exact = t.find(([c]) => c === ambientC);
  if (exact) return exact[1];
  // valori tabellari a passi di 5 °C: si usa il passo superiore (cautelativo)
  const up = t.find(([c]) => c >= ambientC);
  return up ? up[1] : null;
}

export function groupFactor(n: number): number {
  let f = 1;
  for (const [k, v] of K_GROUP) if (n >= k) f = v;
  return f;
}

export interface AmpacityResult {
  i0: number;
  k1: number;
  k2: number;
  iz: number;
}

export function ampacity(section: WireSection, method: InstallMethod, ins: Insulation, ambientC: number, grouped: number): AmpacityResult | null {
  const idx = SECTIONS.indexOf(section);
  const i0 = TABLE[ins][method][idx];
  const k1 = tempFactor(ins, ambientC);
  if (i0 === undefined || k1 === null) return null;
  const k2 = groupFactor(Math.max(1, grouped));
  return { i0, k1, k2, iz: i0 * k1 * k2 };
}

/** Coefficiente K per l'energia specifica passante I²t ≤ K²S² (CEI 64-8:2007, 434.3.2). */
export const K_ADIABATIC: Record<Insulation, number> = { PVC: 115, EPR: 143 };
