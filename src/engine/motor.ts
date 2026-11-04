/**
 * Motori asincroni trifase: corrente nominale, corrente di spunto e verifica dell'avviamento con la protezione a monte.
 * Modello semplificato: durante l'avviamento il motore assorbe Ia = (Ia/In) × In per il tempo di avviamento, con lo
 * stesso fattore di potenza di regime (in realtà allo spunto è più basso: conta il modulo della corrente).
 */

import { buildNetGraph, analyzeCircuits } from '../graph/netGraph';
import type { ComponentInstance, LoadParams, MotorParams, Project } from '../model/types';
import { fuseMeltTime, magneticBand, magneticZone, thermalModelOf, thermalSetting, thermalTripTime } from '../protection/curves';

export const isMotor = (c: ComponentInstance) => c.params.kind === 'load' && !!c.params.p.motor;

/** Rapporto tra la corrente di avviamento e la nominale secondo il tipo di avviamento. */
export function startFactor(m: MotorParams): number {
  // Stella-triangolo: in stella la corrente di linea è un terzo di quella dell'avviamento diretto.
  if (m.starting === 'stella-triangolo') return m.startRatio / 3;
  // Inverter (azionamento a velocità variabile): la corrente resta circa quella nominale.
  if (m.starting === 'inverter') return 1;
  return m.startRatio;
}

/** Potenza elettrica assorbita [W] da potenza resa all'albero e rendimento. */
export const motorInputW = (m: Pick<MotorParams, 'pnW' | 'efficiency'>) => m.pnW / Math.max(0.3, m.efficiency / 100);

/** Corrente nominale di linea [A]: P / (√3 · 400 · cos φ) in trifase. */
export function motorRatedCurrent(p: LoadParams): number {
  const cos = p.cosPhi ?? 0.85;
  return p.phases === 3 ? p.powerW / (Math.sqrt(3) * 400 * cos) : p.powerW / (230 * cos);
}

export interface StartCheck {
  ok: boolean | null;
  text: string;
}

export interface MotorStart {
  inA: number;
  iaA: number;
  startS: number;
  device: ComponentInstance | null;
  checks: StartCheck[];
}

const fA = (a: number) => `${a >= 100 ? Math.round(a) : a.toFixed(1).replace('.', ',')} A`;
const fS = (s: number) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(1).replace('.', ',')} s`);

/** La protezione contro le sovracorrenti a monte del motore regge l'avviamento e lo protegge in servizio? */
export function motorStartCheck(project: Project, loadId: string): MotorStart | null {
  const load = project.components.find((c) => c.id === loadId);
  if (!load || load.params.kind !== 'load' || !load.params.p.motor) return null;
  const p = load.params.p;
  const m = p.motor!;
  const inA = motorRatedCurrent(p);
  const iaA = inA * startFactor(m);
  const circuit = analyzeCircuits(project, buildNetGraph(project)).find((c) => c.loadId === loadId);
  const devs = (circuit?.lDevices ?? []).map((id) => project.components.find((c) => c.id === id)).filter((c): c is ComponentInstance => !!c);
  const device = [...devs].reverse().find((d) => d.params.kind === 'mcb' || d.params.kind === 'rcbo' || d.params.kind === 'fuse') ?? null;
  const checks: StartCheck[] = [];
  if (!device) {
    checks.push({ ok: false, text: 'Nessuna protezione contro le sovracorrenti a monte del motore.' });
    return { inA, iaA, startS: m.startS, device, checks };
  }
  if (device.params.kind === 'fuse') {
    const fp = device.params.p;
    const tf = fuseMeltTime(iaA / fp.in, fp.in);
    checks.push({
      ok: fp.in >= inA,
      text: fp.in >= inA ? `Cartuccia da ${fp.in} A ≥ corrente nominale del motore ${fA(inA)}.` : `Cartuccia da ${fp.in} A minore della corrente nominale del motore (${fA(inA)}).`,
    });
    checks.push({
      ok: !Number.isFinite(tf) || tf > m.startS * 1.5,
      text: Number.isFinite(tf)
        ? `Allo spunto (${fA(iaA)}) la cartuccia fonderebbe in circa ${fS(tf)} (curva media gG): ${tf > m.startS * 1.5 ? `margine sufficiente sull'avviamento di ${fS(m.startS)}` : `troppo vicino all'avviamento di ${fS(m.startS)}: per i motori si usano cartucce aM o più grandi, con la protezione dal sovraccarico affidata al relè termico`}.`
        : `Allo spunto la cartuccia non fonde.`,
    });
    return { inA, iaA, startS: m.startS, device, checks };
  }
  const dp = device.params;
  if (dp.kind !== 'mcb' && dp.kind !== 'rcbo') return { inA, iaA, startS: m.startS, device, checks };
  const bp = dp.p;
  const ir = dp.kind === 'mcb' ? thermalSetting(dp.p) : bp.in;
  const model = dp.kind === 'mcb' ? thermalModelOf(dp.p) : thermalModelOf({});
  const band = magneticBand(bp);
  const zone = magneticZone(iaA / bp.in, band);
  checks.push({
    ok: ir >= inA * 0.999 && ir <= inA * 1.25 ? true : ir < inA ? false : null,
    text:
      ir < inA
        ? `Termico regolato a ${fA(ir)}, sotto la corrente nominale del motore (${fA(inA)}): interviene in servizio normale.`
        : ir <= inA * 1.25
          ? `Termico a ${fA(ir)} per un motore da ${fA(inA)}: protegge il motore dal sovraccarico.`
          : `Termico a ${fA(ir)}, molto sopra la corrente del motore (${fA(inA)}): protegge il cavo ma non il motore; regola Ir vicino a In del motore o aggiungi un relè termico.`,
  });
  checks.push({
    ok: zone === 'sotto' ? true : zone === 'incerta' ? null : false,
    text:
      zone === 'sotto'
        ? `Spunto ${fA(iaA)} sotto la soglia magnetica (da ${fA(band[0] * bp.in)}): il magnetico non interviene all'avviamento.`
        : zone === 'incerta'
          ? `Spunto ${fA(iaA)} nella fascia magnetica incerta (${fA(band[0] * bp.in)}–${fA(band[1] * bp.in)}): l'interruttore può scattare all'avviamento. Usa una curva D, alza Im o scegli un avviamento con meno spunto.`
          : `Spunto ${fA(iaA)} oltre la soglia magnetica (${fA(band[1] * bp.in)}): l'interruttore scatta a ogni avviamento.`,
  });
  const tt = thermalTripTime(0, iaA / ir, model);
  checks.push({
    ok: tt > m.startS * 1.2,
    text: Number.isFinite(tt)
      ? `Termico allo spunto: interverrebbe dopo circa ${fS(tt)} (da freddo), ${tt > m.startS * 1.2 ? `oltre l'avviamento di ${fS(m.startS)}` : `prima della fine dell'avviamento (${fS(m.startS)}): serve una classe d'intervento più lenta (classe 20) o un avviamento più breve`}.`
      : 'Termico: allo spunto non interviene.',
  });
  return { inA, iaA, startS: m.startS, device, checks };
}
