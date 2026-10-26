import { analyzeCircuits } from '../graph/netGraph';
import { isResidualDevice } from '../model/terminals';
import type { ComponentInstance, Project } from '../model/types';
import { residualTripTime, residualZone } from '../protection/curves';
import { loadEndFaultCurrents, resistanceBetween } from './measure';

/**
 * Strumenti per le verifiche iniziali (simulati sul modello).
 * Le soglie di accettazione vanno prese dalla norma vigente: qui si calcola la grandezza misurata.
 */

/**
 * Resistenza d'isolamento verso il PE della linea di un utilizzatore, con impianto disalimentato e apparecchi scollegati
 * (la misura reale si fa in corrente continua a 500 V tra conduttori attivi uniti e PE).
 * Nel modello l'isolamento è ideale: compaiono solo i guasti resistivi inseriti (L-PE, fase-terra).
 */
export function insulationResistance(project: Project, loadId: string): number {
  const off: Project = {
    ...project,
    components: project.components.map((c) => (c.params.kind === 'load' ? { ...c, params: { kind: 'load', p: { ...c.params.p, on: false } } } : c)),
  };
  const load = project.components.find((c) => c.id === loadId);
  if (!load || load.params.kind !== 'load') return Infinity;
  const keys = load.params.p.phases === 3 ? ['L1', 'L2', 'L3'] : ['L'];
  if (load.params.p.phases !== 3 || load.params.p.withNeutral) keys.push('N');
  return Math.min(...keys.map((k) => resistanceBetween(off, `${loadId}:${k}`, `${loadId}:PE`)));
}

export interface LoopResult {
  /** Impedenza dell'anello di guasto fase-PE e corrente di guasto presunta */
  zLpe: number | null;
  ikLpe: number | null;
  /** Impedenza dell'anello fase-neutro (o fase-fase) e corrente di cortocircuito minima */
  zLn: number | null;
  ikLn: number | null;
}

export function loopImpedance(project: Project, loadId: string, u0 = 230): LoopResult {
  const f = loadEndFaultCurrents(project, loadId);
  return {
    zLpe: f.lpe ? u0 / f.lpe : null,
    ikLpe: f.lpe,
    zLn: f.ln ? u0 / f.ln : null,
    ikLn: f.ln,
  };
}

export interface RcdTestRow {
  /** Multiplo di IΔn della corrente di prova */
  mult: number;
  currentMa: number;
  outcome: 'non interviene' | 'incerto' | 'interviene';
  /** Tempo massimo di intervento del modello [s] */
  timeS: number | null;
}

export interface RcdTestResult {
  rcd: ComponentInstance | null;
  idnMa: number;
  selective: boolean;
  /** Resistenza del dispersore (valore del progetto) e tensione di contatto convenzionale alla corrente IΔn */
  ra: number | null;
  ut: number | null;
  rows: RcdTestRow[];
}

/** Prova strumentale del differenziale che protegge un utilizzatore (il più vicino a valle). */
export function rcdTest(project: Project, loadId: string): RcdTestResult {
  const info = analyzeCircuits(project).find((c) => c.loadId === loadId);
  const devs = (info?.lDevices ?? []).map((id) => project.components.find((c) => c.id === id)!).filter(Boolean);
  const rcd = [...devs].reverse().find((d) => isResidualDevice(d.params.kind)) ?? null;
  const earth = project.components.find((c) => c.params.kind === 'earth');
  const ra = earth && earth.params.kind === 'earth' ? earth.params.p.ra : null;
  if (!rcd || (rcd.params.kind !== 'rcd' && rcd.params.kind !== 'rcbo')) return { rcd: null, idnMa: 0, selective: false, ra, ut: null, rows: [] };
  const idnMa = rcd.params.p.idn;
  const idn = idnMa / 1000;
  const selective = rcd.params.kind === 'rcd' && rcd.params.p.selective;
  const rows: RcdTestRow[] = [0.5, 1, 2, 5].map((mult) => {
    const i = mult * idn;
    const zone = residualZone(i, idn);
    return {
      mult,
      currentMa: mult * idnMa,
      outcome: zone === 'certa' ? 'interviene' : zone === 'incerta' ? 'incerto' : 'non interviene',
      timeS: zone === 'certa' ? residualTripTime(i, idn, selective) : null,
    };
  });
  return { rcd, idnMa, selective, ra, ut: ra !== null ? ra * idn : null, rows };
}
