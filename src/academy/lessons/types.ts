/**
 * Lezioni dell'Accademia: percorsi verticali per tema, dal livello «base base» all'avanzato.
 * Ogni lezione ha teoria breve, esempi svolti, punti chiave, un quiz di verifica
 * e (dove possibile) un collegamento al laboratorio: esercizio, progetto o scheda di un componente.
 */

export type TrackId = 'elettricita' | 'sicurezza' | 'protezioni' | 'cavi' | 'quadro' | 'comandi' | 'trifase' | 'misure' | 'fotovoltaico';

export type LessonLevel = 0 | 1 | 2 | 3;

export const LESSON_LEVELS: Record<LessonLevel, { name: string; description: string }> = {
  0: { name: 'Base base', description: 'Nessun prerequisito: le idee fondamentali con parole semplici.' },
  1: { name: 'Base', description: 'Le grandezze e i componenti che si usano tutti i giorni.' },
  2: { name: 'Intermedio', description: 'Calcoli e scelte di progetto su casi reali.' },
  3: { name: 'Avanzato', description: 'Coordinamento delle protezioni, casi critici e verifiche.' },
};

export interface LessonSection {
  title: string;
  /** Paragrafi (una riga = un paragrafo) */
  body: string;
  /** Formula o relazione da ricordare */
  formula?: string;
  /** Esempio svolto */
  example?: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
  /** Spiegazione mostrata dopo la risposta */
  why: string;
}

export interface LessonPractice {
  /** Esercizio dell'Accademia da svolgere nel simulatore */
  exercise?: string;
  /** Progetto predefinito da aprire nel laboratorio */
  demo?: string;
  /** Articoli del catalogo di cui aprire la scheda informativa */
  info?: string[];
  /** Cosa provare nel laboratorio */
  hint?: string;
}

export interface Lesson {
  id: string;
  track: TrackId;
  level: LessonLevel;
  title: string;
  minutes: number;
  goals: string[];
  sections: LessonSection[];
  keyPoints: string[];
  quiz: QuizQuestion[];
  practice?: LessonPractice;
}

export interface Track {
  id: TrackId;
  title: string;
  description: string;
  /** Nome dell'icona (lucide) mostrata nell'elenco dei percorsi */
  icon: 'zap' | 'shield' | 'shield-check' | 'cable' | 'layout-grid' | 'toggle-right' | 'triangle' | 'gauge' | 'sun';
}

export const TRACKS: Track[] = [
  { id: 'elettricita', title: 'Elettricità di base', description: 'Tensione, corrente, resistenza, potenza ed energia: il linguaggio di tutto il resto.', icon: 'zap' },
  { id: 'sicurezza', title: 'Sicurezza elettrica', description: 'Perché la corrente è pericolosa, impianto di terra, differenziale e sistema TT.', icon: 'shield' },
  { id: 'protezioni', title: 'Protezioni', description: 'Sovraccarico e cortocircuito, magnetotermici, fusibili, potere di interruzione, selettività.', icon: 'shield-check' },
  { id: 'cavi', title: 'Cavi e condutture', description: 'Colori, sezioni, portata, posa, caduta di tensione e coordinamento con la protezione.', icon: 'cable' },
  { id: 'quadro', title: 'Il quadro elettrico', description: 'Dispositivi modulari, guide DIN, morsettiere, pettini, ordine del cablaggio e schema unifilare.', icon: 'layout-grid' },
  { id: 'comandi', title: 'Circuiti e comandi', description: 'Utilizzatori, prese, comandi luce, pulsanti e relè passo-passo.', icon: 'toggle-right' },
  { id: 'trifase', title: 'Sistema trifase', description: 'Tre fasi e neutro, tensioni concatenate, squilibri, neutro comune e protezioni multipolari.', icon: 'triangle' },
  { id: 'fotovoltaico', title: 'Fotovoltaico', description: 'Moduli e stringhe, inverter e MPPT, dimensionamento, connessione alla rete, sicurezza in continua e accumulo.', icon: 'sun' },
  { id: 'misure', title: 'Misure e ricerca guasti', description: 'Multimetro e pinza, misure in sicurezza, metodo per trovare un guasto.', icon: 'gauge' },
];
