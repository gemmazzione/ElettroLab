import { createComponent, createWire, emptyProject } from '../model/factory';
import { nextPanelOrigin } from '../model/geometry';
import type { ComponentInstance, Project, RailPlacement, WireSection, XY } from '../model/types';

export interface DemoProject {
  id: string;
  name: string;
  summary: string;
  build: () => Project;
}

/** Aiutante per costruire progetti da codice (demo e test). */
export class ProjectBuilder {
  readonly project: Project;
  constructor(name: string, rows = 2, modulesPerRow = 12) {
    this.project = emptyProject(name, { modulesPerRow, rows });
  }

  add(catalogId: string, where: { rail: RailPlacement } | { position: XY }, patch?: (c: ComponentInstance) => void): ComponentInstance {
    const c = createComponent(this.project, catalogId, where);
    patch?.(c);
    this.project.components.push(c);
    return c;
  }

  /** Aggiunge un quadro a destra di quelli esistenti e ne restituisce l'identificativo. */
  addPanel(name: string, modulesPerRow = 12, rows = 1): string {
    const id = `P${this.project.panels.length + 1}`;
    this.project.panels.push({ id, name, origin: nextPanelOrigin(this.project.panels), modulesPerRow, rows });
    return id;
  }

  wire(from: string, to: string, section: WireSection = 2.5, length = 0.25): this {
    this.project.wires.push(createWire(this.project, from, to, { section, length }));
    return this;
  }
}

export const t = (c: ComponentInstance, key: string) => `${c.id}:${key}`;

/** Posa tipica: conduttori unipolari PVC in tubo incassato in muratura, 30 °C, 3 circuiti nella stessa canalizzazione. */
export const POSA = { method: 'B1' as const, insulation: 'PVC' as const, ambientC: 30, grouped: 3 };

export function monolocale(): Project {
  const b = new ProjectBuilder('Monolocale 3 kW', 2, 12);
  b.project.description =
    'Monolocale con fornitura da 3 kW. Interruttore generale magnetotermico 2P, differenziale 30 mA tipo A a protezione di tre circuiti: illuminazione, prese e cucina. ' +
    'Per alimentare l\'impianto avvia la simulazione e chiudi l\'interruttore generale Q1 cliccando sulla sua leva.';

  const cnt = b.add('supply-mono', { position: { x: -270, y: 40 } });
  const earth = b.add('earth', { position: { x: -250, y: 430 } });
  const q1 = b.add('mcb-2p', { rail: { row: 0, slot: 0 } }, (c) => {
    if (c.params.kind === 'mcb') c.params.p = { ...c.params.p, in: 16, curve: 'C', icn: 6 };
    c.label = 'Q1';
  });
  const q2 = b.add('rcd-2p', { rail: { row: 0, slot: 3 } }, (c) => (c.closed = true));
  const q3 = b.add('mcb-1pn', { rail: { row: 0, slot: 6 } }, (c) => {
    if (c.params.kind === 'mcb') c.params.p.in = 10;
    c.closed = true;
  });
  const q4 = b.add('mcb-1pn', { rail: { row: 0, slot: 7 } }, (c) => (c.closed = true));
  const q5 = b.add('mcb-1pn', { rail: { row: 0, slot: 8 } }, (c) => (c.closed = true));
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 0 } });

  const u1 = b.add('load-luce', { position: { x: -10, y: 690 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, name: 'Luci', cableLength: 18, install: { ...POSA } };
  });
  const u2 = b.add('load-prese', { position: { x: 190, y: 690 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, name: 'Prese soggiorno', cableLength: 20, install: { ...POSA }, hasSockets: true, socketRating: 16 };
  });
  const u3 = b.add('load-forno', { position: { x: 390, y: 690 } }, (c) => {
    if (c.params.kind === 'load') c.params.p = { ...c.params.p, name: 'Forno', cableLength: 8, on: false, install: { ...POSA } };
  });

  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 6, 8)
    .wire(t(cnt, 'N'), t(q1, 'p1_in'), 6, 8)
    .wire(t(q1, 'p0_out'), t(q2, 'p0_in'), 6)
    .wire(t(q1, 'p1_out'), t(q2, 'p1_in'), 6)
    .wire(t(q2, 'p0_out'), t(q3, 'p0_in'), 4)
    .wire(t(q2, 'p1_out'), t(q3, 'p1_in'), 4)
    .wire(t(q3, 'p0_in'), t(q4, 'p0_in'), 4, 0.05)
    .wire(t(q3, 'p1_in'), t(q4, 'p1_in'), 4, 0.05)
    .wire(t(q4, 'p0_in'), t(q5, 'p0_in'), 4, 0.05)
    .wire(t(q4, 'p1_in'), t(q5, 'p1_in'), 4, 0.05)
    .wire(t(q3, 'p0_out'), t(u1, 'L'), 1.5, 0.4)
    .wire(t(q3, 'p1_out'), t(u1, 'N'), 1.5, 0.4)
    .wire(t(q4, 'p0_out'), t(u2, 'L'), 2.5, 0.4)
    .wire(t(q4, 'p1_out'), t(u2, 'N'), 2.5, 0.4)
    .wire(t(q5, 'p0_out'), t(u3, 'L'), 2.5, 0.4)
    .wire(t(q5, 'p1_out'), t(u3, 'N'), 2.5, 0.4)
    .wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5)
    .wire(t(xpe, 't1'), t(u1, 'PE'), 1.5, 0.5)
    .wire(t(xpe, 't2'), t(u2, 'PE'), 2.5, 0.5)
    .wire(t(xpe, 't3'), t(u3, 'PE'), 2.5, 0.5);
  return b.project;
}

