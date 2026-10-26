import { UnionFind } from '../graph/unionFind';
import { catalogItem } from '../model/catalog';
import { LIVE_THRESHOLD_V, SHORT_CIRCUIT_Z_THRESHOLD } from '../model/constants';
import { getPoles, isResidualDevice, isSwitchingDevice, loadHasNeutral, loadPhaseKeys, supplyPhaseKeys } from '../model/terminals';
import type { Phase, Project } from '../model/types';
import { abs, add, conj, div, mul, sub, type Complex, ZERO } from './complex';
import { solveNodal, SingularMatrixError, type Branch, type CurrentInjection } from './mna';
import { buildNetlist, innerNode, NODE_EARTH, NODE_STAR, starNode, type LineKey, type NetElement, type NetlistOptions } from './netlist';
import { inverterDcLink } from './dc';
import {
  arrayOperatingPoint,
  GRID_MAX_RATIO,
  GRID_MIN_RATIO,
  INVERTER_STATE_TEXT,
  inverterOutput,
  pvEnv,
  type InverterState,
  type PvOperatingPoint,
} from './pv';

export type AlertSeverity = 'errore' | 'attenzione' | 'info';

export interface SimAlert {
  code: 'SHORT_CIRCUIT' | 'OVERCURRENT' | 'FAULT_CURRENT' | 'RESIDUAL' | 'OVER_CONTRACT' | 'VOLTAGE_RANGE' | 'TOUCH_VOLTAGE' | 'NEUTRAL_LIVE' | 'SPD_TOV' | 'PV_FAULT' | 'PV_EXPORT';
  severity: AlertSeverity;
  message: string;
  componentIds: string[];
}

/** Stato di un inverter fotovoltaico nel punto di lavoro calcolato. */
export interface InverterResult {
  state: InverterState;
  /** Potenza DC dai moduli (al netto delle perdite nei cavi DC) [W] */
  pdc: number;
  /** Potenza attiva immessa nell'impianto [W] */
  pac: number;
  vdc: number;
  idc: number;
  /** Tensione e corrente lato rete [V, A] */
  vac: number;
  iac: number;
  /** Potenza limitata dalla taglia dell'inverter */
  clipped: boolean;
  dcLossW: number;
  /** Generatori collegati */
  arrayIds: string[];
}

