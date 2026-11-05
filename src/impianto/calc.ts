import { cabinImpedance } from '../model/cabin';
import { RHO_CU_70 } from '../model/constants';
import type { WireSection } from '../model/types';
import { ampacity, type AmpacityResult } from '../rules/ampacity';
import { boardsOf, DEVICE_LABEL, isThreePhaseSupply, type Curve, type DeviceKind, type Plant, type PlantLine, type RcdGroup } from './model';

/**
 * Dimensionamento dell'impianto come lo imposta un progettista: bilancio delle potenze quadro per quadro, corrente
 * d'impiego, scelta della protezione e della sezione (anche con cavi in parallelo), caduta di tensione cumulata lungo
 * la catena dei quadri, correnti di cortocircuito, conduttore di protezione, contatti indiretti, selettività tra
 * interruttori e tra differenziali, rifasamento, impianto di terra e computo dei materiali. Calcolo semplificato
 * per lo studio:
 * - impedenze sommate come numeri complessi con R e X; resistività del rame a 70 °C, reattanza 0,08 mΩ/m;
 * - rete BT a monte del punto di consegna: impedenza ricavata dall'Icc dichiarata, con R = X (ipotesi);
 * - correnti delle linee sommate aritmeticamente sulle fasi (cautelativo).
 * Articoli della CEI 64-8:2007 verificati sul testo (solo studio storico: l'edizione vigente è la IX).
 */

export const U0 = 230;
export const UN = 400;
const X_PER_M = 0.08e-3;
export const SECTIONS: WireSection[] = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
/** Correnti nominali: modulari fino a 63 A, poi interruttori scatolati. */
export const IN_MODULAR = [6, 10, 16, 20, 25, 32, 40, 50, 63];
export const IN_MCCB = [80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250, 1600];
export const IN_ALL = [...IN_MODULAR, ...IN_MCCB];
const ICU_MODULAR = [4.5, 6, 10, 15, 25];
const ICU_MCCB = [16, 25, 36, 50, 70, 100];
const IN_RCD = [25, 40, 63, 80, 100, 125];
/** Batterie di rifasamento: taglie commerciali tipiche [kvar]. */
export const PFC_SIZES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400];
/** Soglia magnetica superiore (intervento sicuro) in multipli di In: CEI EN 60898-1; scatolati Im = 10·In ± 20%. */
const MAG_HI: Record<Curve, number> = { B: 5, C: 10, D: 20 };
const MAG_LO: Record<Curve, number> = { B: 3, C: 5, D: 10 };
const MCCB_HI = 12;
const MCCB_LO = 8;
/** Corrente di avviamento stimata in multipli della nominale. */
export const START_FACTOR = { diretto: 6, 'stella-triangolo': 2, inverter: 1.2 } as const;