// ------------------------------------------------------------------ aiutanti per i progetti più grandi

export interface LoadSpec {
  catalogId: string;
  name: string;
  powerW: number;
  section: 1.5 | 2.5 | 4 | 6;
  length: number;
  on?: boolean;
  sockets?: boolean;
  category?: 'illuminazione' | 'prese' | 'cucina' | 'scaldabagno' | 'climatizzazione' | 'generico';
}

export function addLoad(b: ProjectBuilder, spec: LoadSpec, x: number, y: number, grouped: number): ComponentInstance {
  return b.add(spec.catalogId, { position: { x, y } }, (c) => {
    if (c.params.kind !== 'load') return;
    c.params.p = {
      ...c.params.p,
      name: spec.name,
      powerW: spec.powerW,
      cableSection: spec.section,
      cableLength: spec.length,
      on: spec.on ?? true,
      install: { ...POSA, grouped },
      ...(spec.category ? { category: spec.category } : {}),
      ...(spec.sockets !== undefined ? { hasSockets: spec.sockets, socketRating: 16 } : {}),
    };
  });
}

/** Linea monofase da un dispositivo 1P+N (o RCBO) all'utilizzatore, con PE dalla morsettiera. */
export function line(b: ProjectBuilder, dev: ComponentInstance, load: ComponentInstance, pe: ComponentInstance, peWay: number, section: WireSection) {
  b.wire(t(dev, 'p0_out'), t(load, 'L'), section, 0.4)
    .wire(t(dev, 'p1_out'), t(load, 'N'), section, 0.4)
    .wire(t(pe, `t${peWay}`), t(load, 'PE'), section, 0.5);
}

/** Ponticelli fase e neutro tra gli ingressi di dispositivi affiancati. */
export function bridge(b: ProjectBuilder, devs: ComponentInstance[], section: WireSection, length = 0.06) {
  for (let i = 1; i < devs.length; i++) {
    b.wire(t(devs[i - 1]!, 'p0_in'), t(devs[i]!, 'p0_in'), section, length).wire(t(devs[i - 1]!, 'p1_in'), t(devs[i]!, 'p1_in'), section, length);
  }
}

export const setMcb = (c: ComponentInstance, inA: number, curve: 'B' | 'C' | 'D' = 'C', icn = 4.5) => {
  if (c.params.kind === 'mcb' || c.params.kind === 'rcbo') c.params.p = { ...c.params.p, in: inA, curve, icn };
};

