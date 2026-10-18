import type { Project } from '../model/types';
import { buildNormContext, type NormCtx } from './context';
import { RULESET_2007 } from './ruleset2007';
import { AREAS, type Rule, type RuleOutcome, type RuleSet, type RuleStatus } from './types';

export const RULESETS: RuleSet<NormCtx>[] = [RULESET_2007];

export interface NormReport {
  ruleset: RuleSet<NormCtx>;
  outcomes: (RuleOutcome & { rule: Rule<NormCtx> })[];
  counts: Record<RuleStatus, number>;
  /** Mai "conforme" globalmente: solo esito delle regole verificate */
  summary: string;
}

export function runRules(project: Project, ruleset: RuleSet<NormCtx> = RULESET_2007): NormReport {
  const ctx = buildNormContext(project);
  const outcomes: NormReport['outcomes'] = [];
  for (const rule of ruleset.rules) {
    try {
      for (const o of rule.evaluate(ctx)) outcomes.push({ ...o, rule });
    } catch (err) {
      outcomes.push({
        rule,
        ruleId: rule.id,
        status: 'dati-insufficienti',
        subject: 'Motore regole',
        message: `Valutazione non riuscita: ${(err as Error).message}`,
        componentIds: [],
      });
    }
  }
  outcomes.sort((a, b) => AREAS.indexOf(a.rule.area) - AREAS.indexOf(b.rule.area));
  const counts: Record<RuleStatus, number> = { conforme: 0, errore: 0, attenzione: 0, 'dati-insufficienti': 0, 'verifica-campo': 0 };
  for (const o of outcomes) counts[o.status] += 1;
  const summary =
    counts.errore > 0
      ? `${counts.errore} errori rilevati. L'impianto non soddisfa tutte le regole verificate.`
      : `Nessun errore nelle regole verificate, ma ${counts['dati-insufficienti']} verifiche hanno dati insufficienti e ${counts['verifica-campo']} richiedono prove sul campo: l'impianto NON può essere dichiarato conforme sulla base di questa analisi.`;
  return { ruleset, outcomes, counts, summary };
}
