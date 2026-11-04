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

const SECTIONS: WireSection[] = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];

/**
 * Portate in rame a 30 °C in aria [A], dalle tabelle B.52.2–B.52.12 della IEC 60364-5-52 (CEI-UNEL 35024/1):
 * due conduttori carichi (circuiti monofase) e tre conduttori carichi (circuiti trifase).
 * Valori riportati per comodità: per un progetto vanno verificati sulla tabella ufficiale o sul catalogo del cavo.
 */
const TABLE2: Record<Insulation, Record<InstallMethod, number[]>> = {
  PVC: {
    A1: [14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182, 210, 240, 273, 321],
    A2: [14, 18.5, 25, 32, 43, 57, 75, 92, 110, 139, 167, 192, 219, 248, 291],
    B1: [17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 300, 341, 400],
    B2: [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232, 258, 294, 344],
    C: [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461],
    E: [22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514],
  },
  EPR: {
    A1: [19, 26, 35, 45, 61, 81, 106, 131, 158, 200, 241, 278, 318, 362, 424],
    A2: [18.5, 25, 33, 42, 57, 76, 99, 121, 145, 183, 220, 253, 290, 329, 386],
    B1: [23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 393, 449, 528],
    B2: [22, 30, 40, 51, 69, 91, 119, 146, 175, 221, 265, 305, 334, 384, 459],
    C: [24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599],
    E: [26, 36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410, 473, 542, 641],
  },
};
const TABLE3: Record<Insulation, Record<InstallMethod, number[]>> = {
  PVC: {
    A1: [13.5, 18, 24, 31, 42, 56, 73, 89, 108, 136, 164, 188, 216, 245, 286],
    A2: [13, 17.5, 23, 29, 39, 52, 68, 83, 99, 125, 150, 172, 196, 223, 261],
    B1: [15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 262, 296, 346],
    B2: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206, 225, 255, 297],
    C: [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259, 299, 341, 403],
    E: [18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430],
  },
  EPR: {
    A1: [17, 23, 31, 40, 54, 73, 95, 117, 141, 179, 216, 249, 285, 324, 380],
    A2: [16.5, 22, 30, 38, 51, 68, 89, 109, 130, 164, 197, 227, 259, 295, 346],
    B1: [20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312, 342, 384, 450],
    B2: [19.5, 26, 35, 44, 60, 80, 105, 128, 154, 194, 233, 268, 300, 340, 398],
    C: [22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322, 371, 424, 500],
    E: [23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346, 399, 456, 538],
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

/** loaded: conduttori attivi percorsi da corrente (2 = monofase, 3 = trifase). */
export function ampacity(section: WireSection, method: InstallMethod, ins: Insulation, ambientC: number, grouped: number, loaded: 2 | 3 = 2): AmpacityResult | null {
  const idx = SECTIONS.indexOf(section);
  const i0 = (loaded === 3 ? TABLE3 : TABLE2)[ins][method][idx];
  const k1 = tempFactor(ins, ambientC);
  if (i0 === undefined || k1 === null) return null;
  const k2 = groupFactor(Math.max(1, grouped));
  return { i0, k1, k2, iz: i0 * k1 * k2 };
}

/** Coefficiente K per l'energia specifica passante I²t ≤ K²S² (CEI 64-8:2007, 434.3.2). */
export const K_ADIABATIC: Record<Insulation, number> = { PVC: 115, EPR: 143 };