export function appartamento(): Project {
  const b = new ProjectBuilder('Appartamento 4,5 kW', 2, 12);
  b.project.description =
    'Appartamento con fornitura da 4,5 kW e due gruppi differenziali 30 mA tipo A: il primo per luci e prese delle stanze, il secondo per la cucina e la lavatrice. ' +
    'Un guasto a terra in cucina non spegne le luci: è la suddivisione richiesta dal buon senso (CEI 64-8:2007, 314.1). Ogni gruppo ha il proprio neutro: i neutri passano attraverso i magnetotermici 1P+N del gruppo. ' +
    'Prova ad accendere forno e lavatrice insieme alle prese: la potenza supera quella disponibile.';
  const cnt = b.add('supply-mono', { position: { x: -280, y: 30 } }, (c) => {
    if (c.params.kind === 'supply') c.params.p.contractKW = 4.5;
  });
  const earth = b.add('earth', { position: { x: -260, y: 430 } });
  const q1 = b.add('mcb-2p', { rail: { row: 0, slot: 0 } }, (c) => setMcb(c, 25, 'C', 6));
  const q2 = b.add('rcd-2p', { rail: { row: 0, slot: 2 } }, (c) => (c.closed = true));
  const q3 = b.add('mcb-1pn', { rail: { row: 0, slot: 4 } }, (c) => ((c.closed = true), setMcb(c, 10)));
  const q4 = b.add('mcb-1pn', { rail: { row: 0, slot: 5 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const q5 = b.add('mcb-1pn', { rail: { row: 0, slot: 6 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const q6 = b.add('rcd-2p', { rail: { row: 0, slot: 7 } }, (c) => (c.closed = true));
  const q7 = b.add('mcb-1pn', { rail: { row: 0, slot: 9 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const q8 = b.add('mcb-1pn', { rail: { row: 0, slot: 10 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 0 } });

  const y = 700;
  const u1 = addLoad(b, { catalogId: 'load-luce', name: 'Luci', powerW: 400, section: 1.5, length: 20 }, -60, y, 3);
  const u2 = addLoad(b, { catalogId: 'load-prese', name: 'Prese zona giorno', powerW: 2000, section: 2.5, length: 22, sockets: true }, 130, y, 3);
  const u3 = addLoad(b, { catalogId: 'load-prese', name: 'Prese zona notte', powerW: 1000, section: 2.5, length: 25, sockets: true }, 320, y, 3);
  const u4 = addLoad(b, { catalogId: 'load-forno', name: 'Forno', powerW: 2200, section: 2.5, length: 10, on: false }, 510, y, 2);
  const u5 = addLoad(b, { catalogId: 'load-generico', name: 'Lavatrice', powerW: 2000, section: 2.5, length: 12, on: false, sockets: true, category: 'prese' }, 700, y, 2);

  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 6, 10).wire(t(cnt, 'N'), t(q1, 'p1_in'), 6, 10);
  b.wire(t(q1, 'p0_out'), t(q2, 'p0_in'), 6, 0.3).wire(t(q1, 'p1_out'), t(q2, 'p1_in'), 6, 0.3);
  b.wire(t(q2, 'p0_in'), t(q6, 'p0_in'), 6, 0.3).wire(t(q2, 'p1_in'), t(q6, 'p1_in'), 6, 0.3);
  b.wire(t(q2, 'p0_out'), t(q3, 'p0_in'), 4, 0.2).wire(t(q2, 'p1_out'), t(q3, 'p1_in'), 4, 0.2);
  bridge(b, [q3, q4, q5], 4);
  b.wire(t(q6, 'p0_out'), t(q7, 'p0_in'), 4, 0.2).wire(t(q6, 'p1_out'), t(q7, 'p1_in'), 4, 0.2);
  bridge(b, [q7, q8], 4);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5);
  line(b, q3, u1, xpe, 1, 1.5);
  line(b, q4, u2, xpe, 2, 2.5);
  line(b, q5, u3, xpe, 3, 2.5);
  line(b, q7, u4, xpe, 4, 2.5);
  line(b, q8, u5, xpe, 5, 2.5);
  return b.project;
}

function abitazione(): Project {
  const b = new ProjectBuilder('Abitazione 6 kW', 2, 18);
  b.project.description =
    'Abitazione con fornitura da 6 kW: generale magnetotermico 2P e un magnetotermico differenziale (RCBO) 30 mA per ogni circuito. ' +
    'Le linee protette a 16 A sono in 4 mm²: con quattro circuiti nella stessa canalizzazione un 2,5 mm² in posa B1 porterebbe solo 15,6 A (verifica 433.2 nella scheda Norma). ' +
    'Ogni circuito ha la propria protezione differenziale: un guasto a terra disalimenta solo il circuito guasto. Confronta con l\'appartamento, dove un differenziale protegge più circuiti.';
  const cnt = b.add('supply-mono', { position: { x: -280, y: 30 } }, (c) => {
    if (c.params.kind === 'supply') c.params.p.contractKW = 6;
  });
  const earth = b.add('earth', { position: { x: -260, y: 430 } });
  const q1 = b.add('mcb-2p', { rail: { row: 0, slot: 0 } }, (c) => setMcb(c, 32, 'C', 6));
  const specs: [string, LoadSpec, number][] = [
    ['rcbo', { catalogId: 'load-luce', name: 'Luci zona giorno', powerW: 500, section: 1.5, length: 25 }, 10],
    ['rcbo', { catalogId: 'load-luce', name: 'Luci zona notte', powerW: 300, section: 1.5, length: 22 }, 10],
    ['rcbo', { catalogId: 'load-prese', name: 'Prese zona giorno', powerW: 2000, section: 4, length: 25, sockets: true }, 16],
    ['rcbo', { catalogId: 'load-prese', name: 'Prese zona notte', powerW: 1500, section: 4, length: 25, sockets: true }, 16],
    ['rcbo', { catalogId: 'load-forno', name: 'Cucina', powerW: 2500, section: 4, length: 12, on: false }, 16],
    ['rcbo', { catalogId: 'load-generico', name: 'Climatizzatore', powerW: 1800, section: 4, length: 18, category: 'climatizzazione', on: false }, 16],
    ['rcbo', { catalogId: 'load-boiler', name: 'Scaldabagno', powerW: 1200, section: 4, length: 10 }, 16],
  ];
  const devs = specs.map(([, , inA], k) =>
    b.add('rcbo-1pn', { rail: { row: 0, slot: 2 + 2 * k } }, (c) => {
      c.closed = true;
      setMcb(c, inA);
    }),
  );
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 0 } });
  const loads = specs.map(([, spec], k) => addLoad(b, spec, -80 + k * 190, 700, 4));
  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 10, 12).wire(t(cnt, 'N'), t(q1, 'p1_in'), 10, 12);
  b.wire(t(q1, 'p0_out'), t(devs[0]!, 'p0_in'), 6, 0.3).wire(t(q1, 'p1_out'), t(devs[0]!, 'p1_in'), 6, 0.3);
  bridge(b, devs, 6, 0.08);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5);
  devs.forEach((d, k) => line(b, d, loads[k]!, xpe, k + 1, specs[k]![1].section));
  return b.project;
}

export function trifase(): Project {
  const b = new ProjectBuilder('Quadro trifase 400/230 V', 2, 18);
  b.project.norm = { residential: false, ul: 50 };
  b.project.description =
    'Quadro trifase con carichi monofase squilibrati (L1 3 kW, L2 1 kW, L3 300 W) e un carico trifase equilibrato da 6 kW senza neutro. ' +
    'Osserva le correnti di fase e quella di neutro nella dashboard. Poi seleziona il conduttore di neutro tra Q2 e la morsettiera XN1 e attiva «Conduttore interrotto»: ' +
    'il centro stella dei carichi monofase si sposta e il carico più piccolo riceve una tensione molto superiore a 230 V (diagramma fasoriale).';
  const cnt = b.add('supply-tri', { position: { x: -280, y: 20 } });
  const earth = b.add('earth', { position: { x: -260, y: 440 } });
  const q1 = b.add('mcb-3pn', { rail: { row: 0, slot: 0 } }, (c) => setMcb(c, 32, 'C', 10));
  const q2 = b.add('rcd-4p', { rail: { row: 0, slot: 4 } }, (c) => (c.closed = true));
  const q3 = b.add('mcb-1pn', { rail: { row: 0, slot: 9 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const q4 = b.add('mcb-1pn', { rail: { row: 0, slot: 10 } }, (c) => ((c.closed = true), setMcb(c, 10)));
  const q5 = b.add('mcb-1pn', { rail: { row: 0, slot: 11 } }, (c) => ((c.closed = true), setMcb(c, 10)));
  const q6 = b.add('mcb-3p', { rail: { row: 0, slot: 13 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const xn = b.add('bar-n-8', { rail: { row: 1, slot: 0 } });
  const xpe = b.add('bar-pe-8', { rail: { row: 1, slot: 5 } });

  const y = 700;
  const u1 = addLoad(b, { catalogId: 'load-forno', name: 'Forno (L1)', powerW: 3000, section: 4, length: 15 }, -60, y, 4);
  const u2 = addLoad(b, { catalogId: 'load-luce', name: 'Luci (L2)', powerW: 1000, section: 1.5, length: 20 }, 130, y, 4);
  const u3 = addLoad(b, { catalogId: 'load-generico', name: 'Piccoli carichi (L3)', powerW: 300, section: 1.5, length: 18 }, 320, y, 4);
  const u4 = addLoad(b, { catalogId: 'load-tri', name: 'Riscaldatore trifase', powerW: 6000, section: 4, length: 20 }, 520, y, 4);

  ['L1', 'L2', 'L3'].forEach((k, i) => b.wire(t(cnt, k), t(q1, `p${i}_in`), 10, 15));
  b.wire(t(cnt, 'N'), t(q1, 'p3_in'), 10, 15);
  for (let i = 0; i < 4; i++) b.wire(t(q1, `p${i}_out`), t(q2, `p${i}_in`), 10, 0.3);
  b.wire(t(q2, 'p3_out'), t(xn, 't0'), 10, 0.4);
  // un carico monofase per fase: L dal differenziale, N dalla morsettiera
  [q3, q4, q5].forEach((q, i) => {
    b.wire(t(q2, `p${i}_out`), t(q, 'p0_in'), 4, 0.3).wire(t(xn, `t${i + 1}`), t(q, 'p1_in'), 4, 0.4);
  });
  for (let i = 0; i < 3; i++) b.wire(t(q2, `p${i}_out`), t(q6, `p${i}_in`), 4, 0.4);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 10, 5);
  line(b, q3, u1, xpe, 1, 4);
  line(b, q4, u2, xpe, 2, 1.5);
  line(b, q5, u3, xpe, 3, 1.5);
  for (let i = 0; i < 3; i++) b.wire(t(q6, `p${i}_out`), t(u4, `L${i + 1}`), 4, 0.4);
  b.wire(t(xpe, 't4'), t(u4, 'PE'), 4, 0.5);
  return b.project;
}

export function villetta(): Project {
  const b = new ProjectBuilder('Villetta con sottoquadro', 2, 12);
  b.project.panels[0]!.name = 'Quadro generale';
  b.project.description =
    'Villetta da 6 kW con quadro generale e un sottoquadro nella taverna, a 25 m. Dal quadro generale parte la linea Q5 (2P C20) che alimenta il sottoquadro: lì un interruttore-sezionatore generale e un differenziale 30 mA proteggono luci e prese della taverna. ' +
    'Il PE arriva al sottoquadro da una morsettiera all\'altra. Osserva nello schema unifilare dove inizia il sottoquadro e confronta la Icc presunta dei dispositivi a monte e a valle della linea. ' +
    'La linea tra i quadri è un conduttore con la sua resistenza: le verifiche di dimensionamento riguardano le linee terminali verso gli utilizzatori.';
  const cnt = b.add('supply-mono', { position: { x: -280, y: 30 } }, (c) => {
    if (c.params.kind === 'supply') c.params.p.contractKW = 6;
  });
  const earth = b.add('earth', { position: { x: -260, y: 430 } });
  const q1 = b.add('mcb-2p', { rail: { row: 0, slot: 0 } }, (c) => ((c.closed = true), setMcb(c, 32, 'C', 6)));
  const q2 = b.add('rcd-2p', { rail: { row: 0, slot: 2 } }, (c) => (c.closed = true));
  const q3 = b.add('mcb-1pn', { rail: { row: 0, slot: 4 } }, (c) => ((c.closed = true), setMcb(c, 10)));
  const q4 = b.add('mcb-1pn', { rail: { row: 0, slot: 5 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const q5 = b.add('mcb-2p', { rail: { row: 0, slot: 7 } }, (c) => ((c.closed = true), setMcb(c, 20, 'C', 6)));
  const xpe1 = b.add('bar-pe-8', { rail: { row: 1, slot: 0 } });

  const p2 = b.addPanel('Sottoquadro taverna', 12, 1);
  const q6 = b.add('switch-2p', { rail: { panelId: p2, row: 0, slot: 0 } }, (c) => (c.closed = true));
  const q7 = b.add('rcd-2p', { rail: { panelId: p2, row: 0, slot: 2 } }, (c) => (c.closed = true));
  const q8 = b.add('mcb-1pn', { rail: { panelId: p2, row: 0, slot: 4 } }, (c) => ((c.closed = true), setMcb(c, 10)));
  const q9 = b.add('mcb-1pn', { rail: { panelId: p2, row: 0, slot: 5 } }, (c) => ((c.closed = true), setMcb(c, 16)));
  const xpe2 = b.add('bar-pe-8', { rail: { panelId: p2, row: 0, slot: 7 } });

  const y = 700;
  const u1 = addLoad(b, { catalogId: 'load-luce', name: 'Luci casa', powerW: 500, section: 1.5, length: 20 }, -40, y, 3);
  const u2 = addLoad(b, { catalogId: 'load-prese', name: 'Prese casa', powerW: 2000, section: 2.5, length: 22, sockets: true }, 150, y, 3);
  const u3 = addLoad(b, { catalogId: 'load-luce', name: 'Luci taverna', powerW: 300, section: 1.5, length: 12 }, 700, y, 2);
  const u4 = addLoad(b, { catalogId: 'load-prese', name: 'Prese taverna', powerW: 1500, section: 2.5, length: 15, sockets: true }, 890, y, 2);

  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 10, 10).wire(t(cnt, 'N'), t(q1, 'p1_in'), 10, 10);
  b.wire(t(q1, 'p0_out'), t(q2, 'p0_in'), 6, 0.2).wire(t(q1, 'p1_out'), t(q2, 'p1_in'), 6, 0.2);
  b.wire(t(q2, 'p0_in'), t(q5, 'p0_in'), 6, 0.3).wire(t(q2, 'p1_in'), t(q5, 'p1_in'), 6, 0.3);
  b.wire(t(q2, 'p0_out'), t(q3, 'p0_in'), 4, 0.2).wire(t(q2, 'p1_out'), t(q3, 'p1_in'), 4, 0.2);
  bridge(b, [q3, q4], 4);
  // linea di alimentazione del sottoquadro: 25 m in 4 mm²
  b.wire(t(q5, 'p0_out'), t(q6, 'p0_in'), 4, 25).wire(t(q5, 'p1_out'), t(q6, 'p1_in'), 4, 25);
  b.wire(t(q6, 'p0_out'), t(q7, 'p0_in'), 4, 0.2).wire(t(q6, 'p1_out'), t(q7, 'p1_in'), 4, 0.2);
  b.wire(t(q7, 'p0_out'), t(q8, 'p0_in'), 4, 0.2).wire(t(q7, 'p1_out'), t(q8, 'p1_in'), 4, 0.2);
  bridge(b, [q8, q9], 4);
  b.wire(t(earth, 'PE'), t(xpe1, 't0'), 10, 5);
  b.wire(t(xpe1, 't5'), t(xpe2, 't0'), 4, 25);
  line(b, q3, u1, xpe1, 1, 1.5);
  line(b, q4, u2, xpe1, 2, 2.5);
  line(b, q8, u3, xpe2, 1, 1.5);
  line(b, q9, u4, xpe2, 2, 2.5);
  return b.project;
}

export function luceScale(): Project {
  const b = new ProjectBuilder('Luce scale da tre punti', 1, 12);
  b.project.description =
    'Comando di una luce da tre punti con un relè passo-passo. Avvia la simulazione, chiudi Q1 e premi uno qualsiasi dei tre pulsanti (tasto rotondo): la luce si accende; premine un altro e si spegne. ' +
    'Circuito di comando: fase → pulsanti in parallelo → bobina A1-A2 → neutro. Circuito di potenza: fase → contatto 1-2 del relè → lampada.';
  const cnt = b.add('supply-mono', { position: { x: -280, y: 30 } });
  const earth = b.add('earth', { position: { x: -260, y: 300 } });
  const q1 = b.add('rcbo-1pn', { rail: { row: 0, slot: 0 } }, (c) => setMcb(c, 10));
  const ka = b.add('step-relay', { rail: { row: 0, slot: 3 } });
  const xn = b.add('bar-n-8', { rail: { row: 0, slot: 5 } });
  const xpe = b.add('bar-pe-8', { rail: { row: 0, slot: 9 } });
  const buttons = ['Piano terra', 'Primo piano', 'Secondo piano'].map((name, k) =>
    b.add('pushbutton', { position: { x: -40 + k * 150, y: 380 } }, (c) => {
      if (c.params.kind === 'button') c.params.p.name = name;
    }),
  );
  const lamp = addLoad(b, { catalogId: 'load-luce', name: 'Luce scale', powerW: 100, section: 1.5, length: 25 }, 430, 380, 1);
  b.wire(t(cnt, 'L'), t(q1, 'p0_in'), 6, 8).wire(t(cnt, 'N'), t(q1, 'p1_in'), 6, 8);
  b.wire(t(q1, 'p1_out'), t(xn, 't0'), 1.5, 0.3);
  // potenza: fase protetta → contatto del relè → lampada
  b.wire(t(q1, 'p0_out'), t(ka, 'p0_in'), 1.5, 0.15);
  b.wire(t(ka, 'p0_out'), t(lamp, 'L'), 1.5, 0.4);
  b.wire(t(xn, 't1'), t(lamp, 'N'), 1.5, 0.4);
  // comando: fase → pulsanti in parallelo → A1; A2 → neutro
  for (const btn of buttons) b.wire(t(q1, 'p0_out'), t(btn, 'in'), 1.5, 12).wire(t(btn, 'out'), t(ka, 'A1'), 1.5, 12);
  b.wire(t(ka, 'A2'), t(xn, 't2'), 1.5, 0.2);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5).wire(t(xpe, 't1'), t(lamp, 'PE'), 1.5, 0.5);
  return b.project;
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: 'demo-monolocale',
    name: 'Monolocale con contatore da 3 kW',
    summary: 'Generale 2P, differenziale 30 mA tipo A, tre circuiti (luci, prese, cucina). Completamente cablato.',
    build: monolocale,
  },
  {
    id: 'demo-appartamento',
    name: 'Appartamento con fornitura da 4,5 kW',
    summary: 'Due gruppi differenziali 30 mA, cinque circuiti (luci, prese giorno/notte, forno, lavatrice).',
    build: appartamento,
  },
  {
    id: 'demo-abitazione',
    name: 'Abitazione con fornitura da 6 kW',
    summary: 'Generale 2P C32 e un magnetotermico differenziale (RCBO) 30 mA per ciascuno dei sette circuiti.',
    build: abitazione,
  },
  {
    id: 'demo-villetta',
    name: 'Villetta con sottoquadro taverna',
    summary: 'Due quadri: generale con linea 2P C20 verso un sottoquadro a 25 m con sezionatore, differenziale 30 mA e due circuiti.',
    build: villetta,
  },
  {
    id: 'demo-luce-scale',
    name: 'Luce scale da tre punti (relè passo-passo)',
    summary: 'Magnetotermico differenziale, relè passo-passo e tre pulsanti in parallelo che comandano la stessa luce.',
    build: luceScale,
  },
  {
    id: 'demo-trifase',
    name: 'Quadro trifase 400/230 V con carichi squilibrati',
    summary: '3P+N, differenziale 4P, carichi monofase su L1/L2/L3 e un carico trifase: neutro comune e spostamento del centro stella.',
    build: trifase,
  },
];
