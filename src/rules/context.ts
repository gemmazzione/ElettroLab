import { deviceShortCircuit, loadEndFaultCurrents } from '../engine/measure';
import { simulate } from '../engine/simulate';
import { analyzeCircuits, buildNetGraph, type CircuitInfo, type NetGraph } from '../graph/netGraph';
import { isResidualDevice, isSwitchingDevice } from '../model/terminals';
import type { CableInstall, ComponentInstance, LoadParams, NormSettings, Project, SupplyParams } from '../model/types';
import { ampacity, type AmpacityResult } from './ampacity';

export const DEFAULT_NORM: NormSettings = { residential: true, ul: 50, declaredIccKA: null, simultaneity: 1 };

/**
 * Scenario della verifica della caduta di tensione per un utilizzatore: lui a piena potenza,
 * gli altri inclusi (designOn) alla potenza nominale × fattore di contemporaneità, gli esclusi spenti.
 * Protezioni tutte chiuse, nessun guasto.
 */
export function dropScenario(project: Project, focusId: string | null, k: number): Project {
  return {
    ...project,
    components: project.components.map((c) => {
      if (c.params.kind !== 'load') return c;
      const p = c.params.p;
      const focus = c.id === focusId;
      const on = focus || p.designOn !== false;
      return { ...c, params: { kind: 'load', p: { ...p, on, powerW: focus ? p.powerW : p.powerW * k } } };
    }),
  };
}

export interface CircuitCtx {
  load: ComponentInstance;
  p: LoadParams;
  name: string;
  info: CircuitInfo;
  /** Corrente d'impiego: potenza nominale / U0 (carico resistivo, cos φ = 1) */
  ib: number;
  /** Protezione contro le sovracorrenti più vicina all'utilizzatore */
  ocp: ComponentInstance | undefined;
  /** Differenziali sul percorso della fase */
  rcds: ComponentInstance[];
  install: CableInstall | undefined;
  iz: { value: number; source: 'tabella' | 'utente'; calc: AmpacityResult | null } | null;
  /** Correnti di guasto presunte a fondo linea */
  iccEnd: { ln: number | null; lpe: number | null };
  /** Caduta di tensione di progetto origine → utilizzatore [%] (scenario: vedi dropScenario) */
  dropPct: number | null;
  /** Altri utilizzatori considerati accesi nella verifica della caduta */
  dropOthers: ComponentInstance[];
  hasSockets: boolean;
}

export interface NormCtx {
  project: Project;
  settings: NormSettings;
  graph: NetGraph;
  supply: { comp: ComponentInstance; p: SupplyParams } | null;
  earths: ComponentInstance[];
  devices: ComponentInstance[];
  /** Icc presunta L-N ai morsetti di valle dei dispositivi con polo di neutro [A] */
  deviceIcc: Map<string, number | null>;
  circuits: CircuitCtx[];
}

export function buildNormContext(project: Project): NormCtx {
  const settings = { ...DEFAULT_NORM, ...(project.norm ?? {}) };
  const graph = buildNetGraph(project);
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const supplyComp = project.components.find((c) => c.params.kind === 'supply');
  const supply = supplyComp && supplyComp.params.kind === 'supply' ? { comp: supplyComp, p: supplyComp.params.p } : null;
  const u0 = supply?.p.voltage ?? 230;

  const devices = project.components.filter((c) => isSwitchingDevice(c.params.kind));
  const deviceIcc = new Map<string, number | null>();
  for (const d of devices) deviceIcc.set(d.id, deviceShortCircuit(project, d));

  // Verifica della caduta: con k = 1 e tutti gli utilizzatori inclusi basta una sola simulazione;
  // altrimenti una per utilizzatore (lui a piena potenza, gli altri ridotti).
  const k = Math.min(1, Math.max(0.05, settings.simultaneity ?? 1));
  const loads = project.components.filter((c) => c.params.kind === 'load');
  const shared = k === 1 && loads.every((c) => c.params.kind === 'load' && c.params.p.designOn !== false);
  // Calcoli di progetto senza produzione fotovoltaica (caso peggiore: nessun sole).
  const opts = { closed: () => true, ignoreFaults: true, noGeneration: true };
  const sharedDesign = shared ? simulate(dropScenario(project, null, 1), opts) : null;
  const designFor = (id: string) => sharedDesign ?? simulate(dropScenario(project, id, k), opts);

  const circuits: CircuitCtx[] = [];
  for (const info of analyzeCircuits(project, graph)) {
    const load = byId.get(info.loadId)!;
    if (load.params.kind !== 'load') continue;
    const p = load.params.p;
    const path = info.lDevices.map((id) => byId.get(id)!).filter(Boolean);
    const ocp = [...path].reverse().find((d) => d.params.kind === 'mcb' || d.params.kind === 'rcbo' || d.params.kind === 'fuse');
    const rcds = path.filter((d) => isResidualDevice(d.params.kind));
    const install = p.install;
    let iz: CircuitCtx['iz'] = null;
    if (install?.izOverride && install.izOverride > 0) iz = { value: install.izOverride, source: 'utente', calc: null };
    else if (install) {
      const calc = ampacity(p.cableSection, install.method, install.insulation, install.ambientC, install.grouped);
      if (calc) iz = { value: calc.iz, source: 'tabella', calc };
    }
    let dropPct: number | null = null;
    const design = designFor(load.id);
    if (design.ok) {
      const r = design.loads.get(load.id);
      if (r && r.energized) {
        // Riferimento: tensione all'origine della stessa fase (media delle tre per i carichi trifase).
        const phs = design.supply.phases;
        const origin =
          info.threePhase || phs.length === 1
            ? phs.reduce((a, x) => a + x.v, 0) / phs.length
            : (phs.find((x) => x.phase === info.phases[0])?.v ?? design.supply.v);
        dropPct = ((origin - r.v) / u0) * 100;
      }
    }
    circuits.push({
      load,
      p,
      name: `${load.label} (${p.name})`,
      info,
      ib: p.powerW / (u0 * (p.phases === 3 ? 3 : 1) * (p.cosPhi ?? 1)),
      ocp,
      rcds,
      install,
      iz,
      iccEnd: info.lConnected && info.nConnected ? loadEndFaultCurrents(project, load.id) : { ln: null, lpe: null },
      dropPct,
      dropOthers: loads.filter((c) => c.id !== load.id && c.params.kind === 'load' && c.params.p.designOn !== false),
      hasSockets: p.hasSockets ?? p.category === 'prese',
    });
  }

  return {
    project,
    settings,
    graph,
    supply,
    earths: project.components.filter((c) => c.params.kind === 'earth'),
    devices,
    deviceIcc,
    circuits,
  };
}
