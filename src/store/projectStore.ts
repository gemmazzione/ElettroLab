import { create } from 'zustand';
import { checkWiring, type Issue } from '../graph/erc';
import { simulate, type SimResult } from '../engine/simulate';
import { catalogItem } from '../model/catalog';
import { DEFAULT_COLOR_FOR } from '../model/constants';
import { createComponent, createWire, emptyProject, inferConductor } from '../model/factory';
import { MODULE_W, nextPanelOrigin, PANEL_GAP, panelSize, positionToRail, railToPosition } from '../model/geometry';
import { buildComb } from '../model/comb';
import { canPlace, nearestFreeSlot, panelFits, panelOf } from '../model/placement';
import { getTerminals, parseTerminalId } from '../model/terminals';
import { DEFAULT_NORM } from '../rules/context';
import { buildCtx, evaluate, loadProgress, saveProgress, type Progress } from '../academy/evaluate';
import { exerciseById } from '../academy/exercises';
import type { Evaluation } from '../academy/types';
import type { ComponentInstance, ComponentParams, FaultType, NormSettings, Conductor, PanelConfig, Project, RailPlacement, Wire, WireSection, XY } from '../model/types';
import { loadCurrent, saveCurrent } from '../persistence/storage';
import { FAULT_INFO } from '../model/faults';
import { newId } from '../model/factory';
import { advance, type ProtState, type StepOutput } from '../protection/stepper';
import { getPoles, terminalId } from '../model/terminals';
import { abs, sub } from '../engine/complex';
import { DEMO_PROJECTS } from '../projects/demos';

export type Selection = { type: 'component'; id: string } | { type: 'wire'; id: string } | null;

export interface SimEvent {
  id: number;
  /** Tempo simulato [s] */
  t: number;
  level: 'info' | 'attenzione' | 'errore';
  text: string;
}

export interface Toast {
  id: number;
  level: 'info' | 'errore';
  text: string;
}

export type RightTab = 'props' | 'checks' | 'norm' | 'info' | 'exercise';
export type AppMode = 'lab' | 'academy';

export interface ActiveExercise {
  id: string;
  answers: Record<string, string>;
  evaluation: Evaluation | null;
}
export type Tool = 'select' | 'multimeter' | 'clamp';
export type MeterMode = 'V' | 'R' | 'continuity';
export type ClampTarget = { kind: 'wire' | 'line'; id: string } | null;

export interface WirePreset {
  conductor: Conductor | 'auto';
  section: WireSection;
  length: number;
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection;
  showLabels: boolean;
  /** Mostra sezione e lunghezza dei conduttori sulle etichette */
  showLengths: boolean;
  setShowLengths: (v: boolean) => void;
  wiringMode: boolean;
  wirePreset: WirePreset;
  running: boolean;
  simTime: number;
  result: SimResult | null;
  events: SimEvent[];
  issues: Issue[];
  toasts: Toast[];
  lastSavedAt: string | null;
  rightTab: RightTab;
  setRightTab: (t: RightTab) => void;
  /** Articolo di catalogo di cui mostrare la scheda informativa */
  infoItem: string | null;
  setInfoItem: (id: string | null) => void;
  setNorm: (patch: Partial<NormSettings>) => void;
  /** Stato delle protezioni (memoria termica, interventi) */
  prot: ProtState;
  /** Fattore di accelerazione del tempo simulato */
  speed: number;
  tool: Tool;
  meterMode: MeterMode;
  probes: { red?: string; black?: string };
  clampTarget: ClampTarget;
  setSpeed: (v: number) => void;
  setTool: (t: Tool) => void;
  setMeterMode: (m: MeterMode) => void;
  probe: (terminalId: string) => void;
  clearProbes: () => void;
  setClampTarget: (t: ClampTarget) => void;
  toggleFault: (type: FaultType, targetId: string) => void;
  setFaultResistance: (faultId: string, r: number) => void;
  setFaultPower: (faultId: string, w: number) => void;
  clearFaults: () => void;
  testRcd: (id: string) => void;
  /** Sostituisce le cartucce fuse di un portafusibili (solo a portafusibili aperto) */
  replaceFuse: (id: string) => void;
  setLoadNeutral: (id: string, withNeutral: boolean) => void;
  /** Bobine dei relè eccitate nell'ultimo stato calcolato (per riconoscere il fronte dell'impulso) */
  coil: Record<string, boolean>;
  /** Preme un pulsante per un breve impulso */
  pressButton: (id: string) => void;
  mode: AppMode;
  setMode: (m: AppMode) => void;
  /** Vista dell'area centrale: quadro fisico o schema unifilare */
  view: 'quadro' | 'schema';
  setView: (v: 'quadro' | 'schema') => void;
  exercise: ActiveExercise | null;
  progress: Record<string, Progress>;
  startExercise: (id: string) => void;
  setAnswer: (taskId: string, value: string) => void;
  verifyExercise: () => void;
  retryExercise: () => void;
  exitExercise: () => void;

