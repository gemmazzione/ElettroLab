import { cabinImpedance } from '../model/cabin';
import { RHO_CU_70 } from '../model/constants';
import type { WireSection } from '../model/types';
import { ampacity, type AmpacityResult } from '../rules/ampacity';
import { isThreePhaseSupply, type Curve, type Plant, type PlantLine } from './model';

/**
 * Dimensionamento dell'impianto come lo imposta un progettista: bilancio delle potenze, corrente d'impiego,
 * scelta della protezione e della sezione, caduta di tensione, correnti di cortocircuito, conduttore di protezione,
 * contatti indiretti. Calcolo semplificato per lo studio:
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
/** Soglia magnetica superiore (intervento sicuro) in multipli di In: CEI EN 60898-1; scatolati Im = 10·In ± 20%. */
const MAG_HI: Record<Curve, number> = { B: 5, C: 10, D: 20 };
const MAG_LO: Record<Curve, number> = { B: 3, C: 5, D: 10 };
const MCCB_HI = 12;
const MCCB_LO = 8;

export const f = (v: number, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fA = (a: number) => (a >= 1000 ? `${f(a / 1000, 2)} kA` : `${f(a, a >= 100 ? 0 : 1)} A`);

export type Status = 'ok' | 'warn' | 'error';

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
  const z = U0 / icc;
  if (p.supply.kind === 'bt-mono') {
    // Icc dichiarata fase-neutro: l'impedenza è quella dell'anello.
    const h = z / Math.SQRT2;
    return { phase: { r: h / 2, x: h / 2 }, loop: { r: h, x: h }, iccMaxA: icc };
  }
  const h = z / Math.SQRT2;
  return { phase: { r: h, x: h }, loop: { r: 2 * h, x: 2 * h }, iccMaxA: icc };
}

/** Corrente d'impiego [A] di una potenza attiva [W]. */
export function currentOf(powerW: number, phases: 1 | 3, cosPhi: number): number {
  const c = Math.max(0.1, Math.min(1, cosPhi));
  return phases === 3 ? powerW / (Math.sqrt(3) * UN * c) : powerW / (U0 * c);
}

