import { abs } from '../engine/complex';
import { simulate, type SimResult } from '../engine/simulate';
import { getPoles } from '../model/terminals';
import type { ComponentInstance, Project } from '../model/types';
import {
  heatAfter,
  MAGNETIC_BAND,
  MAGNETIC_TRIP_S,
  magneticZone,
  residualTripTime,
  residualZone,
  thermalTripTime,
} from './curves';

export type TripCause = 'termico' | 'magnetico' | 'differenziale' | 'prova';

export interface DeviceProtState {
  /** Stato termico normalizzato H (intervento a H_TRIP) */
  heat: number;
  /** Causa dell'ultimo intervento, finché l'utente non richiude */
  tripped?: TripCause;
  warnedMagnetic?: boolean;
  warnedResidual?: boolean;
}

export type ProtState = Record<string, DeviceProtState>;

export interface StepEvent {
  /** Istante dell'evento rispetto all'inizio del passo [s] */
  at: number;
  level: 'info' | 'attenzione' | 'errore';
  text: string;
  componentIds: string[];
}

export interface StepOutput {
  project: Project;
  prot: ProtState;
  result: SimResult;
  events: StepEvent[];
  /** true se qualche protezione è intervenuta (il progetto è cambiato) */
  tripped: boolean;
  /** Tempo simulato trascorso [s] */
  elapsed: number;
}

const f1 = (v: number, d = 1) => v.toLocaleString('it-IT', { maximumFractionDigits: d, minimumFractionDigits: d });
const fA = (a: number) => (a >= 1000 ? `${f1(a / 1000, 2)} kA` : a >= 10 ? `${f1(a, 0)} A` : `${f1(a, 2)} A`);

/** Corrente massima tra i poli protetti contro le sovracorrenti [A]. */
export function protectedCurrent(result: SimResult, c: ComponentInstance): number {
  if (!result.ok) return 0;
  const currents = result.poleI.get(c.id) ?? [];
  let m = 0;
  for (const p of getPoles(c)) {
    if (!p.protected) continue;
    const i = currents[p.index];
    if (i) m = Math.max(m, abs(i));
  }
  return m;
}

interface Candidate {
  id: string;
  time: number;
  cause: TripCause;
  current: number;
}

/**
 * Fa avanzare il tempo simulato.
 * - mode "step": avanza esattamente di dt, gestendo tutti gli interventi che cadono nell'intervallo.
 * - mode "settle": gestisce solo gli interventi entro `horizon` (es. dopo una manovra o un guasto),
 *   avanzando il tempo fino all'ultimo intervento; se non ce ne sono, non avanza.
 */
