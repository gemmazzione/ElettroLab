/**
 * Motore di verifica normativa: tipi.
 * Ogni regola è versionata e porta i riferimenti normativi con l'indicazione esplicita
 * di cosa è stato verificato sul testo e cosa no.
 */

export type RuleStatus = 'conforme' | 'errore' | 'attenzione' | 'dati-insufficienti' | 'verifica-campo';

export const STATUS_LABEL: Record<RuleStatus, string> = {
  conforme: 'Conforme alle regole verificate',
  errore: 'Errore rilevato',
  attenzione: 'Attenzione',
  'dati-insufficienti': 'Dati insufficienti',
  'verifica-campo': 'Verifica sul campo necessaria',
};

export const AREAS = [
  'Protezione contro i contatti elettrici',
  'Protezione contro le sovracorrenti',
  'Dimensionamento delle condutture',
  'Coordinamento cavo-protezione',
  'Protezione differenziale',
  'Impianto di terra',
  'Sezionamento e comando',
  'Suddivisione dei circuiti',
  'Protezione dalle sovratensioni',
  'Prescrizioni per ambienti residenziali',
  'Impianti fotovoltaici',
  'Verifiche iniziali',
] as const;

export type RuleArea = (typeof AREAS)[number];

export interface NormRef {
  /** Es. "CEI 64-8:2007" */
  edition: string;
  article: string;
  /** true solo se il riferimento è stato controllato sul testo della norma */
  verified: boolean;
  note?: string;
}

export interface RuleOutcome {
  ruleId: string;
  status: RuleStatus;
  /** Oggetto della verifica (circuito, dispositivo, impianto) */
  subject: string;
  message: string;
  /** Passaggi di calcolo mostrati all'utente */
  details?: string[];
  missingData?: string[];
  componentIds: string[];
}

export interface Rule<Ctx> {
  id: string;
  /** Versione della regola (cambia quando cambia la logica o il riferimento) */
  version: string;
  title: string;
  description: string;
  area: RuleArea;
  /** Campo di applicazione */
  scope: string;
  /** Gravità in caso di esito negativo */
  severity: 'errore' | 'attenzione';
  /** Spiegazione didattica */
  explanation: string;
  refs: NormRef[];
  /** Dati necessari alla verifica */
  requiredData: string[];
  evaluate: (ctx: Ctx) => RuleOutcome[];
}

export interface RuleSet<Ctx> {
  id: string;
  version: string;
  title: string;
  edition: string;
  status: 'storico' | 'vigente';
  note: string;
  rules: Rule<Ctx>[];
}