export const f = (v: number, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fA = (a: number) => (a >= 1000 ? `${f(a / 1000, 2)} kA` : `${f(a, a >= 100 ? 0 : 1)} A`);
const fS = (s: number) => f(s, s % 1 ? 1 : 0);

/** info = prescrizione da rispettare in opera (non verificabile dal calcolo). */
export type Status = 'ok' | 'info' | 'warn' | 'error';

export interface Check {
  id: string;
  label: string;
  status: Status;
  text: string;
  /** Riferimento normativo verificato sul testo */
  ref?: string;
}

interface Z {
  r: number;
  x: number;
}
const add = (...zs: Z[]): Z => zs.reduce((a, b) => ({ r: a.r + b.r, x: a.x + b.x }), { r: 0, x: 0 });
const mag = (z: Z) => Math.hypot(z.r, z.x);
const cond = (lengthM: number, s: number): Z => ({ r: (RHO_CU_70 * lengthM) / s, x: X_PER_M * lengthM });
const ZERO: Z = { r: 0, x: 0 };
const worst = (cs: Check[]): Status => (cs.some((c) => c.status === 'error') ? 'error' : cs.some((c) => c.status === 'warn') ? 'warn' : 'ok');

/** Impedenza a monte del quadro generale: per fase e anello fase-neutro (= fase-PE nel TN-S), e Icc massima. */
export interface Source {
  phase: Z;
  loop: Z;
  /** Icc massima al punto di consegna [A]: trifase con fornitura trifase, fase-neutro in monofase */
  iccMaxA: number;
}

export function sourceImpedance(p: Plant): Source {
  if (p.supply.kind === 'cabina') {
    const c = cabinImpedance(p.supply.kva, p.supply.ukPct, p.supply.mvSccMVA);
    return { phase: { r: c.r, x: c.x }, loop: { r: 2 * c.r, x: 2 * c.x }, iccMaxA: c.ik3 };
  }
  const icc = Math.max(0.5, p.supply.iccKA) * 1000;
  const h = U0 / icc / Math.SQRT2;
  // Monofase: Icc dichiarata fase-neutro, l'impedenza è quella dell'anello. Trifase: Icc trifase, impedenza di fase.
  if (p.supply.kind === 'bt-mono') return { phase: { r: h / 2, x: h / 2 }, loop: { r: h, x: h }, iccMaxA: icc };
  return { phase: { r: h, x: h }, loop: { r: 2 * h, x: 2 * h }, iccMaxA: icc };
}

/** Corrente d'impiego [A] di una potenza attiva [W]. */
export function currentOf(powerW: number, phases: 1 | 3, cosPhi: number): number {
  const c = Math.max(0.1, Math.min(1, cosPhi));
  return phases === 3 ? powerW / (Math.sqrt(3) * UN * c) : powerW / (U0 * c);
}

/** Caduta di tensione percentuale lungo una linea (sezione equivalente dei conduttori in parallelo). */
export function dropPct(ibA: number, lengthM: number, s: number, phases: 1 | 3, cosPhi: number): number {
  const c = Math.max(0.1, Math.min(1, cosPhi));
  const sin = Math.sqrt(1 - c * c);
  const k = phases === 3 ? Math.sqrt(3) : 2;
  const un = phases === 3 ? UN : U0;
  return ((k * ibA * lengthM * ((RHO_CU_70 / s) * c + X_PER_M * sin)) / un) * 100;
}

/** Sezione minima del conduttore di protezione, CEI 64-8:2007 Tab. 54F (stesso materiale dei conduttori di fase). */
export function peSection(s: WireSection): WireSection {
  if (s <= 16) return s;
  if (s <= 35) return 16;
  const half = s / 2;
  // sezione unificata più vicina al valore calcolato (543.1.2)
  return SECTIONS.reduce((best, x) => (Math.abs(x - half) < Math.abs(best - half) ? x : best), SECTIONS[0]!);
}

export const isMccb = (inA: number) => inA > 63;
export const pickIn = (ib: number) => IN_ALL.find((v) => v >= ib - 1e-9) ?? null;
const pickIcu = (iccA: number, mccb: boolean) => (mccb ? ICU_MCCB : ICU_MODULAR).find((v) => v * 1000 >= iccA) ?? null;
const magHi = (inA: number, curve: Curve) => inA * (isMccb(inA) ? MCCB_HI : MAG_HI[curve]);
const magLo = (inA: number, curve: Curve) => inA * (isMccb(inA) ? MCCB_LO : MAG_LO[curve]);

/** Designazione del cavo multipolare: anime e sezione (G = con giallo-verde), con i cavi in parallelo. */
export function cableDesignation(phases: 1 | 3, withNeutral: boolean, s: WireSection, n = 1): string {
  const cores = phases === 1 ? 3 : withNeutral ? 5 : 4;
  const one = `${cores}G${fS(s)}`;
  return n > 1 ? `${n}×(${one})` : one;
}

export function lineIb(l: PlantLine): number {
  return currentOf(l.powerW * l.ku, l.phases, l.cosPhi);
}

/** Taglia minima della protezione: 16 A per le prese monofase (come le prese da 16 A), 10 A per gli altri. */
export const minIn = (l: PlantLine): number => (l.kind === 'prese' && l.phases === 1 ? 16 : 10);
/** Sezione minima ammessa dal progetto: 1,5 mm² (Tab. 52E) per luce, 2,5 mm² per gli altri circuiti (buona pratica). */
export const minSection = (l: PlantLine): WireSection => (l.kind === 'luce' ? 1.5 : 2.5);

// ------------------------------------------------------------------ bilancio delle potenze (per quadro)

export interface Balance {
  installedW: number;
  /** Potenza assorbita = Σ P·ku */
  absorbedW: number;
  /** Potenza contemporanea = kc · Σ P·ku */
  simultaneousW: number;
  reactiveVar: number;
  cosPhi: number;
  /** Corrente per fase con la contemporaneità [A] (quadro monofase: un solo valore) */
  phaseA: number[];
  /** Corrente d'impiego della linea che alimenta il quadro [A] */
  ibA: number;
  /** Squilibrio tra le fasi: (max − min) / max */
  unbalance: number;
  /** Fase assegnata a ogni linea monofase (quadro trifase), anche nei sottoquadri */
  phaseOf: Map<string, 1 | 2 | 3>;
}

interface Demand {
  installedW: number;
  pW: number;
  qVar: number;
  tri: boolean;
  /** Corrente per fase (trifase) o corrente della linea (monofase) */
  i: number[];
}

const childrenOf = (p: Plant, boardId: string) => p.lines.filter((l) => l.boardId === boardId && l.id !== boardId);
export const isSubBoard = (p: Plant, l: PlantLine) => l.kind === 'sottoquadro' && childrenOf(p, l.id).length > 0;

function demandOf(p: Plant, l: PlantLine, phaseOf: Map<string, 1 | 2 | 3>, depth: number): Demand {
  if (isSubBoard(p, l) && depth < 6) {
    const b = boardBalance(p, l.id, l.kcSub ?? 0.8, l.phases === 3, phaseOf, depth + 1);
    return { installedW: b.installedW, pW: b.simultaneousW, qVar: b.reactiveVar, tri: l.phases === 3, i: l.phases === 3 ? b.phaseA : [b.ibA] };
  }
  const ib = lineIb(l);
  const c = Math.max(0.1, Math.min(1, l.cosPhi));
  const pW = l.powerW * l.ku;
  return { installedW: l.powerW, pW, qVar: pW * Math.tan(Math.acos(c)), tri: l.phases === 3, i: l.phases === 3 ? [ib, ib, ib] : [ib] };
}

function boardBalance(p: Plant, boardId: string, kc: number, tri: boolean, phaseOf: Map<string, 1 | 2 | 3>, depth = 0): Balance {
  const lines = childrenOf(p, boardId);
  const ds = new Map(lines.map((l) => [l.id, demandOf(p, l, phaseOf, depth)]));
  let installedW = 0;
  let absorbedW = 0;
  let q = 0;
  for (const d of ds.values()) {
    installedW += d.installedW;
    absorbedW += d.pW;
    q += d.qVar;
  }
  const simultaneousW = absorbedW * kc;
  const reactiveVar = q * kc;
  const cosPhi = simultaneousW > 0 ? simultaneousW / Math.hypot(simultaneousW, reactiveVar) : 1;
  if (!tri) {
    const sum = [...ds.values()].reduce((a, d) => a + d.i[0]!, 0) * kc;
    return { installedW, absorbedW, simultaneousW, reactiveVar, cosPhi, phaseA: [sum], ibA: sum, unbalance: 0, phaseOf };
  }
  const ph = [0, 0, 0];
  const put = (i: number, v: number) => (ph[i] = ph[i]! + v);
  for (const l of lines) {
    const d = ds.get(l.id)!;
    if (d.tri) d.i.forEach((v, k) => put(k, v));
    else if (l.phase) {
      put(l.phase - 1, d.i[0]!);
      phaseOf.set(l.id, l.phase);
    }
  }
  // Linee monofase senza fase scelta: dalla più carica, sulla fase meno carica.
  const auto = lines.filter((l) => !ds.get(l.id)!.tri && !l.phase).sort((a, b) => ds.get(b.id)!.i[0]! - ds.get(a.id)!.i[0]!);
  for (const l of auto) {
    const k = ph.indexOf(Math.min(...ph));
    put(k, ds.get(l.id)!.i[0]!);
    phaseOf.set(l.id, (k + 1) as 1 | 2 | 3);
  }
  const phaseA = ph.map((v) => v * kc);
  const max = Math.max(...phaseA);
  const min = Math.min(...phaseA);
  return { installedW, absorbedW, simultaneousW, reactiveVar, cosPhi, phaseA, ibA: max, unbalance: max > 0 ? (max - min) / max : 0, phaseOf };
}

/** Bilancio del quadro generale, con l'eventuale batteria di rifasamento. */
export function balance(p: Plant): Balance {
  const b = boardBalance(p, '', p.kc, isThreePhaseSupply(p), new Map());
  if (!p.pfcKvar) return b;
  const q = b.reactiveVar - p.pfcKvar * 1000;
  const sOld = Math.hypot(b.simultaneousW, b.reactiveVar);
  const sNew = Math.hypot(b.simultaneousW, q);
  const k = sOld > 0 ? sNew / sOld : 1;
  return { ...b, reactiveVar: q, cosPhi: sNew > 0 ? b.simultaneousW / sNew : 1, phaseA: b.phaseA.map((v) => v * k), ibA: b.ibA * k };
}

// ------------------------------------------------------------------ differenziali

export interface Rcd {
  label: string;
  idnMa: number;
  s: boolean;
  type: string;
}

function ownRcd(p: Plant, l: PlantLine): Rcd | null {
  if (l.rcdGroup) {
    const g = p.rcdGroups.find((x) => x.id === l.rcdGroup);
    if (g) return { label: `differenziale «${g.name}»`, idnMa: g.idnMa, s: g.s, type: g.type };
  }
  if (!l.rcdMa) return null;
  return { label: `differenziale di ${l.name}`, idnMa: l.rcdMa, s: l.kind === 'sottoquadro' && !!l.rcdS, type: l.rcdType };
}

// ------------------------------------------------------------------ linee e quadri

/** Condizioni a monte di un quadro: impedenze, caduta, Icc, protezione e differenziali che lo alimentano. */
interface Upstream {
  phase: Z;
  loopN: Z;
  loopPE: Z;
  dropPct: number;
  iccMaxA: number;
  ocpIn: number | null;
  ocpCurve: Curve;
  ocpLabel: string;
  /** Differenziali a monte, dal più vicino */
  rcds: Rcd[];
}

export interface LineResult {
  line: PlantLine;
  /** Quadro di partenza ('' = generale) */
  boardId: string;
  /** Sigla (Q1, Q2… sul generale; Q4.1… nei sottoquadri) */
  tag: string;
  phase: 1 | 2 | 3 | null;
  ibA: number;
  cosPhi: number;
  inA: number | null;
  icuKA: number | null;
  section: WireSection | null;
  /** Cavi in parallelo */
  parallel: number;
  peSection: WireSection | null;
  iz: AmpacityResult | null;
  /** Portata complessiva dei cavi in parallelo [A] */
  izA: number | null;
  dropLinePct: number;
  dropTotPct: number;
  /** Corrente di cortocircuito minima a fondo linea [A] (fase-neutro o fase-fase senza neutro) */
  iccMinA: number | null;
  /** Corrente di guasto a massa a fondo linea (TN-S) [A] */
  faultA: number | null;
  /** Icc massima al quadro di partenza [A] */
  iccOriginA: number;
  designation: string;
  /** Differenziale più vicino che protegge la linea */
  rcd: Rcd | null;
  /** Solo sottoquadri alimentati: bilancio del sottoquadro */
  sub: Balance | null;
  checks: Check[];
  status: Status;
}

function sizeLine(p: Plant, l: PlantLine, ib: number, cosPhi: number, up: Upstream, faultNeedsMagnetic: boolean, inA: number | null) {
  const tri = l.phases === 3;
  const tn = p.earthing === 'TN-S';
  const loaded: 2 | 3 = tri ? 3 : 2;
  const izOf = (s: WireSection, n: number) => ampacity(s, l.method, l.insulation, l.ambientC, Math.max(l.grouped, n), loaded);
  const shortAt = (s: WireSection, n: number) => {
    const z = cond(l.lengthM, s * n);
    if (tri && !l.withNeutral) return UN / mag(add(up.phase, up.phase, z, z));
    return U0 / mag(add(up.loopN, z, z));
  };
  const faultAt = (s: WireSection, n: number) => (tn ? U0 / mag(add(up.loopPE, cond(l.lengthM, s * n), cond(l.lengthM, peSection(s) * n))) : null);
  const dropOf = (s: WireSection, n: number) => dropPct(ib, l.lengthM, s * n, l.phases, cosPhi);
  // La linea di un sottoquadro usa al più metà del margine di caduta rimasto: l'altra metà serve alle sue linee.
  const dropLimit = isSubBoard(p, l) ? up.dropPct + (p.maxDropPct - up.dropPct) / 2 : p.maxDropPct;
  const fits = (s: WireSection, n: number) => {
    const iz = izOf(s, n);
    if (!iz || !inA) return false;
    if (iz.iz * n < inA) return false;
    if (up.dropPct + dropOf(s, n) > dropLimit) return false;
    if (faultNeedsMagnetic && (faultAt(s, n) ?? 0) < magHi(inA, l.curve)) return false;
    return true;
  };
  let section: WireSection | null = l.sectionOverride ?? null;
  let n = 1;
  if (!section) {
    outer: for (const k of [1, 2, 3, 4]) {
      for (const s of SECTIONS) {
        if (s < minSection(l) || (k > 1 && s < 50)) continue;
        if (fits(s, k)) {
          section = s;
          n = k;
          break outer;
        }
      }
    }
  }
  if (!section) return { section: null, n: 1, iz: null, drop: 0, iccMin: null, fault: null };
  return { section, n, iz: izOf(section, n), drop: dropOf(section, n), iccMin: shortAt(section, n), fault: faultAt(section, n) };
}

function lineResult(p: Plant, l: PlantLine, tag: string, up: Upstream, phaseOf: Map<string, 1 | 2 | 3>): LineResult {
  const tri = l.phases === 3;
  const tn = p.earthing === 'TN-S';
  const sub = isSubBoard(p, l) ? boardBalance(p, l.id, l.kcSub ?? 0.8, tri, phaseOf) : null;
  const ib = sub ? sub.ibA : lineIb(l);
  const cosPhi = sub ? sub.cosPhi : l.cosPhi;
  // Sottoquadro: almeno una taglia sopra la protezione più grande che alimenta, per la selettività.
  const childMax = sub ? Math.max(0, ...childrenOf(p, l.id).map((c) => c.inOverride ?? pickIn(Math.max(lineIb(c), minIn(c))) ?? 0)) : 0;
  const above = childMax ? (IN_ALL.find((v) => v > childMax) ?? childMax) : 0;
  const inA = l.inOverride ?? pickIn(Math.max(ib, minIn(l), above));
  const own = ownRcd(p, l);
  const chain = own ? [own, ...up.rcds] : up.rcds;
  // Con un differenziale il guasto a massa non serve a far intervenire il magnetico: nel TN senza differenziale sì.
  const faultNeedsMagnetic = tn && chain.length === 0;
  const sz = sizeLine(p, l, ib, cosPhi, up, faultNeedsMagnetic, inA);
  const { section, n, iz } = sz;
  const izA = iz ? iz.iz * n : null;
  const pe = section ? peSection(section) : null;
  const dropTot = up.dropPct + sz.drop;
  const icuKA = inA ? pickIcu(up.iccMaxA, isMccb(inA)) : null;
  const checks: Check[] = [];

  if (!inA) checks.push({ id: 'in', label: 'Protezione', status: 'error', text: `Ib = ${fA(ib)} oltre la gamma degli interruttori considerati.` });
  if (!section)
    checks.push({
      id: 'section',
      label: 'Sezione',
      status: 'error',
      text: `Nessuna sezione fino a 4 cavi da 240 mm² soddisfa portata, caduta di tensione${faultNeedsMagnetic ? ' e guasto a massa' : ''}: accorcia la linea, cambia posa o dividi il carico.`,
    });
  if (inA && section && iz && izA) {
    const ok = ib <= inA && inA <= izA;
    checks.push({
      id: '433',
      label: 'Sovraccarico',
      status: ok ? 'ok' : 'error',
      text: `Ib ${fA(ib)} ${ib <= inA ? '≤' : '>'} In ${inA} A ${inA <= izA ? '≤' : '>'} Iz ${fA(izA)} (${n > 1 ? `${n} cavi × ` : ''}I0 ${fA(iz.i0)} · k1 ${f(iz.k1, 2)} · k2 ${f(iz.k2, 2)}). If ≤ 1,45·Iz è garantita ${isMccb(inA) ? 'dall\'interruttore (If = 1,3·Ir)' : 'dai magnetotermici (If = 1,45·In)'}.`,
      ref: 'CEI 64-8:2007 433.2',
    });
    if (n > 1)
      checks.push({ id: 'parallel', label: 'Cavi in parallelo', status: 'info', text: `${n} cavi uguali in parallelo: stessa sezione, lunghezza e posa, collegati alle stesse estremità, perché la corrente si ripartisca in modo uniforme.` });
  }
  if (inA) {
    checks.push(
      icuKA !== null
        ? {
            id: '434',
            label: 'Cortocircuito',
            status: 'ok',
            text: `Potere di interruzione ${fS(icuKA)} kA ≥ Icc presunta al quadro ${fA(up.iccMaxA)}: con la protezione dal sovraccarico assicura anche quella dal cortocircuito (per gli interruttori che non limitano la corrente va verificato I²t ≤ K²S² sui dati del costruttore).`,
            ref: 'CEI 64-8:2007 434.3.1, 435.1',
          }
        : { id: '434', label: 'Cortocircuito', status: 'error', text: `Icc presunta ${fA(up.iccMaxA)} oltre il potere di interruzione degli interruttori considerati.`, ref: 'CEI 64-8:2007 434.3.1' },
    );
  }
  if (section) {
    const ok = dropTot <= p.maxDropPct;
    checks.push({
      id: '525',
      label: 'Caduta di tensione',
      status: ok ? 'ok' : 'warn',
      text: `${f(sz.drop, 2)}% sulla linea + ${f(up.dropPct, 2)}% a monte = ${f(dropTot, 2)}% ${ok ? '≤' : '>'} ${f(p.maxDropPct, 1)}%.`,
      ref: 'CEI 64-8:2007 525 (raccomandazione 4%)',
    });
    checks.push({
      id: '54F',
      label: 'Conduttore di protezione',
      status: 'ok',
      text: `PE ≥ ${fS(pe!)} mm² con fase da ${fS(section)} mm²${pe !== section ? ' (con un cavo multipolare il PE ha di solito la stessa sezione)' : ''}.`,
      ref: 'CEI 64-8:2007 543.1.2, Tab. 54F',
    });
  }
  // Contatti indiretti
  const near = chain[0] ?? null;
  if (!tn) {
    if (!near) checks.push({ id: '413', label: 'Contatti indiretti (TT)', status: 'error', text: 'Nel sistema TT serve un differenziale: senza, un guasto a massa può lasciare tensioni pericolose.', ref: 'CEI 64-8:2007 413.1.4.2' });
    else {
      const ut = (p.raOhm * near.idnMa) / 1000;
      checks.push({
        id: '413',
        label: 'Contatti indiretti (TT)',
        status: ut <= 50 ? 'ok' : 'error',
        text: `Protetta dal ${near.label}: RA · IΔn = ${f(p.raOhm, 0)} Ω × ${f(near.idnMa / 1000, 3)} A = ${f(ut, 1)} V ${ut <= 50 ? '≤' : '>'} 50 V.`,
        ref: 'CEI 64-8:2007 413.1.4.2',
      });
    }
  } else if (section && inA && sz.fault !== null) {
    if (near) checks.push({ id: '413', label: 'Contatti indiretti (TN)', status: 'ok', text: `Guasto a massa ${fA(sz.fault)} ≫ IΔn ${f(near.idnMa / 1000, 3)} A: interviene il ${near.label}.`, ref: 'CEI 64-8:2007 413.1.3.3' });
    else {
      const ia = magHi(inA, l.curve);
      const ok = sz.fault >= ia;
      checks.push({
        id: '413',
        label: 'Contatti indiretti (TN)',
        status: ok ? 'ok' : 'error',
        text: `Guasto a massa ${fA(sz.fault)} ${ok ? '≥' : '<'} Ia ${fA(ia)} (soglia magnetica): interruzione entro ${inA <= 32 ? '0,4 s' : '5 s'}${ok ? '' : ' non garantita: aumenta la sezione o aggiungi un differenziale'}.`,
        ref: 'CEI 64-8:2007 413.1.3.3, Tab. 41A',
      });
    }
  }
  // Selettività tra differenziali: il più vicino e quello a monte
  if (own && up.rcds[0]) {
    const u = up.rcds[0];
    const ok = u.s && u.idnMa >= 3 * own.idnMa;
    checks.push({
      id: '536',
      label: 'Selettività differenziale',
      status: ok ? 'ok' : 'warn',
      text: ok
        ? `${u.label} (${u.idnMa} mA, tipo S) a monte del ${own.label} (${own.idnMa} mA): rapporto ${f(u.idnMa / own.idnMa, 1)} ≥ 3, selettivi.`
        : `${own.label} (${own.idnMa} mA) sotto il ${u.label} (${u.idnMa} mA${u.s ? ', tipo S' : ''}): ${!u.s ? 'quello a monte non è selettivo (tipo S)' : 'rapporto tra le IΔn sotto 3'}, un guasto a terra può far intervenire anche quello a monte.`,
      ref: 'CEI 64-8:2007 536.3 (commento)',
    });
  }
  // Selettività con l'interruttore a monte
  if (inA && up.ocpIn) {
    if (up.ocpIn <= inA)
      checks.push({ id: 'sel', label: 'Selettività', status: 'warn', text: `La protezione a monte (${up.ocpLabel}, ${up.ocpIn} A) non è più grande di questa (${inA} A): un sovraccarico o un guasto può farla intervenire insieme.` });
    else {
      const lim = magLo(up.ocpIn, up.ocpCurve);
      const total = up.iccMaxA <= lim;
      const overlap = magHi(inA, l.curve) >= lim;
      checks.push({
        id: 'sel',
        label: 'Selettività',
        status: total && !overlap ? 'ok' : 'info',
        text: overlap
          ? `La soglia magnetica di questa protezione (fino a ${fA(magHi(inA, l.curve))}) si sovrappone a quella di ${up.ocpLabel} (da ${fA(lim)}): selettività solo nella zona di sovraccarico.`
          : total
            ? `Selettiva con ${up.ocpLabel}: l'Icc massima al quadro (${fA(up.iccMaxA)}) resta sotto la soglia magnetica a monte (${fA(lim)}).`
            : `Selettività parziale con ${up.ocpLabel} fino a circa ${fA(lim)} (soglia magnetica a monte); oltre, fino a ${fA(up.iccMaxA)}, servono le tabelle di selettività del costruttore.`,
      });
    }
  }
  // Motori
  if (l.kind === 'motore' && inA) {
    const mode = l.starting ?? 'diretto';
    const ia = (ib / Math.max(0.1, l.ku)) * START_FACTOR[mode];
    const ok = magLo(inA, l.curve) > ia;
    checks.push({
      id: 'start',
      label: 'Avviamento del motore',
      status: ok ? 'ok' : 'warn',
      text: ok
        ? `Spunto stimato ${fA(ia)} (avviamento ${mode}) sotto la soglia magnetica minima ${fA(magLo(inA, l.curve))}.`
        : `Spunto stimato ${fA(ia)} (avviamento ${mode}) oltre la soglia magnetica minima ${fA(magLo(inA, l.curve))}: rischio di scatto all'avviamento. Usa la curva D, un avviamento stella-triangolo o un inverter.`,
    });
    checks.push({
      id: 'motor-kit',
      label: 'Comando del motore',
      status: 'info',
      text:
        mode === 'inverter'
          ? 'Inverter con le sue protezioni; il differenziale va scelto per le correnti di dispersione dell\'inverter (tipo F o B, secondo il costruttore).'
          : `${mode === 'stella-triangolo' ? 'Avviatore stella-triangolo (tre contattori)' : 'Contattore'} con relè termico di classe 10 tarato sulla corrente del motore, oppure salvamotore: la protezione di linea resta per il cortocircuito.`,
    });
  }
  if (l.kind === 'ricarica')
    checks.push({ id: 'evse', label: 'Ricarica auto', status: 'info', text: 'Linea dedicata con differenziale proprio: tipo A con rilevamento della corrente continua nella wallbox, altrimenti tipo B.' });
  if (l.kind === 'prese' && inA && inA > 16 && l.phases === 1)
    checks.push({ id: 'socket', label: 'Prese', status: 'warn', text: `Le prese domestiche sono da 10/16 A: con una protezione da ${inA} A la presa non è protetta dal sovraccarico.` });
  if (l.bathroom) checks.push(...bathroomChecks());
  if (l.kind === 'emergenza') checks.push(...safetyChecks());

  return {
    line: l,
    boardId: l.boardId,
    tag,
    phase: !tri && phaseOf.has(l.id) ? phaseOf.get(l.id)! : null,
    ibA: ib,
    cosPhi,
    inA,
    icuKA,
    section,
    parallel: n,
    peSection: pe,
    iz,
    izA,
    dropLinePct: sz.drop,
    dropTotPct: dropTot,
    iccMinA: sz.iccMin,
    faultA: sz.fault,
    iccOriginA: up.iccMaxA,
    designation: section ? cableDesignation(l.phases, l.phases === 1 || l.withNeutral, section, n) : '—',
    rcd: near,
    sub,
    checks,
    status: worst(checks),
  };
}

/** Locali da bagno o doccia: prescrizioni d'installazione (CEI 64-8:2007 Sez. 701), da rispettare in opera. */
function bathroomChecks(): Check[] {
  return [
    { id: '701-eq', label: 'Bagno: equipotenziale', status: 'info', text: 'Collegamento equipotenziale supplementare tra le masse estranee accessibili delle zone 0, 1, 2 e 3 e i conduttori di protezione delle masse in queste zone.', ref: 'CEI 64-8:2007 701.413.1.2' },
    { id: '701-ip', label: 'Bagno: gradi di protezione', status: 'info', text: 'Almeno IPX7 in zona 0, IPX4 in zona 1 e 2 (IPX5 nei bagni pubblici lavati con getti d\'acqua).', ref: 'CEI 64-8:2007 701.512.2' },
    { id: '701-dev', label: 'Bagno: apparecchi e cassette', status: 'info', text: 'Nelle zone 0, 1 e 2 niente cassette di derivazione, né dispositivi di protezione, sezionamento o comando (salvo circuiti SELV fino a 12 V c.a. con sorgente fuori dalle zone).', ref: 'CEI 64-8:2007 701.520.04, 701.53' },
  ];
}

/** Circuiti dei servizi di sicurezza (illuminazione di sicurezza): CEI 64-8:2007 Cap. 56. */
function safetyChecks(): Check[] {
  return [
    { id: '563-ind', label: 'Sicurezza: circuito indipendente', status: 'info', text: 'Il circuito non deve dipendere dagli altri: un guasto o una modifica altrove non deve comprometterlo (cavi, canalizzazioni o percorsi distinti). Non deve attraversare luoghi con pericolo di esplosione.', ref: 'CEI 64-8:2007 563.1, 563.2' },
    { id: '563-ol', label: 'Sicurezza: sovraccarico', status: 'info', text: 'La protezione contro i sovraccarichi si può omettere; le protezioni vanno scelte perché una sovracorrente in un circuito non comprometta gli altri circuiti di sicurezza.', ref: 'CEI 64-8:2007 563.3, 563.4' },
    { id: '561-src', label: 'Sicurezza: sorgente', status: 'info', text: 'Sorgente (batterie degli apparecchi autonomi o centralizzata) che mantenga l\'alimentazione per una durata adeguata; autonomia e illuminamenti dipendono dalle norme dell\'attività (es. UNI EN 1838), non verificate qui.', ref: 'CEI 64-8:2007 561.1, 562.1' },
    { id: '563-id', label: 'Sicurezza: dispositivi', status: 'info', text: 'Dispositivi di protezione, comando e sezionamento chiaramente identificati e raggruppati in luoghi accessibili solo a persone addestrate.', ref: 'CEI 64-8:2007 563.5' },
  ];
}

// ------------------------------------------------------------------ quadro generale

export interface MainResult {
  ibA: number;
  inA: number | null;
  icuKA: number | null;
  iccMaxA: number;
  section: WireSection | null;
  parallel: number;
  iz: AmpacityResult | null;
  dropPct: number;
  checks: Check[];
  status: Status;
}

export interface GroupResult {
  group: RcdGroup;
  boardName: string;
  inA: number;
  poles: 2 | 4;
  lines: LineResult[];
}

export interface PfcAdvice {
  /** Potenza reattiva da compensare per arrivare a cos φ 0,95 [kvar] */
  neededKvar: number;
  /** Taglia commerciale suggerita [kvar] */
  suggestedKvar: number | null;
  /** cos φ senza rifasamento */
  cosPhiBefore: number;
}

export interface EarthResult {
  tt: boolean;
  /** IΔn più alta dell'impianto [mA] */
  maxIdnMa: number;
  /** RA massima ammessa = 50 V / IΔn più alta [Ω] */
  raMaxOhm: number | null;
  raOk: boolean | null;
  /** Resistenza di un picchetto [Ω] e numero stimato di picchetti per la RA di progetto */
  rodOhm: number;
  rods: number;
  /** Sezione del conduttore equipotenziale principale [mm²] (547.1.1) */
  equipotentialMm2: number;
  peMaxMm2: number;
  checks: Check[];
}

export interface PlantResult {
  balance: Balance;
  source: Source;
  main: MainResult;
  /** Tutte le linee, quadro per quadro (prima il generale) */
  lines: LineResult[];
  boards: { id: string; name: string; lines: LineResult[]; feeder: LineResult | null }[];
  groups: GroupResult[];
  pfc: PfcAdvice;
  earth: EarthResult;
  dm: DmResult;
  errors: number;
  warnings: number;
}

const RCD_SIZE = (inA: number) => IN_RCD.find((v) => v >= inA) ?? IN_RCD[IN_RCD.length - 1]!;

export function computePlant(p: Plant): PlantResult {
  const tri = isThreePhaseSupply(p);
  const src = sourceImpedance(p);
  const b = balance(p);
  const phases: 1 | 3 = tri ? 3 : 1;
  // Quadro generale e linea di alimentazione
  const mainIn = pickIn(Math.max(b.ibA, 6));
  const fz = (s: number, n: number) => ampacity(s as WireSection, p.feeder.method, p.feeder.insulation, 30, n, tri ? 3 : 2);
  let fSec: WireSection | null = p.feeder.sectionOverride ?? null;
  let fN = 1;
  if (!fSec && mainIn) {
    outer: for (const k of [1, 2, 3, 4])
      for (const s of SECTIONS) {
        if (s < 6 || (k > 1 && s < 50)) continue;
        if ((fz(s, k)?.iz ?? 0) * k >= mainIn) {
          fSec = s;
          fN = k;
          break outer;
        }
      }
  }
  const fIz = fSec ? fz(fSec, fN) : null;
  const fDrop = fSec ? dropPct(b.ibA, p.feeder.lengthM, fSec * fN, phases, b.cosPhi) : 0;
  const fZ = fSec ? cond(p.feeder.lengthM, fSec * fN) : ZERO;
  const fPe = fSec ? cond(p.feeder.lengthM, peSection(fSec) * fN) : ZERO;
  const mainUp: Upstream = {
    phase: add(src.phase, fZ),
    loopN: add(src.loop, fZ, fZ),
    loopPE: add(src.loop, fZ, fPe),
    dropPct: fDrop,
    iccMaxA: src.iccMaxA,
    ocpIn: mainIn,
    ocpCurve: 'C',
    ocpLabel: 'il generale',
    rcds: p.mainRcdMa ? [{ label: 'differenziale generale', idnMa: p.mainRcdMa, s: p.mainRcdS, type: 'A' }] : [],
  };
  const icuKA = mainIn ? pickIcu(src.iccMaxA, isMccb(mainIn)) : null;
  const mainChecks: Check[] = [];
  if (!mainIn) mainChecks.push({ id: 'in', label: 'Interruttore generale', status: 'error', text: `Corrente d'impiego ${fA(b.ibA)} oltre la gamma degli interruttori considerati.` });
  else
    mainChecks.push({
      id: 'in',
      label: 'Interruttore generale',
      status: icuKA ? 'ok' : 'error',
      text: `Ib = ${fA(b.ibA)} → generale ${isMccb(mainIn) ? 'scatolato' : 'modulare'} da ${mainIn} A, potere di interruzione ≥ ${fA(src.iccMaxA)}: ${icuKA ? `${fS(icuKA)} kA` : 'oltre la gamma'}${p.mainRcdMa ? `, con differenziale ${p.mainRcdMa} mA${p.mainRcdS ? ' selettivo (S)' : ''}` : ''}.`,
      ref: 'CEI 64-8:2007 434.3.1',
    });
  if (mainIn && fSec && fIz)
    mainChecks.push({
      id: 'feeder',
      label: 'Linea di alimentazione del quadro',
      status: fIz.iz * fN >= mainIn ? 'ok' : 'error',
      text: `${cableDesignation(phases, true, fSec, fN)} da ${f(p.feeder.lengthM, 0)} m: Iz = ${fA(fIz.iz * fN)} ${fIz.iz * fN >= mainIn ? '≥' : '<'} In = ${mainIn} A; caduta ${f(fDrop, 2)}%.`,
      ref: 'CEI 64-8:2007 433.2',
    });
  else if (mainIn) mainChecks.push({ id: 'feeder', label: 'Linea di alimentazione del quadro', status: 'error', text: 'Nessuna combinazione fino a 4 cavi da 240 mm² ha la portata richiesta: cambia posa o dividi l\'alimentazione.' });

  if (p.supply.kind !== 'cabina') {
    const kw = b.simultaneousW / 1000;
    const limit = p.supply.contractKW * 1.1;
    mainChecks.push({
      id: 'contract',
      label: 'Potenza impegnata',
      status: kw > limit ? 'warn' : 'ok',
      text:
        kw > limit
          ? `Potenza contemporanea ${f(kw, 1)} kW oltre i ${f(limit, 1)} kW prelevabili con ${f(p.supply.contractKW, 1)} kW impegnati: il limitatore del contatore può aprire. Aumenta la potenza impegnata o riduci la contemporaneità.`
          : `Potenza contemporanea ${f(kw, 1)} kW entro i ${f(limit, 1)} kW prelevabili (impegnata + 10%).`,
    });
    if (!tri && kw > 10) mainChecks.push({ id: 'phases', label: 'Fornitura', status: 'warn', text: 'Oltre 10 kW le forniture sono di norma trifase: chiedi al distributore.' });
    if (kw > 100) mainChecks.push({ id: 'mt', label: 'Fornitura', status: 'warn', text: 'Oltre 100 kW la connessione ordinaria è in media tensione (CEI 0-16): valuta una cabina.' });
  } else {
    const kva = b.simultaneousW / Math.max(0.5, b.cosPhi) / 1000;
    const load = kva / p.supply.kva;
    mainChecks.push({
      id: 'trafo',
      label: 'Carico del trasformatore',
      status: load > 1 ? 'error' : load > 0.85 ? 'warn' : 'ok',
      text: `${f(kva, 0)} kVA contemporanei su ${p.supply.kva} kVA (${f(load * 100, 0)}%).${load > 0.85 ? ' Poco margine per ampliamenti: valuta la taglia superiore.' : ''}`,
    });
  }
  if (tri && b.unbalance > 0.3 && b.ibA > 10)
    mainChecks.push({ id: 'unbalance', label: 'Equilibrio delle fasi', status: 'warn', text: `Squilibrio del ${f(b.unbalance * 100, 0)}% tra le fasi: sposta qualche linea monofase sulla fase meno carica.` });

  // Sovratensioni
  if (p.spd === 'nessuno')
    mainChecks.push({
      id: 'spd',
      label: 'Sovratensioni',
      status: 'info',
      text: 'Nessun SPD: la necessità va stabilita con la valutazione del rischio della CEI EN 62305-2. Senza SPD i componenti devono reggere da soli le sovratensioni (tenuta all\'impulso della Tab. 44A: 4 kV per quadri, cavi e prese, 2,5 kV per gli elettrodomestici).',
      ref: 'CEI 64-8:2007 443.3, 443.4.1, Tab. 44A',
    });
  else
    mainChecks.push({
      id: 'spd',
      label: 'Sovratensioni',
      status: 'info',
      text: `SPD all'origine${p.spd === 'origine-sottoquadri' ? ' e nei sottoquadri' : ''}: il livello di protezione Up, più la tensione sui collegamenti dell'SPD, deve restare sotto la tenuta degli apparecchi da proteggere (2,5 kV per la categoria II a 230/400 V). Collegamenti corti; protezione di riserva dell'SPD secondo il costruttore.`,
      ref: 'CEI 64-8:2007 443.3, 443.4, Tab. 44A',
    });

  // Rifasamento
  const raw = boardBalance(p, '', p.kc, tri, new Map());
  const tanT = Math.tan(Math.acos(0.95));
  const neededKvar = Math.max(0, (raw.reactiveVar - raw.simultaneousW * tanT) / 1000);
  const pfc: PfcAdvice = { neededKvar, suggestedKvar: neededKvar > 0 ? (PFC_SIZES.find((v) => v >= neededKvar) ?? null) : null, cosPhiBefore: raw.cosPhi };
  if (p.pfcKvar && b.reactiveVar < 0)
    mainChecks.push({ id: 'pf', label: 'Rifasamento', status: 'warn', text: `Batteria da ${p.pfcKvar} kvar oltre la potenza reattiva dei carichi: l'impianto diventa capacitivo (cos φ ${f(b.cosPhi, 2)} in anticipo). Riduci la batteria o usala automatica a gradini.` });
  else if (b.cosPhi < 0.95 && b.simultaneousW > 16500)
    mainChecks.push({
      id: 'pf',
      label: 'Fattore di potenza',
      status: 'warn',
      text: `cos φ medio ${f(b.cosPhi, 2)}: sotto 0,95 la bolletta conteggia l'energia reattiva. Servono circa ${f(neededKvar, 1)} kvar per arrivare a 0,95${pfc.suggestedKvar ? ` (batteria da ${pfc.suggestedKvar} kvar)` : ''}. Regole ARERA in revisione.`,
    });
  else if (p.pfcKvar) mainChecks.push({ id: 'pf', label: 'Rifasamento', status: 'ok', text: `Batteria da ${p.pfcKvar} kvar: cos φ da ${f(raw.cosPhi, 2)} a ${f(b.cosPhi, 2)}.` });

  // Linee, quadro per quadro
  const phaseOf = new Map<string, 1 | 2 | 3>();
  boardBalance(p, '', p.kc, tri, phaseOf);
  const all: LineResult[] = [];
  const boards: PlantResult['boards'] = [];
  const walk = (boardId: string, up: Upstream, prefix: string, feeder: LineResult | null, name: string, depth: number) => {
    const rs: LineResult[] = [];
    childrenOf(p, boardId).forEach((l, i) => {
      const tag = `${prefix}${i + 1}`;
      const r = lineResult(p, l, tag, up, phaseOf);
      rs.push(r);
      all.push(r);
    });
    boards.push({ id: boardId, name, lines: rs, feeder });
    // Linee monofase di un sottoquadro monofase: sulla stessa fase della linea che lo alimenta
    for (const r of rs) {
      if (!r.sub || !r.section || depth > 5) continue;
      const l = r.line;
      if (l.phases === 1 && r.phase) for (const c of childrenOf(p, l.id)) phaseOf.set(c.id, r.phase);
      const z = cond(l.lengthM, r.section * r.parallel);
      const zpe = cond(l.lengthM, peSection(r.section) * r.parallel);
      const phase = add(up.phase, z);
      const loopN = add(up.loopN, z, z);
      const own = ownRcd(p, l);
      walk(
        l.id,
        {
          phase,
          loopN,
          loopPE: add(up.loopPE, z, zpe),
          dropPct: r.dropTotPct,
          iccMaxA: l.phases === 3 ? U0 / mag(phase) : U0 / mag(loopN),
          ocpIn: r.inA,
          ocpCurve: l.curve,
          ocpLabel: `${r.tag} (${l.name})`,
          rcds: own ? [own, ...up.rcds] : up.rcds,
        },
        `${r.tag}.`,
        r,
        l.name,
        depth + 1,
      );
    }
  };
  walk('', mainUp, 'Q', null, 'Quadro generale', 0);
  // Le fasi delle linee monofase nei sottoquadri monofase sono note solo ora: si aggiornano i risultati.
  for (const r of all) if (r.line.phases === 1 && !r.phase && phaseOf.has(r.line.id) && tri) r.phase = phaseOf.get(r.line.id)!;

  // Differenziali di gruppo
  const boardList = boardsOf(p);
  const groups: GroupResult[] = p.rcdGroups.map((g) => {
    const lines = all.filter((r) => r.line.rcdGroup === g.id);
    const board = boards.find((x) => x.id === g.boardId);
    const upIn = g.boardId ? (board?.feeder?.inA ?? 0) : (mainIn ?? 0);
    const sumIn = lines.reduce((a, r) => a + (r.inA ?? 0), 0);
    const poles: 2 | 4 = (g.boardId ? all.find((r) => r.line.id === g.boardId)?.line.phases === 3 : tri) && lines.some((r) => r.line.phases === 3 || r.phase) ? 4 : 2;
    return { group: g, boardName: boardList.find((x) => x.id === g.boardId)?.name ?? 'Quadro generale', inA: RCD_SIZE(Math.min(upIn || Infinity, sumIn || 25)), poles, lines };
  });
  for (const g of groups) {
    if (!g.lines.length) mainChecks.push({ id: `grp-${g.group.id}`, label: `Differenziale «${g.group.name}»`, status: 'warn', text: 'Nessuna linea assegnata a questo differenziale.' });
  }

  // Impianto di terra
  const earth = earthResult(p, all, fSec);
  const allChecks = [...mainChecks, ...earth.checks, ...all.flatMap((r) => r.checks)];
  return {
    balance: b,
    source: src,
    main: { ibA: b.ibA, inA: mainIn, icuKA, iccMaxA: src.iccMaxA, section: fSec, parallel: fN, iz: fIz, dropPct: fDrop, checks: mainChecks, status: worst(mainChecks) },
    lines: all,
    boards: [boards.find((x) => x.id === '')!, ...boards.filter((x) => x.id !== '')],
    groups,
    pfc,
    earth,
    dm: dm37(p),
    errors: allChecks.filter((c) => c.status === 'error').length,
    warnings: allChecks.filter((c) => c.status === 'warn').length,
  };
}

// ------------------------------------------------------------------ impianto di terra

const EQ_SIZES = [6, 10, 16, 25];

function earthResult(p: Plant, lines: LineResult[], feederSection: WireSection | null): EarthResult {
  const tt = p.earthing === 'TT';
  const idns = [p.mainRcdMa, ...p.rcdGroups.filter((g) => lines.some((r) => r.line.rcdGroup === g.id)).map((g) => g.idnMa), ...lines.filter((r) => !r.line.rcdGroup).map((r) => r.line.rcdMa)].filter((v) => v > 0);
  const maxIdnMa = idns.length ? Math.max(...idns) : 0;
  const raMaxOhm = maxIdnMa ? 50 / (maxIdnMa / 1000) : null;
  const raOk = tt && raMaxOhm !== null ? p.raOhm <= raMaxOhm : null;
  // Picchetto verticale: R = ρ / (2πL) · ln(4L/d), d = 20 mm (formula approssimata per terreno omogeneo).
  const L = Math.max(0.5, p.rodLengthM);
  const rodOhm = (p.soilOhmM / (2 * Math.PI * L)) * Math.log((4 * L) / 0.02);
  // Picchetti distanziati almeno due volte la lunghezza: si stima un'efficienza dell'85%.
  const rods = Math.max(1, Math.ceil(rodOhm / (0.85 * Math.max(0.1, p.raOhm))));
  const peMaxMm2 = Math.max(feederSection ? peSection(feederSection) : 0, ...lines.map((r) => (r.peSection ?? 0) * r.parallel));
  const eq = Math.min(25, Math.max(6, peMaxMm2 / 2));
  const equipotentialMm2 = EQ_SIZES.find((v) => v >= eq) ?? 25;
  const checks: Check[] = [];
  if (tt) {
    if (raMaxOhm !== null)
      checks.push({
        id: 'ra',
        label: 'Resistenza di terra',
        status: raOk ? 'ok' : 'error',
        text: `RA di progetto ${f(p.raOhm, 0)} Ω ${raOk ? '≤' : '>'} ${f(raMaxOhm, 0)} Ω = 50 V / ${maxIdnMa} mA (differenziale con la IΔn più alta).`,
        ref: 'CEI 64-8:2007 413.1.4.2, 536.3 (commento)',
      });
    checks.push({
      id: 'rods',
      label: 'Dispersore',
      status: 'info',
      text: `Un picchetto da ${f(L, 1)} m in terreno da ${f(p.soilOhmM, 0)} Ω·m dà circa ${f(rodOhm, 0)} Ω: per ${f(p.raOhm, 0)} Ω servono circa ${rods} picchetti distanziati almeno ${f(2 * L, 1)} m (stima: la RA va misurata a impianto finito).`,
    });
    checks.push({
      id: 'earth-cond',
      label: 'Conduttore di terra',
      status: 'info',
      text: 'Tra collettore e dispersore: se non protetto meccanicamente almeno 16 mm² di rame (protetto contro la corrosione) o 25 mm² di rame (non protetto contro la corrosione).',
      ref: 'CEI 64-8:2007 542.3.1, Tab. 54A',
    });
  } else {
    checks.push({ id: 'earth-cab', label: 'Impianto di terra', status: 'info', text: 'Nel TN-S il dispersore è quello della cabina, unico per media e bassa tensione: il suo dimensionamento (tensioni di passo e contatto) è parte del progetto della cabina.' });
  }
  checks.push({
    id: 'eq',
    label: 'Equipotenziale principale',
    status: 'info',
    text: `Almeno ${equipotentialMm2} mm² di rame: metà del PE più grande (${fS(peMaxMm2)} mm²), minimo 6 e non oltre 25 mm². Collega al collettore di terra tubazioni e masse estranee entranti nell'edificio.`,
    ref: 'CEI 64-8:2007 547.1.1',
  });
  return { tt, maxIdnMa, raMaxOhm, raOk, rodOhm, rods, equipotentialMm2, peMaxMm2, checks };
}

// ------------------------------------------------------------------ computo dei materiali

export interface BomRow {
  group: string;
  item: string;
  qty: number;
  unit: string;
}

const poles = (phases: 1 | 3, withNeutral = true) => (phases === 1 ? '1P+N' : withNeutral ? '4P' : '3P');

/** Elenco dei materiali principali con le quantità (senza prezzi e senza sfridi). */
export function billOfMaterials(p: Plant, r: PlantResult): BomRow[] {
  const rows = new Map<string, BomRow>();
  const put = (group: string, item: string, qty: number, unit = 'pz') => {
    const k = `${group}|${item}|${unit}`;
    const row = rows.get(k);
    if (row) row.qty += qty;
    else rows.set(k, { group, item, qty, unit });
  };
  const tri = isThreePhaseSupply(p);
  // Quadri e moduli DIN stimati
  for (const b of r.boards) {
    let modules = 0;
    if (b.id === '' && r.main.inA && !isMccb(r.main.inA)) modules += tri ? 4 : 2;
    for (const lr of b.lines) {
      if (lr.inA && !isMccb(lr.inA)) modules += lr.line.phases === 3 ? 4 : 2;
      if (!lr.line.rcdGroup && lr.line.rcdMa) modules += lr.line.phases === 3 ? 4 : 2;
    }
    for (const g of r.groups.filter((x) => x.group.boardId === b.id)) modules += g.poles;
    put('Quadri', `${b.name}: centralino o quadro per circa ${modules} moduli DIN più la riserva`, 1);
  }
  if (r.main.inA)
    put(
      'Protezioni',
      `Generale ${isMccb(r.main.inA) ? 'scatolato' : 'magnetotermico'} ${tri ? '4P' : '2P'} In ${r.main.inA} A, Icu ${r.main.icuKA ?? '—'} kA${p.mainRcdMa ? ` con differenziale ${p.mainRcdMa} mA${p.mainRcdS ? ' S' : ''}` : ''}`,
      1,
    );
  for (const lr of r.lines) {
    const l = lr.line;
    if (lr.inA)
      put('Protezioni', isMccb(lr.inA) ? `Interruttore scatolato ${poles(l.phases, l.withNeutral)} In ${lr.inA} A, Icu ${lr.icuKA ?? '—'} kA` : `Magnetotermico ${poles(l.phases, l.withNeutral)} ${l.curve}${lr.inA}, ${lr.icuKA ?? '—'} kA`, 1);
    if (!l.rcdGroup && l.rcdMa) put('Protezioni', `Differenziale ${l.phases === 3 ? '4P' : '2P'} ${l.rcdMa} mA tipo ${l.rcdType}${l.kind === 'sottoquadro' && l.rcdS ? ' S' : ''} (associato o blocco)`, 1);
    if (l.kind === 'motore') {
      const m = l.starting ?? 'diretto';
      put('Comando motori', m === 'inverter' ? 'Inverter per motore' : m === 'stella-triangolo' ? 'Avviatore stella-triangolo con relè termico' : 'Contattore con relè termico classe 10', 1);
    }
    if (lr.section) put('Cavi', `Cavo ${cableDesignation(l.phases, l.phases === 1 || l.withNeutral, lr.section)} ${l.insulation === 'EPR' ? '(isolamento EPR)' : '(isolamento PVC)'}`, Math.round(l.lengthM * lr.parallel), 'm');
  }
  for (const g of r.groups) put('Protezioni', `Differenziale puro ${g.poles}P In ${g.inA} A, ${g.group.idnMa} mA tipo ${g.group.type}${g.group.s ? ' S' : ''} («${g.group.name}»)`, 1);
  if (r.main.section) put('Cavi', `Cavo ${cableDesignation(tri ? 3 : 1, true, r.main.section)} ${p.feeder.insulation === 'EPR' ? '(isolamento EPR)' : '(isolamento PVC)'}`, Math.round(p.feeder.lengthM * r.main.parallel), 'm');
  if (p.pfcKvar) put('Rifasamento', `Batteria di rifasamento ${p.pfcKvar} kvar`, 1);
  if (p.spd !== 'nessuno') {
    put('Protezioni', `Scaricatore di sovratensione (SPD) ${tri ? '3P+N' : '1P+N'} all'origine`, 1);
    if (p.spd === 'origine-sottoquadri')
      for (const b of r.boards.filter((x) => x.feeder)) put('Protezioni', `Scaricatore di sovratensione (SPD) ${b.feeder!.line.phases === 3 ? '3P+N' : '1P+N'} nel sottoquadro`, 1);
  }
  const pts = new Map<DeviceKind, number>();
  for (const d of p.plan.devices) pts.set(d.kind, (pts.get(d.kind) ?? 0) + 1);
  for (const [k, n] of pts) put('Punti', `${DEVICE_LABEL[k]} (scatola, frutto o apparecchio)`, n);
  if (p.plan.rooms.length) put('Punti', 'Scatola di derivazione (una per locale, stima)', p.plan.rooms.length);
  if (r.earth.tt) {
    put('Terra', `Picchetto di terra da ${f(p.rodLengthM, 1)} m con pozzetto`, r.earth.rods);
    put('Terra', 'Conduttore di terra 16 mm² rame (o 25 mm² se non protetto contro la corrosione)', 1, 'tratta');
  }
  put('Terra', 'Collettore principale di terra', 1);
  put('Terra', `Conduttore equipotenziale principale ${r.earth.equipotentialMm2} mm²`, 1, 'tratta');
  if (r.lines.some((x) => x.line.bathroom)) put('Terra', 'Collegamenti equipotenziali supplementari dei bagni', r.lines.filter((x) => x.line.bathroom).length, 'locale');
  return [...rows.values()];
}

// ------------------------------------------------------------------ obbligo di progetto (DM 37/2008)

export interface DmResult {
  required: boolean;
  reasons: string[];
}

/**
 * DM 22 gennaio 2008 n. 37, art. 5 comma 2 (testo su Normattiva): casi in cui il progetto degli impianti elettrici
 * è redatto da un professionista iscritto agli albi; negli altri casi lo redige il responsabile tecnico dell'impresa
 * installatrice (art. 5 comma 1, art. 7).
 */
export function dm37(p: Plant): DmResult {
  const reasons: string[] = [];
  const kw = p.supply.kind === 'cabina' ? Infinity : p.supply.contractKW;
  if (p.use === 'condominio') reasons.push('lett. a): tutte le utenze condominiali');
  if (p.use === 'abitazione') {
    if (kw > 6) reasons.push('lett. a): unità abitativa con potenza impegnata oltre 6 kW');
    if (p.areaM2 > 400) reasons.push('lett. a): unità abitativa oltre 400 m²');
  }
  if (p.use === 'ufficio' || p.use === 'negozio' || p.use === 'industria') {
    if (p.supply.kind === 'cabina') reasons.push('lett. c): alimentazione a tensione superiore a 1000 V');
    else if (kw > 6) reasons.push('lett. c): potenza impegnata oltre 6 kW in bassa tensione');
    if (p.areaM2 > 200) reasons.push('lett. c): superficie oltre 200 m²');
  }
  if (p.special.medical) reasons.push('lett. d): locali a uso medico');
  if (p.special.explosion) reasons.push('lett. d): luoghi con pericolo di esplosione');
  if (p.special.fire) reasons.push('lett. d): ambienti a maggior rischio in caso d\'incendio');
  return { required: reasons.length > 0, reasons };
}