export function advance(
  project: Project,
  prot: ProtState,
  result: SimResult | null,
  dt: number,
  mode: 'step' | 'settle' = 'step',
): StepOutput {
  let p = project;
  let cloned = false;
  const st: ProtState = structuredClone(prot);
  let res = result ?? simulate(p);
  const events: StepEvent[] = [];
  let t = 0;
  let tripped = false;
  const horizonTotal = dt;

  for (let iter = 0; iter < 32; iter++) {
    const remaining = horizonTotal - t;
    const cands: Candidate[] = [];
    const ratios = new Map<string, number>();

    for (const c of p.components) {
      const pr = c.params;
      if (pr.kind !== 'mcb' && pr.kind !== 'rcbo' && pr.kind !== 'rcd') continue;
      const s = (st[c.id] ??= { heat: 0 });
      const closed = c.closed && res.ok;

      if (pr.kind === 'mcb' || pr.kind === 'rcbo') {
        const i = closed ? protectedCurrent(res, c) : 0;
        const ratio = i / pr.p.in;
        ratios.set(c.id, ratio);
        if (closed) {
          const zone = magneticZone(ratio, pr.p.curve);
          // Il modello termico vale per i sovraccarichi: oltre la soglia magnetica certa prevale lo sganciatore magnetico.
          const tt = zone === 'certa' ? Infinity : thermalTripTime(s.heat, ratio);
          if (Number.isFinite(tt)) cands.push({ id: c.id, time: tt, cause: 'termico', current: i });
          if (zone === 'certa') cands.push({ id: c.id, time: MAGNETIC_TRIP_S, cause: 'magnetico', current: i });
          if (zone === 'incerta' && !s.warnedMagnetic) {
            s.warnedMagnetic = true;
            const [lo, hi] = MAGNETIC_BAND[pr.p.curve];
            events.push({
              at: t,
              level: 'attenzione',
              text: `${c.label}: ${fA(i)} = ${f1(ratio, 1)}·In è nella fascia magnetica incerta della curva ${pr.p.curve} (${lo}–${hi}·In). L'intervento istantaneo dipende dall'esemplare (dati del costruttore): il simulatore considera solo lo sganciatore termico.`,
              componentIds: [c.id],
            });
          }
          if (zone === 'sotto') s.warnedMagnetic = false;
        }
      }

      if ((pr.kind === 'rcd' || pr.kind === 'rcbo') && closed && res.ok) {
        const ires = res.residual.get(c.id) ?? 0;
        const idnA = pr.p.idn / 1000;
        const zone = residualZone(ires, idnA);
        const selective = pr.kind === 'rcd' && pr.p.selective;
        if (zone === 'certa') cands.push({ id: c.id, time: residualTripTime(ires, idnA, selective), cause: 'differenziale', current: ires });
        if (zone === 'incerta' && !s.warnedResidual) {
          s.warnedResidual = true;
          events.push({
            at: t,
            level: 'attenzione',
            text: `${c.label}: corrente differenziale ${f1(ires * 1000, 1)} mA tra 0,5 e 1·IΔn (${pr.p.idn} mA): intervento possibile ma non garantito.`,
            componentIds: [c.id],
          });
        }
        if (zone === 'sotto') s.warnedResidual = false;
      }
    }

    const tmin = cands.reduce((m, c) => Math.min(m, c.time), Infinity);
    const limit = mode === 'step' ? remaining : horizonTotal - t;
    const advanceBy = tmin <= limit ? tmin : mode === 'step' ? remaining : 0;

    // Evoluzione termica di tutti i magnetotermici nell'intervallo.
    if (advanceBy > 0) {
      for (const c of p.components) {
        if (c.params.kind !== 'mcb' && c.params.kind !== 'rcbo') continue;
        const s = st[c.id]!;
        s.heat = heatAfter(s.heat, ratios.get(c.id) ?? 0, advanceBy);
      }
    }
    t += advanceBy;
    if (tmin > limit) break;

    // Interventi simultanei (entro 1 ms): nessuna selettività garantita.
    const now = cands.filter((c) => c.time <= tmin + 1e-3);
    if (!cloned) {
      p = structuredClone(p);
      cloned = true;
    }
    const done = new Set<string>();
    for (const cand of now) {
      if (done.has(cand.id)) continue;
      done.add(cand.id);
      const dev = p.components.find((x) => x.id === cand.id)!;
      dev.closed = false;
      st[cand.id]!.tripped = cand.cause;
      tripped = true;
      const pr = dev.params;
      if (cand.cause === 'termico' && (pr.kind === 'mcb' || pr.kind === 'rcbo')) {
        events.push({
          at: t,
          level: 'errore',
          text: `${dev.label} interviene per sovraccarico (sganciatore termico): ${fA(cand.current)} = ${f1(cand.current / pr.p.in, 2)}·In.`,
          componentIds: [dev.id],
        });
      } else if (cand.cause === 'magnetico' && (pr.kind === 'mcb' || pr.kind === 'rcbo')) {
        const icnA = pr.p.icn * 1000;
        const ok = cand.current <= icnA;
        events.push({
          at: t,
          level: 'errore',
          text: `${dev.label} interviene per cortocircuito (sganciatore magnetico): ${fA(cand.current)} = ${f1(cand.current / pr.p.in, 0)}·In. ${
            ok
              ? `Corrente interrotta entro il potere di interruzione Icn = ${f1(pr.p.icn, 1)} kA.`
              : `ATTENZIONE: supera Icn = ${f1(pr.p.icn, 1)} kA. L'interruzione non è garantita: l'esito dipende dalla protezione di back-up dichiarata dal costruttore.`
          }`,
          componentIds: [dev.id],
        });
      } else if (cand.cause === 'differenziale' && (pr.kind === 'rcd' || pr.kind === 'rcbo')) {
        events.push({
          at: t,
          level: 'errore',
          text: `${dev.label} interviene: corrente differenziale ${cand.current >= 1 ? fA(cand.current) : `${f1(cand.current * 1000, 1)} mA`} = ${f1(cand.current / (pr.p.idn / 1000), 1)}·IΔn (tempo massimo di norma ${f1(cand.time * 1000, 0)} ms).`,
          componentIds: [dev.id],
        });
      }
    }
    res = simulate(p);
  }

  return { project: p, prot: st, result: res, events, tripped, elapsed: t };
}
