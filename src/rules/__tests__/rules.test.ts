import { describe, expect, it } from 'vitest';
import type { Project } from '../../model/types';
import { DEMO_PROJECTS } from '../../projects/demos';
import { ampacity } from '../ampacity';
import { runRules } from '../engine';
import { RULESET_2007 } from '../ruleset2007';
import { AREAS } from '../types';

const demo = () => DEMO_PROJECTS[0]!.build();
const loadByName = (p: Project, name: string) => p.components.find((c) => c.params.kind === 'load' && c.params.p.name === name)!;
const outcomesOf = (p: Project, ruleId: string) => runRules(p).outcomes.filter((o) => o.ruleId === ruleId);

describe('motore di regole: struttura', () => {
  it('ogni regola ha id, versione, riferimento, area valida e spiegazione', () => {
    const ids = new Set<string>();
    for (const r of RULESET_2007.rules) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.version).toMatch(/^\d+\.\d+$/);
      expect(r.refs.length).toBeGreaterThan(0);
      expect(AREAS).toContain(r.area);
      expect(r.explanation.length).toBeGreaterThan(40);
      // i riferimenti all'edizione vigente non sono mai dichiarati verificati
      for (const ref of r.refs) if (ref.edition.includes('IX')) expect(ref.verified).toBe(false);
    }
  });

  it('tutte le 11 aree di verifica sono coperte', () => {
    const covered = new Set(RULESET_2007.rules.map((r) => r.area));
    for (const a of AREAS) expect(covered.has(a)).toBe(true);
  });

  it('il progetto dimostrativo non ha errori ma non viene mai dichiarato conforme', () => {
    const rep = runRules(demo());
    expect(rep.counts.errore).toBe(0);
    expect(rep.counts['verifica-campo']).toBeGreaterThan(0);
    expect(rep.summary).toContain('NON può essere dichiarato conforme');
  });
});

describe('verifica dimensionamento (433.2)', () => {
  it('portata con fattori di correzione: 2,5 mm² B1 PVC, 3 circuiti → 16,8 A', () => {
    expect(ampacity(2.5, 'B1', 'PVC', 30, 3)!.iz).toBeCloseTo(16.8, 6);
    expect(ampacity(2.5, 'B1', 'PVC', 40, 1)!.iz).toBeCloseTo(24 * 0.87, 6);
  });

  it('demo: luci, prese e forno coordinati', () => {
    const o = outcomesOf(demo(), 'OL-433');
    expect(o).toHaveLength(3);
    expect(o.every((x) => x.status === 'conforme')).toBe(true);
  });

  it('IB > In: errore', () => {
    const p = demo();
    const prese = loadByName(p, 'Prese soggiorno');
    if (prese.params.kind === 'load') prese.params.p.powerW = 4000; // 17,4 A su C16
    const o = outcomesOf(p, 'OL-433').find((x) => x.componentIds.includes(prese.id))!;
    expect(o.status).toBe('errore');
    expect(o.message).toContain('IB');
  });

  it('In > Iz con posa sfavorevole: conduttore non protetto', () => {
    const p = demo();
    const prese = loadByName(p, 'Prese soggiorno');
    if (prese.params.kind === 'load') prese.params.p.install = { method: 'A2', insulation: 'PVC', ambientC: 40, grouped: 4 };
    const o = outcomesOf(p, 'OL-433').find((x) => x.componentIds.includes(prese.id))!;
    expect(o.status).toBe('errore');
    expect(o.message).toContain('Iz');
  });

  it('senza dati di posa: dati insufficienti, non conforme', () => {
    const p = demo();
    const luci = loadByName(p, 'Luci');
    if (luci.params.kind === 'load') delete luci.params.p.install;
    const o = outcomesOf(p, 'OL-433').find((x) => x.componentIds.includes(luci.id))!;
    expect(o.status).toBe('dati-insufficienti');
    expect(o.missingData!.length).toBeGreaterThan(0);
  });
});

describe('sistema TT (413.1.4.2)', () => {
  it('RE di progetto: condizione soddisfatta ma serve la misura sul campo', () => {
    const o = outcomesOf(demo(), 'TT-RE-IDN');
    expect(o[0]!.status).toBe('verifica-campo');
  });

  it('RE misurata elevata con differenziale da 300 mA: errore', () => {
    const p = demo();
    const e = p.components.find((c) => c.params.kind === 'earth')!;
    if (e.params.kind === 'earth') e.params.p = { ra: 400, raMeasured: true };
    const rcd = p.components.find((c) => c.params.kind === 'rcd')!;
    if (rcd.params.kind === 'rcd') rcd.params.p.idn = 300;
    const o = outcomesOf(p, 'TT-RE-IDN')[0]!;
    expect(o.status).toBe('errore'); // 400 × 0,3 = 120 V > 50 V
  });

  it('circuito senza differenziale: errore', () => {
    const p = demo();
    const rcd = p.components.find((c) => c.params.kind === 'rcd')!;
    // scavalca il differenziale ricollegando Q1 direttamente ai magnetotermici
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    for (const w of p.wires) {
      if (w.from === `${rcd.id}:p0_out`) w.from = `${q1.id}:p0_out`;
      if (w.from === `${rcd.id}:p1_out`) w.from = `${q1.id}:p1_out`;
    }
    const o = outcomesOf(p, 'TT-DIFF');
    expect(o.every((x) => x.status === 'errore')).toBe(true);
  });
});

