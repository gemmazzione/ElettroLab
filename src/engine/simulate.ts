import { UnionFind } from '../graph/unionFind';
import { catalogItem } from '../model/catalog';
import { LIVE_THRESHOLD_V, SHORT_CIRCUIT_Z_THRESHOLD } from '../model/constants';
import { getPoles, isResidualDevice, isSwitchingDevice, loadHasNeutral, loadPhaseKeys, supplyPhaseKeys } from '../model/terminals';
import type { Phase, Project } from '../model/types';
import { abs, add, conj, div, mul, sub, type Complex, ZERO } from './complex';
import { solveNodal, SingularMatrixError, type Branch, type CurrentInjection } from './mna';
import { buildNetlist, innerNode, NODE_EARTH, NODE_STAR, starNode, type LineKey, type NetElement, type NetlistOptions } from './netlist';

export type AlertSeverity = 'errore' | 'attenzione' | 'info';

export interface SimAlert {
  code: 'SHORT_CIRCUIT' | 'OVERCURRENT' | 'FAULT_CURRENT' | 'RESIDUAL' | 'OVER_CONTRACT' | 'VOLTAGE_RANGE' | 'TOUCH_VOLTAGE' | 'NEUTRAL_LIVE';
  severity: AlertSeverity;
  message: string;
  componentIds: string[];
}

export interface LoadResult {
  /** Tensione ai capi dell'utilizzatore [V] */
  v: number;
  i: number;
  /** Potenza attiva assorbita [W] */
  p: number;
  /** Caduta di tensione rispetto alla tensione nominale della fornitura [%] */
  dropPct: number;
  energized: boolean;
  /** Trifase: tensione e corrente di ciascun ramo della stella (L1, L2, L3) */
  phaseV?: number[];
  phaseI?: number[];
  /** Potenziale del neutro/centro stella dell'utilizzatore verso terra (null se indeterminato) */
  vN: Complex | null;
}

export interface SupplyResult {
  /** Tensione L-N ai morsetti del punto di consegna [V] */
  v: number;
  i: number;
  p: number;
  /** Potenza apparente [VA] */
  s: number;
  pf: number;
  /** Impedenza vista dalla fornitura verso l'impianto [Ω], null se nessuna corrente */
  zExt: number | null;
  /** Grandezze per fase ai morsetti della fornitura (1 elemento in monofase, 3 in trifase) */
  phases: { phase: Phase; v: number; i: number; vC: Complex; iC: Complex }[];
  /** Corrente nel neutro della fornitura [A] */
  iN: number;
  /** Potenziale del neutro della fornitura verso terra */
  vNC: Complex;
  /** Tensioni concatenate U12, U23, U31 (solo trifase) */
  lineV: number[];
}

export type SimResult =
  | {
      ok: true;
      /** Potenziale (fasore) di ogni morsetto rispetto alla terra di riferimento; null se isolato */
      terminalV: Map<string, Complex | null>;
      terminalNode: Map<string, string>;
      /** Corrente (fasore) nei conduttori, verso from → to */
      wireI: Map<string, Complex>;
      /** Corrente per polo, verso ingresso → uscita */
      poleI: Map<string, Complex[]>;
      /** Corrente differenziale (modulo della somma vettoriale delle correnti dei poli) [A] */
      residual: Map<string, number>;
      loads: Map<string, LoadResult>;
      /** Correnti nei conduttori della linea di ciascun utilizzatore (verso quadro → apparecchio) */
      cableI: Map<string, Partial<Record<LineKey, Complex>>>;
      /** Corrente nei guasti attivi */
      faultI: Map<string, Complex>;
      /** Corrente nei rami aggiuntivi richiesti dalle opzioni */
      extraI: Complex[];
      /** Tensione della massa di ciascun utilizzatore verso terra [V] (null se indeterminata) */
      touchV: Map<string, number | null>;
      supply: SupplyResult;
      alerts: SimAlert[];
    }
  | { ok: false; reason: string };

const n = (v: number, d: number) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

const elementCurrent = (e: NetElement, V: Map<string, Complex>): Complex => {
  const va = V.get(e.a);
  const vb = V.get(e.b);
  if (!va || !vb) return ZERO;
  const drive = e.emf ? sub(sub(va, vb), e.emf) : sub(va, vb);
  return div(drive, e.z);
};

