import type { SimResult } from '../engine/simulate';
import type { Issue } from '../graph/erc';
import type { ComponentInstance, Project } from '../model/types';
import type { ProtState } from '../protection/stepper';
import type { NormReport } from '../rules/engine';

/** Stato del laboratorio visibile al controllo automatico. */
export interface ExerciseCtx {
  project: Project;
  running: boolean;
  /** Risultato della simulazione in corso (null se l'impianto non è alimentato) */
  live: SimResult | null;
  prot: ProtState;
  probes: { red?: string; black?: string };
  clampTarget: { kind: 'wire' | 'line'; id: string } | null;
  /** Simulazione "di progetto": tutte le protezioni chiuse, utilizzatori come impostati, guasti inclusi */
  design: () => SimResult;
  issues: () => Issue[];
  norm: () => NormReport;
  byLabel: (label: string) => ComponentInstance | undefined;
  loadByName: (name: string) => ComponentInstance | undefined;
}

export interface CheckOutcome {
  ok: boolean;
  /** Spiegazione mostrata quando il controllo non è superato */
  hint?: string;
}

interface TaskBase {
  id: string;
  text: string;
  points: number;
  /** Spiegazione didattica mostrata dopo la verifica */
  explanation?: string;
}

export type Task =
  | (TaskBase & { kind: 'check'; check: (ctx: ExerciseCtx) => CheckOutcome })
  | (TaskBase & {
      kind: 'numeric';
      unit: string;
      /** Tolleranza relativa [%] */
      tolerancePct?: number;
      /** Tolleranza assoluta (per valori vicini a zero) */
      toleranceAbs?: number;
      /** Valore atteso calcolato dal modello; null se non calcolabile nello stato attuale */
      expected: (ctx: ExerciseCtx) => number | null;
    })
  | (TaskBase & { kind: 'choice'; options: string[]; correct: number });

export interface Exercise {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  objective: string;
  /** Richiami di teoria */
  theory: string;
  /** Articoli di catalogo utilizzabili (vuoto = progetto già completo, nessun materiale aggiuntivo) */
  materials: string[];
  /** Descrizione dell'ambiente di simulazione */
  environment: string;
  build: () => Project;
  tasks: Task[];
}

export interface TaskResult {
  ok: boolean;
  points: number;
  feedback: string;
}

export interface Evaluation {
  results: Record<string, TaskResult>;
  score: number;
  earned: number;
  total: number;
}

export const LEVELS: { level: Exercise['level']; title: string; description: string }[] = [
  { level: 1, title: 'Fondamenti', description: 'Fase, neutro e terra, tensione, corrente e potenza, funzione di magnetotermico e differenziale.' },
  { level: 2, title: 'Primo quadro', description: 'Alimentazione generale, protezione di luci e prese, cablaggio dei neutri e del PE.' },
  { level: 3, title: 'Quadro appartamento', description: 'Suddivisione dei circuiti, dimensionamento di protezioni e linee, carichi.' },
  { level: 4, title: 'Ricerca guasti', description: 'Cortocircuito, sovraccarico, dispersione, neutro interrotto, cablaggio errato.' },
  { level: 5, title: 'Trifase', description: 'Distribuzione su L1/L2/L3, neutro comune, squilibri, tensioni concatenate, protezioni multipolari.' },
  { level: 6, title: 'Fotovoltaico, comandi e verifiche', description: 'Deviatori e contattori, dimensionamento della stringa, polarità DC, autoconsumo e batteria, verifiche strumentali.' },
];
