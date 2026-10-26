import { lineWireIds } from '../model/lineWires';
import { UnionFind } from '../graph/unionFind';
import { CONTACT_RESISTANCE, LOAD_RATED_VOLTAGE, MIN_FAULT_RESISTANCE, MIN_WIRE_LENGTH, RHO_CU_70 } from '../model/constants';
import { getPoles, getTerminals, loadHasNeutral, loadPhaseKeys, supplyPhaseKeys, terminalId } from '../model/terminals';
import type { ComponentInstance, Phase, Project } from '../model/types';
import { C, polar, type Complex } from './complex';

/** Centro stella del trasformatore di cabina: riferimento dei potenziali. */
export const NODE_STAR = '§STAR';
/** Terra di riferimento ("terra lontana"). */
export const NODE_EARTH = '§EARTH';

export type ElementTag =
  | { t: 'wire'; wireId: string }
  | { t: 'contact'; componentId: string; pole: number }
  | { t: 'load'; componentId: string; key: string }
  | { t: 'cable'; componentId: string; conductor: LineKey }
  | { t: 'source-L'; componentId: string; phase: Phase }
  | { t: 'source-N'; componentId: string }
  | { t: 'rb'; componentId: string }
  | { t: 'ra'; componentId: string }
  | { t: 'fault'; faultId: string }
  | { t: 'extra'; index: number }
  | { t: 'coil'; componentId: string };

/**
 * Elemento a due morsetti: impedenza z in serie a una f.e.m. (con il "+" verso a).
 * La corrente interna da a verso b vale I_ab = (Va − Vb − emf) / z.
 */
export interface NetElement {
  a: string;
  b: string;
  z: Complex;
  emf?: Complex;
  tag: ElementTag;
}

export interface Netlist {
  elements: NetElement[];
  /** Nodo elettrico di ciascun morsetto */
  terminalNode: Map<string, string>;
  supplyId: string | null;
}

/** Ramo aggiuntivo tra due punti (morsetti "<comp>:<key>" o nodi interni "<comp>#L"). */
export interface ExtraBranch {
  a: string;
  b: string;
  r: number;
}

export interface NetlistOptions {
  /** Rami aggiuntivi (es. cortocircuito di prova per il calcolo dell'Icc) */
  extra?: ExtraBranch[];
  /** Stato forzato dei contatti (default: stato del progetto) */
  closed?: (c: ComponentInstance) => boolean;
  /** Spegne tutti gli utilizzatori */
  loadsOff?: boolean;
  /** Esclude la rete del distributore (impianto disalimentato e scollegato) */
  noSource?: boolean;
  /** Ignora i guasti del progetto */
  ignoreFaults?: boolean;
  /** Esclude la produzione degli inverter fotovoltaici (calcoli di progetto: caso senza sole) */
  noGeneration?: boolean;
}

/**
 * Impedenza costante di un ramo di carico: potenza attiva P alla tensione nominale con fattore
 * di potenza cos φ (ohmico-induttivo): |Z| = U² · cos φ / P, Z = |Z| (cos φ + j sin φ).
 */
/** Resistenza di collegamento dei conduttori che rappresentano la linea di un utilizzatore [Ω] (trascurabile, come un serraggio). */
export const LINE_LINK_RESISTANCE = 1e-3;

export function loadBranchImpedance(powerW: number, cosPhi: number): Complex {
  const pf = Math.min(1, Math.max(0.1, cosPhi));
  const zMag = (LOAD_RATED_VOLTAGE * LOAD_RATED_VOLTAGE * pf) / powerW;
  return C(zMag * pf, zMag * Math.sqrt(1 - pf * pf));
}

/** Bobina di un relè passo-passo a 230 V: assorbimento tipico durante l'impulso (valore indicativo). */
export const COIL_POWER_W = 4;
export const COIL_COS_PHI = 0.5;

export function wireResistance(length: number, section: number): number {
  return (RHO_CU_70 * Math.max(length, MIN_WIRE_LENGTH)) / section;
}