describe('protezione addizionale e residenziale (412.5.3)', () => {
  it('prese protette da differenziale da 100 mA in abitazione: errore', () => {
    const p = demo();
    const rcd = p.components.find((c) => c.params.kind === 'rcd')!;
    if (rcd.params.kind === 'rcd') rcd.params.p.idn = 100;
    const o = outcomesOf(p, 'RES-412.5.3');
    expect(o).toHaveLength(1);
    expect(o[0]!.status).toBe('errore');
  });

  it('non applicata se i locali non sono ad uso abitativo', () => {
    const p = demo();
    p.norm = { residential: false, ul: 50 };
    expect(outcomesOf(p, 'RES-412.5.3')).toHaveLength(0);
  });
});

describe('cortocircuito (434.3)', () => {
  it('potere di interruzione insufficiente senza back-up: errore', () => {
    const p = demo();
    // Icc dichiarata dal distributore 6 kA all'origine; il generale Q1 ha Icn 3 kA
    p.norm = { residential: true, ul: 50, declaredIccKA: 6 };
    for (const c of p.components) if (c.params.kind === 'mcb') c.params.p.icn = 3;
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    const o = outcomesOf(p, 'SC-434-PDI').find((x) => x.componentIds.includes(q1.id))!;
    expect(o.status).toBe('errore');
    // i magnetotermici a valle vedono la Icc calcolata (ridotta dal montante): entro Icn
    expect(outcomesOf(p, 'SC-434-PDI').filter((x) => !x.componentIds.includes(q1.id)).every((x) => x.status === 'conforme')).toBe(true);
  });

  it('linea molto lunga: il cortocircuito a fondo linea non raggiunge la soglia magnetica', () => {
    const p = demo();
    const luci = loadByName(p, 'Luci');
    if (luci.params.kind === 'load') luci.params.p.cableLength = 300;
    const o = outcomesOf(p, 'SC-434-I2T').find((x) => x.componentIds.includes(luci.id))!;
    expect(o.status).toBe('errore');
  });

  it('intervento magnetico certo: servono i dati I²t del costruttore', () => {
    const o = outcomesOf(demo(), 'SC-434-I2T');
    expect(o.every((x) => x.status === 'dati-insufficienti')).toBe(true);
  });
});

describe('sezionamento e identificazione', () => {
  it('magnetotermico 1P senza dispositivo onnipolare: neutro non sezionabile', () => {
    const p = demo();
    // trasforma Q3 (luci) in 1P e collega il neutro direttamente al differenziale
    const q3 = p.components.find((c) => c.label === 'Q3')!;
    const rcd = p.components.find((c) => c.params.kind === 'rcd')!;
    const q1 = p.components.find((c) => c.label === 'Q1')!;
    if (q3.params.kind === 'mcb') q3.params.p.poles = '1P';
    if (rcd.params.kind === 'rcd') rcd.params.p.poles = '1P+N';
    // nessun dispositivo multipolare: rimuovo il generale e il differenziale dal neutro
    for (const w of p.wires) {
      if (w.to === `${q1.id}:p1_in`) w.to = `${rcd.id}:p1_out`;
    }
    const luci = loadByName(p, 'Luci');
    const nWire = p.wires.find((w) => w.to === `${luci.id}:N`)!;
    nWire.from = `${rcd.id}:p1_out`;
    const o = outcomesOf(p, 'SEZ-462').find((x) => x.componentIds.includes(luci.id));
    expect(o?.status).toBe('errore');
  });

  it('PE di colore errato: errore di identificazione', () => {
    const p = demo();
    p.wires.find((w) => w.conductor === 'PE')!.color = 'nero';
    expect(outcomesOf(p, 'ID-514')[0]!.status).toBe('errore');
  });
});

describe('schede informative', () => {
  it('ogni articolo del catalogo ha una scheda', async () => {
    const { CATALOG } = await import('../../model/catalog');
    const { componentInfo } = await import('../../model/componentInfo');
    for (const item of CATALOG) expect(componentInfo(item.id), item.id).not.toBeNull();
  });
});