  commit: (mutate: (p: Project) => void, history?: boolean) => void;
  undo: () => void;
  redo: () => void;
  newProject: () => void;
  openProject: (p: Project) => void;
  addComponent: (catalogId: string, at?: XY) => string | null;
  moveComponent: (id: string, pos: XY) => boolean;
  removeSelection: () => void;
  removeComponent: (id: string) => void;
  removeWire: (id: string) => void;
  /** Inserisce un pettine di collegamento a partire dalla posizione indicata sulla guida */
  addComb: (catalogId: string, at: RailPlacement) => boolean;
  toggleComponent: (id: string) => void;
  toggleLoad: (id: string) => void;
  updateParams: (id: string, params: ComponentParams) => void;
  renameComponent: (id: string, label: string) => void;
  connect: (from: string, to: string) => boolean;
  updateWire: (id: string, patch: Partial<Wire>) => void;
  setPanel: (panelId: string, config: PanelConfig) => boolean;
  addPanel: () => string;
  renamePanel: (panelId: string, name: string) => void;
  removePanel: (panelId: string) => void;
  renameProject: (name: string) => void;
  select: (s: Selection) => void;
  setShowLabels: (v: boolean) => void;
  setWiringMode: (v: boolean) => void;
  setWirePreset: (p: Partial<WirePreset>) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  tick: (dt: number) => void;
  log: (level: SimEvent['level'], text: string, t?: number) => void;
  toast: (level: Toast['level'], text: string) => void;
  dismissToast: (id: number) => void;
  markSaved: () => void;
}

const HISTORY_LIMIT = 100;

/** Riallinea i quadri affiancati (dopo un ridimensionamento) e aggiorna la posizione dei dispositivi. */
function relayoutPanels(p: Project) {
  let x = p.panels[0]?.origin.x ?? 0;
  const y = p.panels[0]?.origin.y ?? 0;
  for (const panel of p.panels) {
    panel.origin = { x, y };
    x += panelSize(panel).w + PANEL_GAP;
  }
  for (const c of p.components) if (c.rail) c.position = railToPosition(c.rail, panelOf(p, c.rail.panelId));
}
let eventSeq = 0;
let toastSeq = 0;

function initialProject(): Project {
  return loadCurrent() ?? DEMO_PROJECTS[0]!.build();
}

const alertKey = (a: { code: string; componentIds: string[] }) => `${a.code}:${a.componentIds.join(',')}`;