export type LineKey = 'L' | 'L1' | 'L2' | 'L3' | 'N' | 'PE';
export const innerNode = (loadId: string, k: LineKey) => `${loadId}#${k}`;
/** Centro stella interno di un utilizzatore trifase senza neutro */
export const starNode = (loadId: string) => `${loadId}#S`;
export const PHASE_ANGLE: Record<Phase, number> = { 1: 0, 2: -120, 3: 120 };

/**
 * Costruisce la netlist elettrica dal progetto.
 * Morsettiere: tutti i morsetti coincidono in un unico nodo (connessione equipotenziale).
 * Conduttori, contatti chiusi, carichi, cavi e guasti: rami a impedenza finita.
 */
export function buildNetlist(project: Project, opts: NetlistOptions = {}): Netlist {
  const uf = new UnionFind();
  const elements: NetElement[] = [];
  let supplyId: string | null = null;
  const faults = opts.ignoreFaults ? [] : (project.faults ?? []);
  const loadFaults = (id: string) => faults.filter((f) => f.targetId === id);
  const brokenWires = new Set(faults.filter((f) => f.type === 'open-wire').map((f) => f.targetId));

  for (const c of project.components) {
    const terms = getTerminals(c);
    for (const t of terms) uf.find(t.id);
    if (c.params.kind === 'bar') {
      for (let i = 1; i < terms.length; i++) uf.union(terms[0]!.id, terms[i]!.id);
    }
  }

  const node = (tid: string) => uf.find(tid);
  const terminalNode = new Map<string, string>();
  for (const c of project.components) for (const t of getTerminals(c)) terminalNode.set(t.id, node(t.id));
  const resolve = (p: string) => terminalNode.get(p) ?? p;

  // I conduttori collegati a un utilizzatore sono la sua linea, già modellata con i parametri dell'utilizzatore.
  const lineWires = lineWireIds(project);
  for (const w of project.wires) {
    if (!terminalNode.has(w.from) || !terminalNode.has(w.to) || brokenWires.has(w.id)) continue;
    elements.push({
      a: node(w.from),
      b: node(w.to),
      z: C(lineWires.has(w.id) ? LINE_LINK_RESISTANCE : wireResistance(w.length, w.section)),
      tag: { t: 'wire', wireId: w.id },
    });
  }

  for (const c of project.components) {
    const pr = c.params;
    const tid = (k: string) => node(terminalId(c.id, k));
    switch (pr.kind) {
      case 'supply': {
        if (supplyId || opts.noSource) break; // una sola fornitura
        supplyId = c.id;
        const zHalf = C(pr.p.rNetwork / 2, pr.p.xNetwork / 2);
        for (const { key, phase } of supplyPhaseKeys(c)) {
          elements.push({
            a: tid(key),
            b: NODE_STAR,
            z: zHalf,
            emf: polar(pr.p.voltage, PHASE_ANGLE[phase]),
            tag: { t: 'source-L', componentId: c.id, phase },
          });
        }
        elements.push({ a: tid('N'), b: NODE_STAR, z: zHalf, tag: { t: 'source-N', componentId: c.id } });
        elements.push({ a: NODE_STAR, b: NODE_EARTH, z: C(Math.max(pr.p.rb, 1e-3)), tag: { t: 'rb', componentId: c.id } });
        break;
      }
      case 'earth':
        elements.push({ a: tid('PE'), b: NODE_EARTH, z: C(Math.max(pr.p.ra, 1e-3)), tag: { t: 'ra', componentId: c.id } });
        break;
      case 'button':
        // Contatto momentaneo: chiuso solo mentre il pulsante è premuto (mai forzato dalle opzioni).
        if (c.closed) elements.push({ a: tid('in'), b: tid('out'), z: C(CONTACT_RESISTANCE), tag: { t: 'contact', componentId: c.id, pole: 0 } });
        break;
      case 'relay':
        // Bobina sempre presente tra A1 e A2: impedenza costante dai dati tipici di assorbimento.
        elements.push({ a: tid('A1'), b: tid('A2'), z: loadBranchImpedance(COIL_POWER_W, COIL_COS_PHI), tag: { t: 'coil', componentId: c.id } });
        if (!(opts.closed ? opts.closed(c) : c.closed)) break;
        for (const p of getPoles(c)) {
          elements.push({ a: tid(p.inKey), b: tid(p.outKey), z: C(CONTACT_RESISTANCE), tag: { t: 'contact', componentId: c.id, pole: p.index } });
        }
        break;
      case 'meter':
        // Misuratore: contatti sempre chiusi (non è un dispositivo di manovra).
        for (const p of getPoles(c)) {
          elements.push({ a: tid(p.inKey), b: tid(p.outKey), z: C(CONTACT_RESISTANCE), tag: { t: 'contact', componentId: c.id, pole: p.index } });
        }
        break;
      case 'switch':
      case 'mcb':
      case 'fuse':
      case 'rcd':
      case 'rcbo':
        if (!(opts.closed ? opts.closed(c) : c.closed)) break;
        for (const p of getPoles(c)) {
          // Cartuccia fusa: il polo resta aperto anche a portafusibili chiuso.
          if (c.blown?.includes(p.index)) continue;
          elements.push({
            a: tid(p.inKey),
            b: tid(p.outKey),
            z: C(CONTACT_RESISTANCE),
            tag: { t: 'contact', componentId: c.id, pole: p.index },
          });
        }
        break;
      case 'load': {
        const rc = wireResistance(pr.p.cableLength, pr.p.cableSection);
        const fs = loadFaults(c.id);
        const phaseKeys = loadPhaseKeys(c);
        const main = phaseKeys[0]!;
        const hasN = loadHasNeutral(c);
        const open = new Set(fs.filter((f) => f.type.startsWith('open-')).map((f) => f.type.slice(5)));
        const conductors: LineKey[] = [...phaseKeys, ...(hasN ? (['N'] as const) : []), 'PE'];
        for (const k of conductors) {
          const isOpen = k === main ? open.has('L') : open.has(k);
          if (isOpen) continue;
          elements.push({ a: tid(k), b: innerNode(c.id, k), z: C(rc), tag: { t: 'cable', componentId: c.id, conductor: k } });
        }
        if (pr.p.on && pr.p.powerW > 0 && !opts.loadsOff) {
          // Potenza di targa riferita alla tensione nominale degli apparecchi (230 V fase-neutro).
          // Trifase a stella: ogni ramo assorbe P/3 sotto 230 V.
          const z = loadBranchImpedance(pr.p.powerW / phaseKeys.length, pr.p.cosPhi ?? 1);
          const star = hasN ? innerNode(c.id, 'N') : starNode(c.id);
          for (const k of phaseKeys) {
            elements.push({ a: innerNode(c.id, k), b: star, z, tag: { t: 'load', componentId: c.id, key: k } });
          }
        }
        for (const f of fs) {
          const rf = C(Math.max(f.resistance, MIN_FAULT_RESISTANCE));
          const tag: ElementTag = { t: 'fault', faultId: f.id };
          if (f.type === 'overload' && (f.powerW ?? 0) > 0) {
            // Carico resistivo aggiuntivo alla tensione nominale, ripartito sui rami della stella.
            const per = (f.powerW ?? 0) / phaseKeys.length;
            const star = hasN ? innerNode(c.id, 'N') : starNode(c.id);
            for (const k of phaseKeys) elements.push({ a: innerNode(c.id, k), b: star, z: C((LOAD_RATED_VOLTAGE * LOAD_RATED_VOLTAGE) / per), tag });
          }
          if (f.type === 'short-LN' && hasN) elements.push({ a: innerNode(c.id, main), b: innerNode(c.id, 'N'), z: rf, tag });
          if (f.type === 'short-LL' && phaseKeys.length === 3) elements.push({ a: innerNode(c.id, 'L1'), b: innerNode(c.id, 'L2'), z: rf, tag });
          if (f.type === 'L-PE') elements.push({ a: innerNode(c.id, main), b: innerNode(c.id, 'PE'), z: rf, tag });
          if (f.type === 'L-earth') elements.push({ a: innerNode(c.id, main), b: NODE_EARTH, z: rf, tag });
        }
        break;
      }
      case 'bar':
        break;
    }
  }

  (opts.extra ?? []).forEach((x, index) => {
    elements.push({ a: resolve(x.a), b: resolve(x.b), z: C(Math.max(x.r, MIN_FAULT_RESISTANCE)), tag: { t: 'extra', index } });
  });

  return { elements, terminalNode, supplyId };
}