/**
 * Risolve l'impianto in regime permanente sinusoidale.
 * Funzione pura: dipende solo dal progetto.
 */
export function simulate(project: Project, opts: NetlistOptions = {}): SimResult {
  const net = buildNetlist(project, opts);
  const supply = project.components.find((c) => c.id === net.supplyId);
  if (!supply || supply.params.kind !== 'supply') {
    return { ok: false, reason: 'Nessun punto di fornitura nel progetto: aggiungi una fornitura (monofase o trifase) dal catalogo.' };
  }
  const sp = supply.params.p;

  // Solo i nodi galvanicamente connessi alla sorgente hanno un potenziale determinato.
  const uf = new UnionFind();
  for (const e of net.elements) uf.union(e.a, e.b);
  const live = (n: string) => uf.same(n, NODE_STAR);
  const active = net.elements.filter((e) => live(e.a));
  const nodes = new Set<string>();
  for (const e of active) {
    nodes.add(e.a);
    nodes.add(e.b);
  }

  const branches: Branch[] = active.map((e) => ({ a: e.a, b: e.b, z: e.z }));
  const injections: CurrentInjection[] = [];
  for (const e of active) {
    if (!e.emf) continue;
    const isrc = div(e.emf, e.z);
    injections.push({ node: e.a, i: isrc });
    injections.push({ node: e.b, i: { re: -isrc.re, im: -isrc.im } });
  }

  let V: Map<string, Complex>;
  try {
    V = solveNodal([...nodes], NODE_STAR, branches, injections);
  } catch (err) {
    if (err instanceof SingularMatrixError) return { ok: false, reason: err.message };
    throw err;
  }

  const vEarth = V.get(NODE_EARTH) ?? ZERO;
  const terminalV = new Map<string, Complex | null>();
  for (const [tid, n] of net.terminalNode) {
    const v = V.get(n);
    terminalV.set(tid, v ? sub(v, vEarth) : null);
  }

  const wireI = new Map<string, Complex>();
  const poleI = new Map<string, Complex[]>();
  const loads = new Map<string, LoadResult>();
  const iPhaseOut = new Map<Phase, Complex>();
  let iNeutralOut: Complex = ZERO;
  const cableI = new Map<string, Partial<Record<LineKey, Complex>>>();
  const faultI = new Map<string, Complex>();
  const extraI: Complex[] = [];

  for (const e of net.elements) {
    const i = live(e.a) ? elementCurrent(e, V) : ZERO;
    switch (e.tag.t) {
      case 'wire':
        wireI.set(e.tag.wireId, i);
        break;
      case 'contact': {
        const arr = poleI.get(e.tag.componentId) ?? [];
        arr[e.tag.pole] = i;
        poleI.set(e.tag.componentId, arr);
        break;
      }
      case 'cable': {
        const rec = cableI.get(e.tag.componentId) ?? {};
        rec[e.tag.conductor] = i;
        cableI.set(e.tag.componentId, rec);
        break;
      }
      case 'fault':
        faultI.set(e.tag.faultId, i);
        break;
      case 'extra':
        extraI[e.tag.index] = i;
        break;
      case 'source-L':
        // La corrente erogata esce dal morsetto di fase: è l'opposto della corrente interna a → b.
        iPhaseOut.set(e.tag.phase, { re: -i.re, im: -i.im });
        break;
      case 'source-N':
        iNeutralOut = { re: -i.re, im: -i.im };
        break;
      default:
        break;
    }
  }

  // Dispositivi aperti: corrente nulla su tutti i poli.
  for (const c of project.components) {
    if (!isSwitchingDevice(c.params.kind)) continue;
    const poles = getPoles(c);
    const arr = poleI.get(c.id) ?? [];
    poles.forEach((p) => {
      if (!arr[p.index]) arr[p.index] = ZERO;
    });
    poleI.set(c.id, arr);
  }

  const residual = new Map<string, number>();
  for (const c of project.components) {
    if (!isResidualDevice(c.params.kind)) continue;
    const sum = (poleI.get(c.id) ?? []).reduce<Complex>((acc, v) => add(acc, v ?? ZERO), ZERO);
    residual.set(c.id, abs(sum));
  }

  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const keys = loadPhaseKeys(c);
    const star = loadHasNeutral(c) ? innerNode(c.id, 'N') : starNode(c.id);
    const vs = V.get(star);
    const branchR = (k: string) => {
      const el = net.elements.find((e) => e.tag.t === 'load' && e.tag.componentId === c.id && e.tag.key === k);
      return el ? el.z.re : null;
    };
    const phaseV: number[] = [];
    const phaseI: number[] = [];
    let p = 0;
    for (const k of keys) {
      const vk = V.get(innerNode(c.id, k));
      const vb = vk && vs ? abs(sub(vk, vs)) : 0;
      const r = branchR(k);
      phaseV.push(vb);
      phaseI.push(r ? vb / r : 0);
      p += r ? (vb * vb) / r : 0;
    }
    const vAvg = phaseV.reduce((a, b) => a + b, 0) / phaseV.length;
    loads.set(c.id, {
      v: vAvg,
      i: Math.max(...phaseI),
      p,
      dropPct: ((sp.voltage - vAvg) / sp.voltage) * 100,
      energized: phaseV.some((v) => v > 1),
      ...(keys.length > 1 ? { phaseV, phaseI } : {}),
      vN: vs ? sub(vs, vEarth) : null,
    });
  }

  const vAt = (key: string) => V.get(net.terminalNode.get(`${supply.id}:${key}`) ?? '') ?? ZERO;
  const vN = vAt('N');
  // Potenza erogata: somma su tutti i morsetti di V (assoluta) per I* uscente.
  let sPow: Complex = mul(vN, conj(iNeutralOut));
  const phases: SupplyResult['phases'] = [];
  let zExt: number | null = null;
  for (const { key, phase } of supplyPhaseKeys(supply)) {
    const vk = vAt(key);
    const ik = iPhaseOut.get(phase) ?? ZERO;
    sPow = add(sPow, mul(vk, conj(ik)));
    const vkn = abs(sub(vk, vN));
    phases.push({ phase, v: vkn, i: abs(ik), vC: sub(vk, vEarth), iC: ik });
    if (abs(ik) > 1e-6) zExt = Math.min(zExt ?? Infinity, vkn / abs(ik));
  }
  const iMag = Math.max(...phases.map((x) => x.i));
  const lineV = phases.length === 3 ? [0, 1, 2].map((k) => abs(sub(phases[k]!.vC, phases[(k + 1) % 3]!.vC))) : [];
  const supplyResult: SupplyResult = {
    v: phases[0]!.v,
    i: iMag,
    p: sPow.re,
    s: abs(sPow),
    pf: abs(sPow) > 1e-9 ? sPow.re / abs(sPow) : 1,
    zExt,
    phases,
    iN: abs(iNeutralOut),
    vNC: sub(vN, vEarth),
    lineV,
  };

  const alerts: SimAlert[] = [];
  if (supplyResult.zExt !== null && supplyResult.zExt < SHORT_CIRCUIT_Z_THRESHOLD) {
    alerts.push({
      code: 'SHORT_CIRCUIT',
      severity: 'errore',
      message: `Cortocircuito: l'impianto presenta ${n(supplyResult.zExt, 3)} Ω alla fornitura e assorbe ${n(iMag, 0)} A. La corrente deve essere interrotta dalle protezioni.`,
      componentIds: [supply.id],
    });
  }

  for (const c of project.components) {
    const pr = c.params;
    if (pr.kind !== 'mcb' && pr.kind !== 'rcbo' && pr.kind !== 'switch' && pr.kind !== 'rcd') continue;
    const imax = Math.max(0, ...(poleI.get(c.id) ?? []).map((v) => (v ? abs(v) : 0)));
    const inom = pr.p.in;
    if (imax > 10 * inom) {
      alerts.push({
        code: 'FAULT_CURRENT',
        severity: 'errore',
        message: `${c.label}: corrente di guasto ${n(imax, 0)} A (${n(imax / inom, 0)} × In).`,
        componentIds: [c.id],
      });
    } else if (imax > inom) {
      const what = pr.kind === 'mcb' || pr.kind === 'rcbo' ? 'sovraccarico: lo sganciatore termico si sta riscaldando' : 'il dispositivo non è una protezione contro le sovracorrenti';
      alerts.push({
        code: 'OVERCURRENT',
        severity: 'attenzione',
        message: `${c.label}: ${n(imax, 1)} A superiore alla corrente nominale In = ${inom} A (${what}).`,
        componentIds: [c.id],
      });
    }
  }

  for (const [id, ires] of residual) {
    if (ires > 0.001) {
      const c = project.components.find((x) => x.id === id)!;
      alerts.push({
        code: 'RESIDUAL',
        severity: 'attenzione',
        message: `${c.label}: corrente differenziale ${ires >= 1 ? `${ires.toLocaleString("it-IT", { maximumFractionDigits: 2 })} A` : `${(ires * 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mA`}.`,
        componentIds: [id],
      });
    }
  }

  const pAvail = sp.contractKW * 1000 * 1.1;
  if (supplyResult.p > pAvail && !alerts.some((a) => a.code === 'SHORT_CIRCUIT')) {
    alerts.push({
      code: 'OVER_CONTRACT',
      severity: 'attenzione',
      message: `Potenza assorbita ${n(supplyResult.p / 1000, 2)} kW oltre la potenza disponibile (${sp.contractKW} kW impegnati + 10%). Il limitatore del contatore non è simulato.`,
      componentIds: [supply.id],
    });
  }

  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const r = loads.get(c.id);
    if (r && r.energized && (r.v < sp.voltage * 0.9 || r.v > sp.voltage * 1.1)) {
      alerts.push({
        code: 'VOLTAGE_RANGE',
        severity: 'attenzione',
        message: `${c.label} (${c.params.p.name}): tensione ${n(r.v, 1)} V fuori dall'intervallo ${sp.voltage} V ± 10%.`,
        componentIds: [c.id],
      });
    }
  }

  // Masse (PE) a potenziale pericoloso verso terra.
  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const vpe = V.get(`${c.id}#PE`);
    if (vpe && abs(sub(vpe, vEarth)) > LIVE_THRESHOLD_V) {
      alerts.push({
        code: 'TOUCH_VOLTAGE',
        severity: 'errore',
        message: `${c.label}: la massa dell'apparecchio è a ${n(abs(sub(vpe, vEarth)), 0)} V verso terra.`,
        componentIds: [c.id],
      });
    }
  }

  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const vn = V.get(innerNode(c.id, 'N'));
    if (vn && abs(sub(vn, vEarth)) > LIVE_THRESHOLD_V) {
      alerts.push({
        code: 'NEUTRAL_LIVE',
        severity: 'errore',
        message: `${c.label}: il morsetto di neutro dell'apparecchio è a ${n(abs(sub(vn, vEarth)), 0)} V verso terra: le parti dell'apparecchio collegate al neutro sono in tensione.`,
        componentIds: [c.id],
      });
    }
  }

  const touchV = new Map<string, number | null>();
  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const vpe = V.get(innerNode(c.id, 'PE'));
    touchV.set(c.id, vpe ? abs(sub(vpe, vEarth)) : null);
  }

  return {
    ok: true,
    terminalV,
    terminalNode: net.terminalNode,
    wireI,
    poleI,
    residual,
    loads,
    cableI,
    faultI,
    extraI,
    touchV,
    supply: supplyResult,
    alerts,
  };
}

/** Corrente massima tra i poli di un dispositivo [A]. */
export function deviceCurrent(result: SimResult, componentId: string): number {
  if (!result.ok) return 0;
  return Math.max(0, ...(result.poleI.get(componentId) ?? []).map((v) => (v ? abs(v) : 0)));
}

export function isLiveVoltage(v: Complex | null | undefined): boolean {
  return !!v && abs(v) > LIVE_THRESHOLD_V;
}

export function describeDevice(project: Project, componentId: string): string {
  const c = project.components.find((x) => x.id === componentId);
  return c ? `${c.label} — ${catalogItem(c.catalogId).name}` : componentId;
}