/** Punto di lavoro di un generatore fotovoltaico. */
export interface PvArrayResult extends PvOperatingPoint {
  inverterId: string | null;
  /** Potenza effettivamente prelevata dall'inverter [W] */
  pOut: number;
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
      inverters: Map<string, InverterResult>;
      pvArrays: Map<string, PvArrayResult>;
      /** Wallbox con gestione della potenza */
      evse?: Map<string, EvseResult>;
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
export interface EvseResult {
  mode: 'fissa' | 'limitata' | 'solare';
  maxW: number;
  /** Potenza di ricarica impostata dalla gestione [W] (0 = sospesa) */
  setW: number;
  reason: string;
}

/**
 * Risolve l'impianto; se ci sono wallbox con gestione della potenza, ne regola la potenza per iterazioni
 * (limite della potenza contrattuale al contatore, oppure solo surplus fotovoltaico).
 */
export function simulate(project: Project, opts: NetlistOptions = {}): SimResult {
  const managed = project.components.filter((c) => c.params.kind === 'load' && c.params.p.on && c.params.p.evse && c.params.p.evse.mode !== 'fissa');
  if (!managed.length || opts.loadsOff || opts.noGeneration) return withEvse(simulateCore(project, opts), project, new Map());
  const supply = project.components.find((c) => c.params.kind === 'supply');
  const limitW = supply && supply.params.kind === 'supply' ? supply.params.p.contractKW * 1000 : Infinity;
  const power = new Map<string, number>();
  for (const c of managed) if (c.params.kind === 'load') power.set(c.id, c.params.p.powerW);
  let r = simulateCore(project, { ...opts, loadPower: power });
  for (let iter = 0; iter < 8 && r.ok; iter++) {
    let changed = false;
    for (const c of managed) {
      if (c.params.kind !== 'load' || !c.params.p.evse) continue;
      const ev = c.params.p.evse;
      const cur = power.get(c.id)!;
      // Potenza al contatore (> 0 prelievo). Si lascia un margine di 1 W per stabilità.
      const target = ev.mode === 'limitata' ? limitW : 0;
      let next = Math.min(c.params.p.powerW, Math.max(0, cur - (r.supply.p - target) - 1));
      if (next < ev.minW) next = 0;
      if (Math.abs(next - cur) > 5) {
        power.set(c.id, next);
        changed = true;
      }
    }
    if (!changed) break;
    r = simulateCore(project, { ...opts, loadPower: power });
  }
  return withEvse(r, project, power);
}

function withEvse(r: SimResult, project: Project, power: Map<string, number>): SimResult {
  if (!r.ok) return r;
  const evse = new Map<string, EvseResult>();
  for (const c of project.components) {
    if (c.params.kind !== 'load' || !c.params.p.evse) continue;
    const ev = c.params.p.evse;
    const maxW = c.params.p.powerW;
    const setW = !c.params.p.on ? 0 : (power.get(c.id) ?? maxW);
    const reason = !c.params.p.on
      ? 'ricarica spenta'
      : ev.mode === 'fissa'
        ? 'potenza fissa'
        : setW === 0
          ? ev.mode === 'solare'
            ? 'sospesa: surplus fotovoltaico insufficiente'
            : 'sospesa: potenza disponibile sotto il minimo'
          : setW < maxW - 5
            ? ev.mode === 'solare'
              ? 'ridotta al surplus fotovoltaico'
              : 'ridotta per non superare il contratto'
            : 'piena potenza';
    evse.set(c.id, { mode: ev.mode, maxW, setW, reason });
  }
  return { ...r, evse };
}

function simulateCore(project: Project, opts: NetlistOptions = {}): SimResult {
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

  // ------------------------------------------------------------ fotovoltaico
  // Ogni inverter è un generatore di corrente che immette la potenza disponibile dai moduli: I = conj(P / V).
  // La corrente dipende dalla tensione, quindi si risolve per iterazioni successive.
  const env = pvEnv(project.pv);
  const isClosed = (c: (typeof project.components)[number]) => (opts.closed ? opts.closed(c) : c.closed);
  const inverters = new Map<string, InverterResult>();
  const pvArrays = new Map<string, PvArrayResult>();
  interface InvPlan {
    id: string;
    nodeL: string | null;
    nodeN: string | null;
    pac: number;
    current: Complex;
  }
  const plans: InvPlan[] = [];
  for (const c of project.components) {
    if (c.params.kind === 'pv-array') {
      pvArrays.set(c.id, { ...arrayOperatingPoint(c.params.p, env.irradiance, env.ambientC), inverterId: null, pOut: 0 });
    }
  }
  for (const c of project.components) {
    if (c.params.kind !== 'inverter') continue;
    const inv = c.params.p;
    const link = inverterDcLink(project, c, isClosed);
    const base: InverterResult = { state: 'dc scollegato', pdc: 0, pac: 0, vdc: 0, idc: 0, vac: 0, iac: 0, clipped: false, dcLossW: 0, arrayIds: link.arrays.map((a) => a.id) };
    for (const a of [...link.arrays, ...link.reversed]) {
      const r = pvArrays.get(a.id);
      if (r) r.inverterId = c.id;
    }
    let state: InverterState | null = null;
    let pac = 0;
    if (link.reversed.length) state = 'polarità invertita';
    else if (!link.arrays.length || link.shorted) state = 'dc scollegato';
    else {
      // Generatori in parallelo sullo stesso ingresso: potenze sommate, tensione del primo (stringhe uguali).
      const ops = link.arrays.map((a) => (a.params.kind === 'pv-array' ? arrayOperatingPoint(a.params.p, env.irradiance, env.ambientC) : null)).filter((x): x is PvOperatingPoint => !!x);
      const op: PvOperatingPoint = ops.reduce((acc, o) => ({ ...acc, pmp: acc.pmp + o.pmp, imp: acc.imp + o.imp, isc: acc.isc + o.isc, pstc: acc.pstc + o.pstc }));
      const out = inverterOutput(inv, op, link.rLoop);
      state = out.state;
      pac = opts.noGeneration ? 0 : out.pac;
      base.pdc = out.pdc;
      base.vdc = out.state ? op.voc : op.vmp;
      base.idc = out.state ? 0 : Math.min(op.imp, inv.maxDcA);
      base.clipped = out.clipped;
      base.dcLossW = out.dcLossW;
      for (const a of link.arrays) {
        const r = pvArrays.get(a.id);
        if (r && op.pmp > 0) r.pOut = out.state ? 0 : (out.pdc + out.dcLossW) * (r.pmp / op.pmp);
      }
    }
    base.state = state ?? 'produzione';
    inverters.set(c.id, base);
    if (!state && pac > 0) {
      plans.push({ id: c.id, nodeL: net.terminalNode.get(`${c.id}:L`) ?? null, nodeN: net.terminalNode.get(`${c.id}:N`) ?? null, pac, current: ZERO });
    }
  }
  const u0 = sp.voltage;
  const solveWith = (): Map<string, Complex> => {
    const inj = [...injections];
    for (const pl of plans) {
      if (abs(pl.current) < 1e-9 || !pl.nodeL || !pl.nodeN) continue;
      inj.push({ node: pl.nodeL, i: pl.current });
      inj.push({ node: pl.nodeN, i: { re: -pl.current.re, im: -pl.current.im } });
    }
    return solveNodal([...nodes], NODE_STAR, branches, inj);
  };
  const invVoltage = (Vm: Map<string, Complex>, pl: InvPlan): Complex | null => {
    if (!pl.nodeL || !pl.nodeN || !live(pl.nodeL) || !live(pl.nodeN)) return null;
    const a = Vm.get(pl.nodeL);
    const b = Vm.get(pl.nodeN);
    return a && b ? sub(a, b) : null;
  };

  let V: Map<string, Complex>;
  try {
    V = solveWith();
    if (plans.length) {
      for (let iter = 0; iter < 30; iter++) {
        let delta = 0;
        for (const pl of plans) {
          const v = invVoltage(V, pl);
          let next: Complex = ZERO;
          if (v && abs(v) >= GRID_MIN_RATIO * u0) next = conj(div({ re: pl.pac, im: 0 }, v));
          delta = Math.max(delta, abs(sub(next, pl.current)));
          pl.current = next;
        }
        V = solveWith();
        if (delta < 1e-6) break;
      }
      // Distacco per rete assente o tensione troppo alta (decisione presa sul punto di lavoro finale).
      let tripped = false;
      for (const pl of plans) {
        const v = invVoltage(V, pl);
        const r = inverters.get(pl.id)!;
        if (!v || abs(v) < GRID_MIN_RATIO * u0) {
          r.state = 'rete assente';
          pl.current = ZERO;
          tripped = true;
        } else if (abs(v) > GRID_MAX_RATIO * u0) {
          r.state = 'sovratensione rete';
          pl.current = ZERO;
          tripped = true;
        }
      }
      if (tripped) V = solveWith();
    }
  } catch (err) {
    if (err instanceof SingularMatrixError) return { ok: false, reason: err.message };
    throw err;
  }
  for (const pl of plans) {
    const r = inverters.get(pl.id)!;
    const v = invVoltage(V, pl);
    r.vac = v ? abs(v) : 0;
    r.iac = abs(pl.current);
    r.pac = v ? mul(v, conj(pl.current)).re : 0;
    if (r.state === 'rete assente' || r.state === 'sovratensione rete') {
      r.pdc = 0;
      r.idc = 0;
      for (const id of r.arrayIds) {
        const a = pvArrays.get(id);
        if (a) a.pOut = 0;
      }
    }
  }
  // Inverter con produzione ma senza piano (es. senza sole) restano nello stato calcolato; quelli esclusi dall'opzione noGeneration non immettono.
  for (const [id, r] of inverters) {
    if (!plans.some((p) => p.id === id) && r.state === 'produzione') {
      r.pac = 0;
      r.iac = 0;
    }
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
    const branchZ = (k: string) => {
      const el = net.elements.find((e) => e.tag.t === 'load' && e.tag.componentId === c.id && e.tag.key === k);
      return el ? el.z : null;
    };
    const phaseV: number[] = [];
    const phaseI: number[] = [];
    let p = 0;
    for (const k of keys) {
      const vk = V.get(innerNode(c.id, k));
      const vb = vk && vs ? abs(sub(vk, vs)) : 0;
      const z = branchZ(k);
      const ib = z ? vb / abs(z) : 0;
      phaseV.push(vb);
      phaseI.push(ib);
      p += z ? ib * ib * z.re : 0;
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
  for (const [id, r] of inverters) {
    const c = project.components.find((x) => x.id === id)!;
    if (r.state === 'polarità invertita' || r.state === 'tensione dc eccessiva' || r.state === 'sovratensione rete') {
      alerts.push({ code: 'PV_FAULT', severity: r.state === 'sovratensione rete' ? 'attenzione' : 'errore', message: `${c.label}: ${INVERTER_STATE_TEXT[r.state]}.`, componentIds: [id, ...r.arrayIds] });
    }
  }
  if (supplyResult.p < -1) {
    alerts.push({
      code: 'PV_EXPORT',
      severity: 'info',
      message: `Immissione in rete: ${n(-supplyResult.p, 0)} W prodotti dal fotovoltaico e non consumati nell'impianto.`,
      componentIds: [supply.id],
    });
  }
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
    if (pr.kind !== 'mcb' && pr.kind !== 'rcbo' && pr.kind !== 'fuse' && pr.kind !== 'switch' && pr.kind !== 'rcd' && pr.kind !== 'relay') continue;
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
      const what = pr.kind === 'mcb' || pr.kind === 'rcbo' ? 'sovraccarico: lo sganciatore termico si sta riscaldando' : pr.kind === 'fuse' ? 'sovraccarico: oltre la corrente di non fusione la cartuccia si consuma' : 'il dispositivo non è una protezione contro le sovracorrenti';
      alerts.push({
        code: 'OVERCURRENT',
        severity: 'attenzione',
        message: `${c.label}: ${n(imax, 2)} A = ${n(imax / inom, 2)}·In, oltre la corrente nominale In = ${inom} A (${what}).`,
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

  // Scaricatori: sovratensione temporanea a 50 Hz oltre la tensione massima continuativa Uc.
  for (const c of project.components) {
    if (c.params.kind !== 'spd') continue;
    const uc = c.params.p.uc;
    const at = (k: string) => V.get(net.terminalNode.get(`${c.id}:${k}`) ?? '');
    const vN = at('N');
    const vPE = at('PE');
    let worst = 0;
    for (const k of c.params.p.poles === '3P+N' ? ['L1', 'L2', 'L3'] : ['L']) {
      const vL = at(k);
      if (!vL) continue;
      if (vN) worst = Math.max(worst, abs(sub(vL, vN)));
      if (vPE) worst = Math.max(worst, abs(sub(vL, vPE)));
    }
    if (worst > uc) {
      alerts.push({
        code: 'SPD_TOV',
        severity: 'attenzione',
        message: `${c.label}: tensione di ${n(worst, 0)} V oltre Uc = ${uc} V. Una sovratensione temporanea a 50 Hz (es. neutro interrotto) può far condurre e danneggiare lo scaricatore.`,
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
    inverters,
    pvArrays,
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