/** Caduta di tensione percentuale lungo una linea. */
export function dropPct(ibA: number, lengthM: number, s: number, phases: 1 | 3, cosPhi: number): number {
  const c = Math.max(0.1, Math.min(1, cosPhi));
  const sin = Math.sqrt(1 - c * c);
  const r = RHO_CU_70 / s;
  const k = phases === 3 ? Math.sqrt(3) : 2;
  const un = phases === 3 ? UN : U0;
  return ((k * ibA * lengthM * (r * c + X_PER_M * sin)) / un) * 100;
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

/** Designazione del cavo multipolare: anime e sezione (G = con giallo-verde). */
export function cableDesignation(phases: 1 | 3, withNeutral: boolean, s: WireSection): string {
  const cores = phases === 1 ? 3 : withNeutral ? 5 : 4;
  return `${cores}G${f(s, s % 1 ? 1 : 0)}`;
}

// ------------------------------------------------------------------ bilancio delle potenze

export interface Balance {
  installedW: number;
  /** Potenza assorbita = Σ P·ku */
  absorbedW: number;
  /** Potenza contemporanea sul quadro generale = kc · Σ P·ku */
  simultaneousW: number;
  reactiveVar: number;
  cosPhi: number;
  /** Corrente per fase con la contemporaneità [A] (in monofase un solo valore) */
  phaseA: number[];
  /** Corrente d'impiego del quadro generale [A] */
  ibA: number;
  /** Squilibrio tra le fasi: (max − min) / max */
  unbalance: number;
  /** Fase assegnata a ogni linea monofase (fornitura trifase) */
  phaseOf: Map<string, 1 | 2 | 3>;
}

export function lineIb(l: PlantLine): number {
  return currentOf(l.powerW * l.ku, l.phases, l.cosPhi);
}

export function balance(p: Plant): Balance {
  const tri = isThreePhaseSupply(p);
  let installedW = 0;
  let absorbedW = 0;
  let q = 0;
  for (const l of p.lines) {
    installedW += l.powerW;
    absorbedW += l.powerW * l.ku;
    const c = Math.max(0.1, Math.min(1, l.cosPhi));
    q += l.powerW * l.ku * Math.tan(Math.acos(c));
  }
  const simultaneousW = absorbedW * p.kc;
  const reactiveVar = q * p.kc;
  const cosPhi = simultaneousW > 0 ? simultaneousW / Math.hypot(simultaneousW, reactiveVar) : 1;
  const phaseOf = new Map<string, 1 | 2 | 3>();
  if (!tri) {
    const sum = p.lines.reduce((a, l) => a + lineIb(l), 0) * p.kc;
    return { installedW, absorbedW, simultaneousW, reactiveVar, cosPhi, phaseA: [sum], ibA: sum, unbalance: 0, phaseOf };
  }
  const ph = [0, 0, 0];
  for (const l of p.lines) if (l.phases === 3) for (let i = 0; i < 3; i++) ph[i] = ph[i]! + lineIb(l);
  for (const l of p.lines) {
    if (l.phases === 1 && l.phase) {
      ph[l.phase - 1] = ph[l.phase - 1]! + lineIb(l);
      phaseOf.set(l.id, l.phase);
    }
  }
  // Linee monofase senza fase scelta: dalla più carica, sulla fase meno carica.
  const auto = p.lines.filter((l) => l.phases === 1 && !l.phase).sort((a, b) => lineIb(b) - lineIb(a));
  for (const l of auto) {
    const i = ph.indexOf(Math.min(...ph));
    ph[i] = ph[i]! + lineIb(l);
    phaseOf.set(l.id, (i + 1) as 1 | 2 | 3);
  }
  const phaseA = ph.map((v) => v * p.kc);
  const max = Math.max(...phaseA);
  const min = Math.min(...phaseA);
  return { installedW, absorbedW, simultaneousW, reactiveVar, cosPhi, phaseA, ibA: max, unbalance: max > 0 ? (max - min) / max : 0, phaseOf };
}

// ------------------------------------------------------------------ quadro generale e linea di alimentazione

export interface MainResult {
  ibA: number;
  inA: number | null;
  icuKA: number | null;
  iccMaxA: number;
  section: WireSection | null;
  iz: AmpacityResult | null;
  dropPct: number;
  /** Impedenza fino al quadro generale (anello fase-neutro / fase-PE) */
  loop: Z;
  phase: Z;
  checks: Check[];
  status: Status;
}

const worst = (cs: Check[]): Status => (cs.some((c) => c.status === 'error') ? 'error' : cs.some((c) => c.status === 'warn') ? 'warn' : 'ok');

export function mainBoard(p: Plant, b: Balance, src = sourceImpedance(p)): MainResult {
  const tri = isThreePhaseSupply(p);
  const phases: 1 | 3 = tri ? 3 : 1;
  const ib = b.ibA;
  const inA = pickIn(Math.max(ib, 6));
  const checks: Check[] = [];
  let section: WireSection | null = p.feeder.sectionOverride ?? null;
  let iz: AmpacityResult | null = null;
  const izOf = (s: WireSection) => ampacity(s, p.feeder.method, p.feeder.insulation, 30, 1, tri ? 3 : 2);
  if (!section && inA) section = SECTIONS.find((s) => (izOf(s)?.iz ?? 0) >= inA && s >= 6) ?? null;
  if (section) iz = izOf(section);
  const drop = section ? dropPct(ib, p.feeder.lengthM, section, phases, b.cosPhi) : 0;
  const fz = section ? cond(p.feeder.lengthM, section) : { r: 0, x: 0 };
  const loop = add(src.loop, fz, section ? cond(p.feeder.lengthM, p.earthing === 'TN-S' ? peSection(section) : section) : { r: 0, x: 0 });
  const phase = add(src.phase, fz);
  const icuKA = inA ? pickIcu(src.iccMaxA, isMccb(inA)) : null;

  if (!inA) checks.push({ id: 'in', label: 'Interruttore generale', status: 'error', text: `Corrente d'impiego ${fA(ib)} oltre la gamma degli interruttori considerati.` });
  else
    checks.push({
      id: 'in',
      label: 'Interruttore generale',
      status: 'ok',
      text: `Ib = ${fA(ib)} → generale ${isMccb(inA) ? 'scatolato' : 'modulare'} da ${inA} A, potere di interruzione ≥ ${fA(src.iccMaxA)}: ${icuKA ? `${f(icuKA, icuKA % 1 ? 1 : 0)} kA` : 'oltre la gamma'}.`,
      ref: 'CEI 64-8:2007 434.3.1',
    });
  if (inA && section && iz) {
    const ok = iz.iz >= inA;
    checks.push({
      id: 'feeder',
      label: 'Linea di alimentazione del quadro',
      status: ok ? 'ok' : 'error',
      text: `${cableDesignation(phases, true, section)} da ${f(p.feeder.lengthM, 0)} m: Iz = ${fA(iz.iz)} ${ok ? '≥' : '<'} In = ${inA} A; caduta ${f(drop, 2)}%.`,
      ref: 'CEI 64-8:2007 433.2',
    });
  } else if (inA) checks.push({ id: 'feeder', label: 'Linea di alimentazione del quadro', status: 'error', text: 'Nessuna sezione fino a 240 mm² ha la portata richiesta: servono più cavi in parallelo o un\'altra posa.' });

  if (p.supply.kind !== 'cabina') {
    const kw = b.simultaneousW / 1000;
    const limit = p.supply.contractKW * 1.1;
    checks.push({
      id: 'contract',
      label: 'Potenza impegnata',
      status: kw > limit ? 'warn' : 'ok',
      text:
        kw > limit
          ? `Potenza contemporanea ${f(kw, 1)} kW oltre i ${f(limit, 1)} kW prelevabili con ${f(p.supply.contractKW, 1)} kW impegnati: il limitatore del contatore può aprire. Aumenta la potenza impegnata o riduci la contemporaneità.`
          : `Potenza contemporanea ${f(kw, 1)} kW entro i ${f(limit, 1)} kW prelevabili (impegnata + 10%).`,
    });
    if (!tri && kw > 10) checks.push({ id: 'phases', label: 'Fornitura', status: 'warn', text: 'Oltre 10 kW le forniture sono di norma trifase: chiedi al distributore.' });
    if (kw > 100) checks.push({ id: 'mt', label: 'Fornitura', status: 'warn', text: 'Oltre 100 kW la connessione ordinaria è in media tensione (CEI 0-16): valuta una cabina.' });
  } else {
    const kva = b.simultaneousW / Math.max(0.5, b.cosPhi) / 1000;
    const load = kva / p.supply.kva;
    checks.push({
      id: 'trafo',
      label: 'Carico del trasformatore',
      status: load > 1 ? 'error' : load > 0.85 ? 'warn' : 'ok',
      text: `${f(kva, 0)} kVA contemporanei su ${p.supply.kva} kVA (${f(load * 100, 0)}%).${load > 0.85 ? ' Poco margine per ampliamenti: valuta la taglia superiore.' : ''}`,
    });
  }
  if (tri && b.unbalance > 0.3 && b.ibA > 10)
    checks.push({ id: 'unbalance', label: 'Equilibrio delle fasi', status: 'warn', text: `Squilibrio del ${f(b.unbalance * 100, 0)}% tra le fasi: sposta qualche linea monofase sulla fase meno carica.` });
  if (b.cosPhi < 0.9 && b.simultaneousW > 16500)
    checks.push({ id: 'pf', label: 'Fattore di potenza', status: 'warn', text: `cos φ medio ${f(b.cosPhi, 2)}: sotto 0,95 la bolletta conteggia l'energia reattiva. Valuta un rifasamento (regole ARERA in revisione).` });
  return { ibA: ib, inA, icuKA, iccMaxA: src.iccMaxA, section, iz, dropPct: drop, loop, phase, checks, status: worst(checks) };
}

// ------------------------------------------------------------------ linee

export interface LineResult {
  line: PlantLine;
  phase: 1 | 2 | 3 | null;
  ibA: number;
  inA: number | null;
  icuKA: number | null;
  section: WireSection | null;
  peSection: WireSection | null;
  iz: AmpacityResult | null;
  dropLinePct: number;
  dropTotPct: number;
  /** Corrente di cortocircuito minima a fondo linea [A] (fase-neutro, fase-PE nel TN-S, fase-fase senza neutro) */
  iccMinA: number | null;
  /** Corrente di guasto a massa a fondo linea (TN-S) [A] */
  faultA: number | null;
  designation: string;
  checks: Check[];
  status: Status;
}

/** Sezione minima ammessa dal progetto: 1,5 mm² (Tab. 52E) per luce, 2,5 mm² per gli altri circuiti (buona pratica). */
export const minSection = (l: PlantLine): WireSection => (l.kind === 'luce' ? 1.5 : 2.5);

/** Taglia minima della protezione: 10 A per la luce, 16 A per le prese (come le prese da 16 A), 10 A per gli altri. */
export const minIn = (l: PlantLine): number => (l.kind === 'prese' && l.phases === 1 ? 16 : 10);

export function lineResult(p: Plant, l: PlantLine, main: MainResult, b: Balance): LineResult {
  const tri = l.phases === 3;
  const ib = lineIb(l);
  const inA = l.inOverride ?? pickIn(Math.max(ib, minIn(l)));
  const loaded: 2 | 3 = tri ? 3 : 2;
  const izOf = (s: WireSection) => ampacity(s, l.method, l.insulation, l.ambientC, l.grouped, loaded);
  const tn = p.earthing === 'TN-S';
  const shortAt = (s: WireSection) => {
    const lineZ = cond(l.lengthM, s);
    if (tn) return U0 / mag(add(main.loop, lineZ, cond(l.lengthM, peSection(s))));
    if (tri && !l.withNeutral) return UN / mag(add(main.phase, main.phase, lineZ, lineZ));
    return U0 / mag(add(main.loop, lineZ, lineZ));
  };
  const dropOf = (s: WireSection) => dropPct(ib, l.lengthM, s, l.phases, l.cosPhi);
  // Con un differenziale il guasto a massa non serve a far intervenire il magnetico: nel TN senza differenziale sì.
  const faultNeedsMagnetic = tn && !l.rcdMa;
  const fits = (s: WireSection) => {
    const iz = izOf(s);
    if (!iz || !inA) return false;
    if (iz.iz < inA) return false;
    if (main.dropPct + dropOf(s) > p.maxDropPct) return false;
    if (faultNeedsMagnetic && shortAt(s) < magHi(inA, l.curve)) return false;
    return true;
  };
  const section = l.sectionOverride ?? SECTIONS.filter((s) => s >= minSection(l)).find(fits) ?? null;
  const iz = section ? izOf(section) : null;
  const pe = section ? peSection(section) : null;
  const dropLine = section ? dropOf(section) : 0;
  const dropTot = main.dropPct + dropLine;
  const iccMin = section ? shortAt(section) : null;
  const faultA = tn && section ? iccMin : null;
  const icuKA = inA ? pickIcu(main.iccMaxA, isMccb(inA)) : null;
  const checks: Check[] = [];

  if (!inA) {
    checks.push({ id: 'in', label: 'Protezione', status: 'error', text: `Ib = ${fA(ib)} oltre la gamma degli interruttori considerati.` });
  }
  if (!section) {
    checks.push({
      id: 'section',
      label: 'Sezione',
      status: 'error',
      text: `Nessuna sezione fino a 240 mm² soddisfa portata, caduta di tensione${faultNeedsMagnetic ? ' e guasto a massa' : ''}: accorcia la linea, cambia posa o dividi il carico.`,
    });
  }
  if (inA && section && iz) {
    const ok = ib <= inA && inA <= iz.iz;
    checks.push({
      id: '433',
      label: 'Sovraccarico',
      status: ok ? 'ok' : 'error',
      text: `Ib ${fA(ib)} ${ib <= inA ? '≤' : '>'} In ${inA} A ${inA <= iz.iz ? '≤' : '>'} Iz ${fA(iz.iz)} (I0 ${fA(iz.i0)} · k1 ${f(iz.k1, 2)} · k2 ${f(iz.k2, 2)}). If ≤ 1,45·Iz è garantita ${isMccb(inA) ? 'dall\'interruttore (If = 1,3·Ir)' : 'dai magnetotermici (If = 1,45·In)'}.`,
      ref: 'CEI 64-8:2007 433.2',
    });
    if (section < 1.5) checks.push({ id: '52E', label: 'Sezione minima', status: 'error', text: 'Sotto 1,5 mm² per i circuiti di potenza in cavo.', ref: 'CEI 64-8:2007 524.1, Tab. 52E' });
  }
  if (inA && icuKA !== null) {
    checks.push({
      id: '434',
      label: 'Cortocircuito',
      status: 'ok',
      text: `Potere di interruzione ${f(icuKA, icuKA % 1 ? 1 : 0)} kA ≥ Icc presunta ${fA(main.iccMaxA)}: con la protezione dal sovraccarico assicura anche quella dal cortocircuito (per gli interruttori che non limitano la corrente va verificato I²t ≤ K²S² sui dati del costruttore).`,
      ref: 'CEI 64-8:2007 434.3.1, 435.1',
    });
  } else if (inA) checks.push({ id: '434', label: 'Cortocircuito', status: 'error', text: `Icc presunta ${fA(main.iccMaxA)} oltre il potere di interruzione degli interruttori considerati.`, ref: 'CEI 64-8:2007 434.3.1' });
  if (section) {
    const ok = dropTot <= p.maxDropPct;
    checks.push({
      id: '525',
      label: 'Caduta di tensione',
      status: ok ? 'ok' : 'warn',
      text: `${f(dropLine, 2)}% sulla linea + ${f(main.dropPct, 2)}% a monte = ${f(dropTot, 2)}% ${ok ? '≤' : '>'} ${f(p.maxDropPct, 1)}%.`,
      ref: 'CEI 64-8:2007 525 (raccomandazione 4%)',
    });
    checks.push({
      id: '54F',
      label: 'Conduttore di protezione',
      status: 'ok',
      text: `PE ≥ ${f(pe!, pe! % 1 ? 1 : 0)} mm² con fase da ${f(section, section % 1 ? 1 : 0)} mm²${pe !== section ? ' (con un cavo multipolare il PE ha di solito la stessa sezione)' : ''}.`,
      ref: 'CEI 64-8:2007 543.1.2, Tab. 54F',
    });
  }
  // Contatti indiretti
  if (!tn) {
    if (!l.rcdMa) checks.push({ id: '413', label: 'Contatti indiretti (TT)', status: 'error', text: 'Nel sistema TT serve un differenziale: senza, un guasto a massa può lasciare tensioni pericolose.', ref: 'CEI 64-8:2007 413.1.4.2' });
    else {
      const ut = (p.raOhm * l.rcdMa) / 1000;
      checks.push({
        id: '413',
        label: 'Contatti indiretti (TT)',
        status: ut <= 50 ? 'ok' : 'error',
        text: `RA · IΔn = ${f(p.raOhm, 0)} Ω × ${f(l.rcdMa / 1000, 3)} A = ${f(ut, 1)} V ${ut <= 50 ? '≤' : '>'} 50 V.`,
        ref: 'CEI 64-8:2007 413.1.4.2',
      });
    }
  } else if (section && inA && faultA !== null) {
    if (l.rcdMa) {
      const ia = l.rcdMa / 1000;
      checks.push({ id: '413', label: 'Contatti indiretti (TN)', status: 'ok', text: `Guasto a massa ${fA(faultA)} ≫ IΔn ${f(ia, 3)} A: interviene il differenziale.`, ref: 'CEI 64-8:2007 413.1.3.3' });
    } else {
      const ia = magHi(inA, l.curve);
      const t = inA <= 32 ? '0,4 s' : '5 s';
      const ok = faultA >= ia;
      checks.push({
        id: '413',
        label: 'Contatti indiretti (TN)',
        status: ok ? 'ok' : 'error',
        text: `Guasto a massa ${fA(faultA)} ${ok ? '≥' : '<'} Ia ${fA(ia)} (soglia magnetica): interruzione entro ${t}${ok ? '' : ' non garantita: aumenta la sezione o aggiungi un differenziale'}.`,
        ref: 'CEI 64-8:2007 413.1.3.3, Tab. 41A',
      });
    }
  }
  if (l.kind === 'motore' && inA) {
    const ia = ib / Math.max(0.1, l.ku) * 6;
    const ok = magLo(inA, l.curve) > ia;
    checks.push({
      id: 'start',
      label: 'Avviamento del motore',
      status: ok ? 'ok' : 'warn',
      text: ok
        ? `Spunto stimato ${fA(ia)} (avviamento diretto, circa 6 volte la corrente nominale) sotto la soglia magnetica minima ${fA(magLo(inA, l.curve))}.`
        : `Spunto stimato ${fA(ia)} oltre la soglia magnetica minima ${fA(magLo(inA, l.curve))}: rischio di scatto all'avviamento. Usa la curva D, un salvamotore o un avviamento stella-triangolo/inverter.`,
    });
  }
  if (l.kind === 'ricarica')
    checks.push({ id: 'evse', label: 'Ricarica auto', status: 'ok', text: 'Linea dedicata con differenziale proprio: tipo A con rilevamento della corrente continua nella wallbox, altrimenti tipo B.' });
  if (l.kind === 'prese' && inA && inA > 16 && l.phases === 1)
    checks.push({ id: 'socket', label: 'Prese', status: 'warn', text: `Le prese domestiche sono da 10/16 A: con una protezione da ${inA} A la presa non è protetta dal sovraccarico.` });

  const phase = l.phases === 1 && isThreePhaseSupply(p) ? (b.phaseOf.get(l.id) ?? null) : null;
  return {
    line: l,
    phase,
    ibA: ib,
    inA,
    icuKA,
    section,
    peSection: pe,
    iz,
    dropLinePct: dropLine,
    dropTotPct: dropTot,
    iccMinA: iccMin,
    faultA,
    designation: section ? cableDesignation(l.phases, l.phases === 1 || l.withNeutral, section) : '—',
    checks,
    status: worst(checks),
  };
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

// ------------------------------------------------------------------ risultato completo

export interface PlantResult {
  balance: Balance;
  source: Source;
  main: MainResult;
  lines: LineResult[];
  dm: DmResult;
  errors: number;
  warnings: number;
}

export function computePlant(p: Plant): PlantResult {
  const b = balance(p);
  const src = sourceImpedance(p);
  const main = mainBoard(p, b, src);
  const lines = p.lines.map((l) => lineResult(p, l, main, b));
  const all = [...main.checks, ...lines.flatMap((r) => r.checks)];
  return {
    balance: b,
    source: src,
    main,
    lines,
    dm: dm37(p),
    errors: all.filter((c) => c.status === 'error').length,
    warnings: all.filter((c) => c.status === 'warn').length,
  };
}