export const useStore = create<State>((set, get) => {
  /** Ricalcola verifiche e (se attiva) simulazione dopo ogni modifica. Gli allarmi si registrano in settle(). */
  const recompute = (project: Project, running: boolean) => {
    const issues = checkWiring(project);
    if (!running) return { issues, result: null as SimResult | null };
    return { issues, result: simulate(project) };
  };

  /** Applica l'esito di un avanzamento temporale: interventi, eventi e nuovi allarmi. */
  const applyStep = (out: StepOutput) => {
    const { simTime, result: prev, project } = get();
    for (const e of out.events) get().log(e.level, e.text, simTime + e.at);
    const t1 = simTime + out.elapsed;
    if (out.tripped && out.result.ok) {
      const before = new Set(prev && prev.ok ? prev.alerts.map(alertKey) : []);
      for (const a of out.result.alerts) if (!before.has(alertKey(a))) get().log(a.severity, a.message, t1);
    }
    if (out.tripped) saveCurrent(out.project);
    set({
      project: out.tripped ? out.project : project,
      prot: out.prot,
      result: out.result,
      simTime: t1,
    });
  };

  /**
   * Dopo una modifica a impianto alimentato: gestisce subito gli interventi "istantanei" (entro 0,5 s)
   * e solo dopo registra gli allarmi dello stato risultante, confrontandoli con lo stato stabile precedente.
   * Così i sintomi dei pochi millisecondi che precedono un intervento magnetico o differenziale
   * (tensioni anomale durante il cortocircuito) non vengono riportati come condizioni permanenti.
   */
  const settle = (stableBefore: SimResult | null) => {
    const s = get();
    if (!s.running || !s.result) return;
    if (!s.result.ok) {
      if (!stableBefore || stableBefore.ok) get().log('errore', s.result.reason);
      return;
    }
    const out = advance(s.project, s.prot, s.result, 0.5, 'settle');
    for (const e of out.events) get().log(e.level, e.text, s.simTime + e.at);
    const t1 = s.simTime + out.elapsed;
    if (out.result.ok) {
      const before = new Set(stableBefore && stableBefore.ok ? stableBefore.alerts.map(alertKey) : []);
      for (const a of out.result.alerts) if (!before.has(alertKey(a))) get().log(a.severity, a.message, t1);
    }
    if (out.tripped) saveCurrent(out.project);
    set({ project: out.tripped ? out.project : s.project, prot: out.prot, result: out.result, simTime: t1 });
  };

  /**
   * Relè passo-passo: un impulso (fronte di salita della tensione sulla bobina oltre l'80% della
   * tensione nominale) fa cambiare stato al contatto. Ripete finché lo stato è stabile.
   */
  let relayBusy = false;
  const processRelays = () => {
    if (relayBusy) return;
    relayBusy = true;
    try {
      for (let iter = 0; iter < 5; iter++) {
        const s = get();
        if (!s.running || !s.result || !s.result.ok) return;
        const res = s.result;
        const next = { ...s.coil };
        const pulses: ComponentInstance[] = [];
        for (const c of s.project.components) {
          if (c.params.kind !== 'relay') continue;
          const va = res.terminalV.get(`${c.id}:A1`);
          const vb = res.terminalV.get(`${c.id}:A2`);
          const on = !!va && !!vb && abs(sub(va, vb)) >= 0.8 * c.params.p.coilV;
          if (on && !s.coil[c.id]) pulses.push(c);
          next[c.id] = on;
        }
        set({ coil: next });
        if (!pulses.length) return;
        for (const c of pulses) get().log('info', `${c.label}: impulso sulla bobina → contatto ${c.closed ? 'aperto' : 'chiuso'}`);
        const ids = new Set(pulses.map((c) => c.id));
        get().commit((p) => {
          for (const c of p.components) if (ids.has(c.id)) c.closed = !c.closed;
        }, false);
      }
    } finally {
      relayBusy = false;
    }
  };

  const first = initialProject();

  return {
    project: first,
    past: [],
    future: [],
    selection: null,
    showLabels: true,
    showLengths: false,
    wiringMode: false,
    wirePreset: { conductor: 'auto', section: 2.5, length: 0.25 },
    running: false,
    simTime: 0,
    result: null,
    events: [],
    issues: checkWiring(first),
    toasts: [],
    lastSavedAt: null,
    rightTab: 'props',
    setRightTab: (t) => set({ rightTab: t }),
    infoItem: null,
    setInfoItem: (id) => set({ infoItem: id }),
    setNorm: (patch) =>
      get().commit((p) => {
        p.norm = { ...DEFAULT_NORM, ...(p.norm ?? {}), ...patch };
      }),
    prot: {},
    speed: 1,
    tool: 'select',
    meterMode: 'V',
    probes: {},
    clampTarget: null,

    setSpeed: (v) => set({ speed: v }),
    setTool: (t) => set({ tool: t, probes: {}, clampTarget: null, wiringMode: false }),
    setMeterMode: (m) => set({ meterMode: m }),
    probe: (tid) => {
      const { red, black } = get().probes;
      if (!red) set({ probes: { red: tid } });
      else if (!black && tid !== red) set({ probes: { red, black: tid } });
      else set({ probes: { red: tid } });
    },
    clearProbes: () => set({ probes: {} }),
    setClampTarget: (t) => set({ clampTarget: t }),

    toggleFault: (type, targetId) => {
      const { project } = get();
      const existing = (project.faults ?? []).find((f) => f.type === type && f.targetId === targetId && !f.hidden);
      const target =
        project.components.find((c) => c.id === targetId)?.label ??
        (project.wires.some((w) => w.id === targetId) ? 'conduttore' : targetId);
      get().log(existing ? 'info' : 'attenzione', `${existing ? 'Guasto rimosso' : 'Guasto inserito'}: ${FAULT_INFO[type].label} su ${target}`);
      get().commit((p) => {
        if (existing) p.faults = (p.faults ?? []).filter((f) => f.id !== existing.id);
        else
          p.faults = [
            ...(p.faults ?? []),
            {
              id: newId('f'),
              type,
              targetId,
              resistance: FAULT_INFO[type].defaultResistance,
              ...(FAULT_INFO[type].power ? { powerW: FAULT_INFO[type].defaultPowerW ?? 2000 } : {}),
            },
          ];
      });
    },

    setFaultResistance: (faultId, r) =>
      get().commit((p) => {
        const f = (p.faults ?? []).find((x) => x.id === faultId);
        if (f) f.resistance = r;
      }),

    setFaultPower: (faultId, w) =>
      get().commit((p) => {
        const f = (p.faults ?? []).find((x) => x.id === faultId);
        if (f) f.powerW = w;
      }),

    clearFaults: () => {
      get().log('info', 'Tutti i guasti sono stati rimossi.');
      get().commit((p) => {
        p.faults = (p.faults ?? []).filter((f) => f.hidden);
      });
    },

    mode: 'lab',
    setMode: (m) => set({ mode: m }),
    view: 'quadro',
    setView: (v) => set({ view: v }),
    exercise: null,
    progress: loadProgress(),
    startExercise: (id) => {
      const ex = exerciseById(id);
      if (!ex) return;
      get().openProject(ex.build());
      set({ exercise: { id, answers: {}, evaluation: null }, mode: 'lab', rightTab: 'exercise', tool: 'select', speed: 1 });
    },
    setAnswer: (taskId, value) => {
      const e = get().exercise;
      if (e) set({ exercise: { ...e, answers: { ...e.answers, [taskId]: value } } });
    },
    verifyExercise: () => {
      const s = get();
      const e = s.exercise;
      const ex = e ? exerciseById(e.id) : undefined;
      if (!e || !ex) return;
      const evaluation = evaluate(ex, buildCtx(s), e.answers);
      set({ exercise: { ...e, evaluation }, progress: saveProgress(e.id, evaluation.score) });
    },
    retryExercise: () => {
      const e = get().exercise;
      const ex = e ? exerciseById(e.id) : undefined;
      if (!e || !ex) return;
      get().openProject(ex.build());
      set({ exercise: { id: e.id, answers: {}, evaluation: null }, rightTab: 'exercise' });
    },
    exitExercise: () => set({ exercise: null, mode: 'academy', rightTab: 'props' }),

    coil: {},
    pressButton: (id) => {
      const c = get().project.components.find((x) => x.id === id);
      if (!c || c.params.kind !== 'button') return;
      if (!get().running) {
        get().toast('info', 'Avvia la simulazione: senza tensione il pulsante non invia nessun impulso.');
        return;
      }
      get().log('info', `${c.label} (${c.params.p.name}) premuto`);
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id);
        if (t) t.closed = true;
      }, false);
      setTimeout(() => {
        if (!get().project.components.some((x) => x.id === id)) return;
        get().commit((p) => {
          const t = p.components.find((x) => x.id === id);
          if (t) t.closed = false;
        }, false);
      }, 350);
    },

    setLoadNeutral: (id, withNeutral) =>
      get().commit((p) => {
        const c = p.components.find((x) => x.id === id);
        if (!c || c.params.kind !== 'load') return;
        c.params.p.withNeutral = withNeutral;
        if (!withNeutral) p.wires = p.wires.filter((w) => w.from !== `${id}:N` && w.to !== `${id}:N`);
      }),

    replaceFuse: (id) => {
      const c = get().project.components.find((x) => x.id === id);
      if (!c || c.params.kind !== 'fuse') return;
      if (!c.blown?.length) {
        get().toast('info', `${c.label}: nessuna cartuccia fusa da sostituire.`);
        return;
      }
      if (c.closed) {
        get().toast('errore', `Apri prima ${c.label}: la cartuccia si sostituisce con il portafusibili aperto (circuito sezionato).`);
        return;
      }
      const st = get().prot[id];
      if (st) set({ prot: { ...get().prot, [id]: { ...st, melt: [] } } });
      const n = c.blown.length;
      get().log('info', `${c.label}: ${n === 1 ? 'sostituita la cartuccia' : `sostituite ${n} cartucce`} gG ${c.params.p.in} A. Prima di richiudere elimina la causa della fusione.`);
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id);
        if (t) delete t.blown;
      });
    },

    testRcd: (id) => {
      const { project, result, running } = get();
      const c = project.components.find((x) => x.id === id);
      if (!c || (c.params.kind !== 'rcd' && c.params.kind !== 'rcbo')) return;
      const poles = getPoles(c);
      const l = poles.find((p) => p.fn === 'L');
      const n = poles.find((p) => p.fn === 'N');
      const vl = result && result.ok && l ? result.terminalV.get(terminalId(c.id, l.inKey)) : null;
      const vn = result && result.ok && n ? result.terminalV.get(terminalId(c.id, n.inKey)) : null;
      if (!running || !c.closed || !vl || !vn || abs(sub(vl, vn)) < 100) {
        get().toast('errore', `Il pulsante di prova di ${c.label} funziona solo con il dispositivo chiuso e alimentato.`);
        return;
      }
      get().log(
        'info',
        `Pulsante di prova "T" di ${c.label}: il dispositivo interviene. La prova verifica il meccanismo di sgancio, non l'efficacia della protezione dell'impianto (serve la misura strumentale).`,
      );
      set({ prot: { ...get().prot, [id]: { ...(get().prot[id] ?? { heat: 0 }), tripped: 'prova' } } });
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id)!;
        t.closed = false;
      }, false);
    },

    commit: (mutate, history = true) => {
      const { project, past, result, running } = get();
      const next = structuredClone(project);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      saveCurrent(next);
      set({
        project: next,
        past: history ? [...past.slice(-HISTORY_LIMIT + 1), project] : past,
        future: history ? [] : get().future,
        ...recompute(next, running),
      });
      settle(result);
      processRelays();
    },

    undo: () => {
      const { past, project, future, result, running } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      saveCurrent(prev);
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future], ...recompute(prev, running) });
      settle(result);
    },

    redo: () => {
      const { past, project, future, result, running } = get();
      const next = future[0];
      if (!next) return;
      saveCurrent(next);
      set({ project: next, past: [...past, project], future: future.slice(1), ...recompute(next, running) });
      settle(result);
    },

    newProject: () => get().openProject(emptyProject()),

    openProject: (p) => {
      saveCurrent(p);
      set({
        project: p,
        past: [],
        future: [],
        selection: null,
        running: false,
        simTime: 0,
        result: null,
        events: [],
        prot: {},
        probes: {},
        clampTarget: null,
        exercise: null,
        issues: checkWiring(p),
      });
    },

    addComponent: (catalogId, at) => {
      const item = catalogItem(catalogId);
      const { project } = get();
      if (item.kind === 'comb') {
        // Il punto di rilascio indica il dispositivo su cui agganciare il primo dente.
        const sel = get().selection;
        const selected = sel?.type === 'component' ? project.components.find((c) => c.id === sel.id) : undefined;
        const rail = at ? positionToRail({ x: at.x - MODULE_W / 2, y: at.y }, project.panels) : selected?.rail;
        if (!rail) {
          get().toast('info', `${item.name}: trascinalo sul primo dispositivo della fila, oppure seleziona il dispositivo e fai doppio clic.`);
          return null;
        }
        get().addComb(catalogId, rail);
        return null;
      }
      if (!item.defaults) {
        get().toast('errore', `${item.name}: ${item.unavailableReason}`);
        return null;
      }
      if (item.singleton && project.components.some((c) => c.catalogId === catalogId || c.params.kind === item.kind)) {
        get().toast('errore', `È ammessa una sola "${item.name}" per progetto.`);
        return null;
      }
      let comp: ComponentInstance;
      if (item.mount === 'din') {
        const desired = at ? positionToRail(at, project.panels) : { row: 0, slot: 0 };
        const rail = nearestFreeSlot(project, item.modules, desired);
        if (!rail) {
          get().toast('errore', `Spazio insufficiente sulle guide DIN per ${item.name} (${item.modules} moduli).`);
          return null;
        }
        comp = createComponent(project, catalogId, { rail });
      } else {
        comp = createComponent(project, catalogId, { position: at ?? { x: -260, y: 200 } });
      }
      get().commit((p) => p.components.push(comp));
      set({ selection: { type: 'component', id: comp.id } });
      return comp.id;
    },

    moveComponent: (id, pos) => {
      const { project } = get();
      const c = project.components.find((x) => x.id === id);
      if (!c) return false;
      const item = catalogItem(c.catalogId);
      if (item.mount === 'free') {
        get().commit((p) => {
          const t = p.components.find((x) => x.id === id)!;
          t.position = { x: Math.round(pos.x / 4) * 4, y: Math.round(pos.y / 4) * 4 };
        });
        return true;
      }
      const target = positionToRail({ x: pos.x + 0.001, y: pos.y }, project.panels);
      if (!canPlace(project, item.modules, target, id)) {
        get().toast('errore', 'Posizione occupata o fuori dalla guida: il dispositivo torna al suo posto.');
        // forza il ri-render alla posizione precedente
        set({ project: { ...project } });
        return false;
      }
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id)!;
        t.rail = target;
        t.position = railToPosition(target, panelOf(p, target.panelId));
      });
      return true;
    },

    removeSelection: () => {
      const s = get().selection;
      if (!s) return;
      if (s.type === 'component') get().removeComponent(s.id);
      else get().removeWire(s.id);
    },

    removeComponent: (id) => {
      get().commit((p) => {
        p.components = p.components.filter((c) => c.id !== id);
        const removed = new Set(p.wires.filter((w) => parseTerminalId(w.from).componentId === id || parseTerminalId(w.to).componentId === id).map((w) => w.id));
        p.wires = p.wires.filter((w) => !removed.has(w.id));
        p.faults = (p.faults ?? []).filter((f) => f.targetId !== id && !removed.has(f.targetId));
      });
      set({ selection: null });
    },

    removeWire: (id) => {
      // Un tratto di pettine non si toglie da solo: si rimuove l'intera barra.
      const combId = get().project.wires.find((w) => w.id === id)?.comb?.id;
      const gone = new Set(get().project.wires.filter((w) => w.id === id || (combId && w.comb?.id === combId)).map((w) => w.id));
      get().commit((p) => {
        p.wires = p.wires.filter((w) => !gone.has(w.id));
        p.faults = (p.faults ?? []).filter((f) => !gone.has(f.targetId));
      });
      set({ selection: null });
    },

    addComb: (catalogId, at) => {
      const item = catalogItem(catalogId);
      if (item.kind !== 'comb' || !item.combType) return false;
      const { project } = get();
      const r = buildComb(project, item.combType, at);
      if (!r.ok) {
        get().toast('errore', `${item.name}: ${r.reason}`);
        return false;
      }
      const taken = r.wires.find((w) => project.wires.some((x) => x.comb && (x.from === w.from || x.to === w.from || x.from === w.to || x.to === w.to) && x.comb.pin === w.comb!.pin));
      if (taken) {
        get().toast('errore', `${item.name}: questi morsetti hanno già un pettine.`);
        return false;
      }
      get().commit((p) => p.wires.push(...r.wires));
      set({ selection: { type: 'wire', id: r.wires[0]!.id } });
      get().log('info', `${item.name} inserito su ${r.devices.map((d) => d.label).join(', ')} (${r.devices.length} dispositivi).`);
      return true;
    },

    toggleComponent: (id) => {
      const c = get().project.components.find((x) => x.id === id);
      if (!c) return;
      if (!c.closed && get().prot[id]?.tripped) {
        const rest = { ...get().prot[id]! };
        delete rest.tripped;
        set({ prot: { ...get().prot, [id]: rest } });
      }
      get().log('info', `${c.label} ${c.closed ? 'aperto (manovra manuale)' : 'chiuso (manovra manuale)'}`);
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id)!;
        t.closed = !t.closed;
      });
    },

    toggleLoad: (id) => {
      const c = get().project.components.find((x) => x.id === id);
      if (!c || c.params.kind !== 'load') return;
      const on = !c.params.p.on;
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id)!;
        if (t.params.kind === 'load') t.params.p.on = on;
      });
      get().log('info', `${c.label} (${c.params.p.name}) ${on ? 'acceso' : 'spento'}`);
    },

    updateParams: (id, params) =>
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id);
        if (t) t.params = params;
      }),

    renameComponent: (id, label) =>
      get().commit((p) => {
        const t = p.components.find((x) => x.id === id);
        if (t) t.label = label;
      }),

    connect: (from, to) => {
      const { project, wirePreset } = get();
      if (from === to) return false;
      if (project.wires.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) {
        get().toast('errore', 'Questi due morsetti sono già collegati.');
        return false;
      }
      const valid = (tid: string) => {
        const { componentId } = parseTerminalId(tid);
        const c = project.components.find((x) => x.id === componentId);
        return !!c && getTerminals(c).some((t) => t.id === tid);
      };
      if (!valid(from) || !valid(to)) return false;
      const conductor = wirePreset.conductor === 'auto' ? inferConductor(project, from, to) : wirePreset.conductor;
      const w = createWire(project, from, to, {
        conductor,
        color: DEFAULT_COLOR_FOR[conductor],
        section: wirePreset.section,
        length: wirePreset.length,
      });
      get().commit((p) => p.wires.push(w));
      set({ selection: { type: 'wire', id: w.id } });
      return true;
    },

    updateWire: (id, patch) =>
      get().commit((p) => {
        const w = p.wires.find((x) => x.id === id);
        if (w) Object.assign(w, patch);
      }),

    setPanel: (panelId, config) => {
      const err = panelFits(get().project, panelId, config);
      if (err) {
        get().toast('errore', `Impossibile ridimensionare il quadro: ${err}`);
        return false;
      }
      get().commit((p) => {
        const panel = p.panels.find((x) => x.id === panelId);
        if (!panel) return;
        panel.modulesPerRow = config.modulesPerRow;
        panel.rows = config.rows;
        relayoutPanels(p);
      });
      return true;
    },

    addPanel: () => {
      const { project } = get();
      let n = project.panels.length + 1;
      while (project.panels.some((x) => x.id === `P${n}`)) n += 1;
      const id = `P${n}`;
      get().commit((p) => {
        p.panels.push({ id, name: `Sottoquadro ${p.panels.length}`, origin: nextPanelOrigin(p.panels), modulesPerRow: 12, rows: 1 });
      });
      get().toast('info', 'Quadro aggiunto a destra. Collegalo con una linea in partenza da un dispositivo del quadro generale.');
      return id;
    },

    renamePanel: (panelId, name) =>
      get().commit((p) => {
        const panel = p.panels.find((x) => x.id === panelId);
        if (panel) panel.name = name;
      }),

    removePanel: (panelId) => {
      const { project } = get();
      if (project.panels.length <= 1) return;
      if (project.panels[0]!.id === panelId) {
        get().toast('errore', 'Il quadro generale non può essere eliminato.');
        return;
      }
      if (project.components.some((c) => c.rail && panelOf(project, c.rail.panelId).id === panelId)) {
        get().toast('errore', 'Il quadro contiene dei dispositivi: eliminali o spostali prima di rimuoverlo.');
        return;
      }
      get().commit((p) => {
        p.panels = p.panels.filter((x) => x.id !== panelId);
        relayoutPanels(p);
      });
    },

    renameProject: (name) => get().commit((p) => (p.name = name), false),

    select: (s) => set({ selection: s }),
    setShowLabels: (v) => set({ showLabels: v }),
    setShowLengths: (v) => set({ showLengths: v }),
    setWiringMode: (v) => set({ wiringMode: v }),
    setWirePreset: (patch) => set({ wirePreset: { ...get().wirePreset, ...patch } }),

    startSimulation: () => {
      const { project } = get();
      set({ running: true, simTime: 0, events: [], prot: {} });
      get().log('info', 'Simulazione avviata: rete di distribuzione in tensione al punto di consegna.');
      set({ result: simulate(project), coil: {} });
      settle(null);
      processRelays();
    },

    stopSimulation: () => {
      get().log('info', 'Simulazione interrotta: impianto disalimentato.');
      set({ running: false, result: null });
    },

    tick: (dt) => {
      const s = get();
      if (!s.running) return;
      if (!s.result || !s.result.ok) {
        set({ simTime: s.simTime + dt * s.speed });
        return;
      }
      applyStep(advance(s.project, s.prot, s.result, dt * s.speed, 'step'));
    },

    log: (level, text, t) => {
      if (!get().running) return;
      eventSeq += 1;
      set({ events: [...get().events.slice(-299), { id: eventSeq, t: t ?? get().simTime, level, text }] });
    },

    toast: (level, text) => {
      toastSeq += 1;
      const id = toastSeq;
      set({ toasts: [...get().toasts, { id, level, text }] });
      setTimeout(() => get().dismissToast(id), 4500);
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    markSaved: () => set({ lastSavedAt: new Date().toISOString() }),
  };
});
