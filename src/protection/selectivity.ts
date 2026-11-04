/**
 * Selettività tra due protezioni in serie: per ogni corrente di guasto deve intervenire solo quella a valle.
 * Selettività amperometrica e cronometrica sui modelli del simulatore: a valle si prende il tempo più lungo
 * possibile, a monte il più breve (fascia magnetica incerta = può già intervenire). Non sono modellati la
 * limitazione della corrente, la selettività energetica e quella di zona: per i valori garantiti servono le
 * tabelle di coordinamento del costruttore.
 */

import { deviceShortCircuit } from '../engine/measure';
import { buildNetGraph } from '../graph/netGraph';
import { getPoles, terminalId } from '../model/terminals';
import type { ComponentInstance, Project } from '../model/types';
import { fuseMeltTime, MAGNETIC_TRIP_S, magneticBand, thermalModelOf, thermalSetting, thermalTripTime } from './curves';

const isOcp = (c: ComponentInstance) => c.params.kind === 'mcb' || c.params.kind === 'rcbo' || c.params.kind === 'fuse';
/** Dispositivi attraversati senza protezione contro le sovracorrenti (sezionatori, differenziali puri). */
const isPassThrough = (c: ComponentInstance) => c.params.kind === 'switch' || c.params.kind === 'rcd' || c.params.kind === 'meter';

/** Prima protezione contro le sovracorrenti a monte di un dispositivo (attraverso sezionatori e differenziali). */
export function upstreamProtection(project: Project, dev: ComponentInstance): ComponentInstance | null {
  const g = buildNetGraph(project);
  const inNets = (c: ComponentInstance) => getPoles(c).filter((p) => p.fn === 'L').map((p) => g.netOf(terminalId(c.id, p.inKey)));
  const outNets = (c: ComponentInstance) => getPoles(c).filter((p) => p.fn === 'L').map((p) => g.netOf(terminalId(c.id, p.outKey)));
  let frontier = inNets(dev);
  const seen = new Set<string>([dev.id]);
  for (let depth = 0; depth < 6 && frontier.length; depth++) {
    const next: string[] = [];
    for (const c of project.components) {
      if (seen.has(c.id) || !(isOcp(c) || isPassThrough(c))) continue;
      if (!outNets(c).some((n) => frontier.includes(n))) continue;
      seen.add(c.id);
      if (isOcp(c)) return c;
      next.push(...inNets(c));
    }
    frontier = next;
  }
  return null;
}

/** Tempi d'intervento possibili [s] a una corrente: il più breve e il più lungo (fascia magnetica incerta). */
export function tripWindow(c: ComponentInstance, iA: number): { min: number; max: number } {
  const pr = c.params;
  if (pr.kind === 'fuse') {
    const t = fuseMeltTime(iA / pr.p.in, pr.p.in);
    return { min: t, max: t };
  }
  if (pr.kind !== 'mcb' && pr.kind !== 'rcbo') return { min: Infinity, max: Infinity };
  const ir = pr.kind === 'mcb' ? thermalSetting(pr.p) : pr.p.in;
  const model = pr.kind === 'mcb' ? thermalModelOf(pr.p) : thermalModelOf({});
  const [lo, hi] = magneticBand(pr.p).map((v) => v * pr.p.in);
  const thermal = thermalTripTime(0, iA / ir, model);
  if (iA >= hi!) return { min: MAGNETIC_TRIP_S, max: MAGNETIC_TRIP_S };
  if (iA >= lo!) return { min: MAGNETIC_TRIP_S, max: thermal };
  return { min: thermal, max: thermal };
}

export interface SelectivityResult {
  up: ComponentInstance;
  /** Icc presunta a valle della protezione [A] */
  iccA: number | null;
  /** Corrente fino a cui la selettività è garantita dal modello [A]; null = fino all'Icc (totale) */
  limitA: number | null;
  total: boolean;
  text: string;
}

const fA = (a: number) => (a >= 1000 ? `${(a / 1000).toFixed(2).replace('.', ',')} kA` : `${Math.round(a)} A`);

export function selectivity(project: Project, down: ComponentInstance): SelectivityResult | null {
  const up = upstreamProtection(project, down);
  if (!up || !isOcp(down)) return null;
  const pr = down.params;
  const ref = pr.kind === 'mcb' ? thermalSetting(pr.p) : pr.kind === 'rcbo' || pr.kind === 'fuse' ? pr.p.in : 1;
  const iccA = deviceShortCircuit(project, down);
  const top = Math.max(ref * 2, iccA ?? ref * 50);
  let limitA: number | null = null;
  const n = 240;
  for (let k = 0; k <= n; k++) {
    const i = ref * 1.05 * Math.pow(top / (ref * 1.05), k / n);
    const d = tripWindow(down, i);
    const u = tripWindow(up, i);
    // Selettivo se a valle interviene sicuramente prima che a monte possa intervenire.
    const ok = !Number.isFinite(u.min) || (Number.isFinite(d.max) && d.max < u.min);
    if (!ok) {
      limitA = i;
      break;
    }
  }
  const total = limitA === null;
  const text = total
    ? `Selettività totale con ${up.label} (modello): fino all'Icc presunta${iccA ? ` di ${fA(iccA)}` : ''} interviene solo ${down.label}.`
    : iccA !== null && limitA! >= iccA
      ? `Selettività totale con ${up.label} (modello) fino all'Icc presunta di ${fA(iccA)}.`
      : `Selettività parziale con ${up.label}: fino a circa ${fA(limitA!)} interviene solo ${down.label}; oltre può intervenire anche ${up.label}${iccA ? ` (Icc presunta ${fA(iccA)})` : ''}. Per migliorarla: alza la soglia magnetica a monte o usa un interruttore selettivo (ritardo breve) e verifica con le tabelle del costruttore.`;
  return { up, iccA, limitA, total: total || (iccA !== null && limitA! >= iccA), text };
}
