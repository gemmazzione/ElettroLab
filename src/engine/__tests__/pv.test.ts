import { describe, expect, it } from 'vitest';
import { catalogItem } from '../../model/catalog';
import type { InverterParams, Project, PvArrayParams } from '../../model/types';
import { fotovoltaico } from '../../projects/demos';
import { buildNormContext } from '../../rules/context';
import { inverterDcLink } from '../dc';
import { arrayOperatingPoint, cellTemperature, dayProfile, maxStringVoc, pvEnv, stringChecks } from '../pv';
import { simulate } from '../simulate';

const arrP = (): PvArrayParams => {
  const d = catalogItem('pv-string').defaults!;
  if (d.kind !== 'pv-array') throw new Error('kind');
  return { ...d.p };
};
const invP = (): InverterParams => {
  const d = catalogItem('pv-inverter').defaults!;
  if (d.kind !== 'inverter') throw new Error('kind');
  return { ...d.p };
};

/** Demo con tutte le protezioni chiuse e sole impostato. */
function demo(irradiance = 1000, ambientC = 25): Project {
  const p = fotovoltaico();
  for (const c of p.components) if (c.params.kind !== 'load' && c.params.kind !== 'button') c.closed = true;
  p.pv = { ...pvEnv(p.pv), irradiance, ambientC };
  return p;
}
const byLabel = (p: Project, l: string) => p.components.find((c) => c.label === l)!;
const inverterOf = (p: Project) => p.components.find((c) => c.params.kind === 'inverter')!;

describe('modello fotovoltaico', () => {
  it('in condizioni STC (1000 W/m², cella a 25 °C) rende la potenza di targa', () => {
    const a = arrP();
    // ambiente scelto in modo che la cella sia a 25 °C
    const ta = 25 - ((a.noct - 20) / 800) * 1000;
    const op = arrayOperatingPoint(a, 1000, ta);
    expect(op.tc).toBeCloseTo(25, 6);
    expect(op.pmp).toBeCloseTo(a.moduleWp * a.modulesPerString, 6);
    expect(op.vmp).toBeCloseTo(a.vmp * a.modulesPerString, 6);
  });

  it('con la cella calda la potenza cala secondo il coefficiente di temperatura', () => {
    const a = arrP();
    const tc = cellTemperature(25, 1000, a.noct);
    expect(tc).toBeCloseTo(25 + 31.25, 6);
    const op = arrayOperatingPoint(a, 1000, 25);
    expect(op.pmp).toBeCloseTo(3200 * (1 - 0.0035 * 31.25), 3);
  });

  it('la tensione a vuoto massima si calcola alla temperatura minima del sito', () => {
    const a = arrP();
    expect(maxStringVoc(a, -10)).toBeCloseTo(8 * 41 * (1 + 0.0027 * 35), 6);
    const checks = stringChecks(a, invP(), pvEnv());
    expect(checks.find((c) => c.id === 'voc-max')!.ok).toBe(true);
    // 16 moduli in serie superano i 600 V dell'inverter con il freddo
    const big = stringChecks({ ...a, modulesPerString: 16 }, invP(), pvEnv());
    expect(big.find((c) => c.id === 'voc-max')!.ok).toBe(false);
  });
});

describe('fotovoltaico nel circuito', () => {
  it('il generatore della demo è collegato all\'inverter con la polarità corretta', () => {
    const p = demo();
    const link = inverterDcLink(p, inverterOf(p));
    expect(link.arrays.length).toBe(1);
    expect(link.reversed.length).toBe(0);
    expect(link.rLoop).toBeGreaterThan(0);
  });

  it('con il sole l\'inverter immette potenza e l\'eccedenza va in rete', () => {
    const p = demo(1000, 25);
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    const inv = r.inverters.get(inverterOf(p).id)!;
    expect(inv.state).toBe('produzione');
    // 3200 Wp a 56 °C di cella ≈ 2850 W DC, rendimento 97%, meno le perdite nei cavi DC
    expect(inv.pac).toBeGreaterThan(2650);
    expect(inv.pac).toBeLessThan(2800);
    // carichi accesi: luci 300 W + prese 1000 W → circa 1,4 kW esportati
    expect(r.supply.p).toBeLessThan(-1000);
    expect(r.alerts.some((a) => a.code === 'PV_EXPORT')).toBe(true);
    // il contatore di produzione vede la corrente dell'inverter
    const m2 = r.poleI.get(byLabel(p, 'M2').id)!;
    expect(Math.hypot(m2[0]!.re, m2[0]!.im)).toBeCloseTo(inv.iac, 3);
  });

  it('senza rete l\'inverter si stacca (anti-isola): nessuna tensione agli utilizzatori', () => {
    const p = demo(1000);
    byLabel(p, 'Q1').closed = false;
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.inverters.get(inverterOf(p).id)!.state).toBe('rete assente');
    for (const c of p.components) if (c.params.kind === 'load') expect(r.loads.get(c.id)!.energized).toBe(false);
  });

  it('con + e − scambiati l\'inverter non produce e segnala l\'errore', () => {
    const p = demo(1000);
    const arr = p.components.find((c) => c.params.kind === 'pv-array')!;
    for (const w of p.wires) {
      if (w.from === `${arr.id}:DC+`) w.from = `${arr.id}:DC-`;
      else if (w.from === `${arr.id}:DC-`) w.from = `${arr.id}:DC+`;
    }
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.inverters.get(inverterOf(p).id)!.state).toBe('polarità invertita');
    expect(r.alerts.some((a) => a.code === 'PV_FAULT')).toBe(true);
  });

  it('di notte non c\'è produzione e la casa preleva dalla rete', () => {
    const p = demo(0);
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.inverters.get(inverterOf(p).id)!.state).toBe('notte');
    expect(r.supply.p).toBeGreaterThan(1000);
  });

  it('il sezionatore DC aperto toglie la produzione', () => {
    const p = demo(1000);
    p.components.find((c) => c.params.kind === 'dc-switch')!.closed = false;
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.inverters.get(inverterOf(p).id)!.state).toBe('dc scollegato');
  });

  it('le verifiche di progetto (caduta di tensione) non contano sulla produzione', () => {
    const sun = buildNormContext(demo(1000)).circuits.map((c) => c.dropPct);
    const night = buildNormContext(demo(0)).circuits.map((c) => c.dropPct);
    expect(sun).toEqual(night);
  });
});

describe('giornata tipo', () => {
  it('bilancio: prodotta = autoconsumata + immessa; consumata = autoconsumata + prelevata', () => {
    const d = dayProfile([arrP()], invP(), pvEnv(), () => 500);
    expect(d.producedKWh).toBeGreaterThan(10);
    expect(d.producedKWh).toBeCloseTo(d.selfConsumedKWh + d.exportedKWh, 6);
    expect(d.consumedKWh).toBeCloseTo(12, 6);
    expect(d.consumedKWh).toBeCloseTo(d.selfConsumedKWh + d.importedKWh, 6);
  });

  it('con l\'accumulo si preleva e si immette meno', () => {
    const base = dayProfile([arrP()], invP(), pvEnv(), () => 500);
    const batt = dayProfile([arrP()], { ...invP(), batteryKWh: 5, batteryW: 2500 }, pvEnv(), () => 500);
    expect(batt.importedKWh).toBeLessThan(base.importedKWh);
    expect(batt.exportedKWh).toBeLessThan(base.exportedKWh);
    expect(batt.selfSufficiencyPct).toBeGreaterThan(base.selfSufficiencyPct);
  });
});

describe('verifiche di cablaggio del fotovoltaico', () => {
  it('la demo non ha segnalazioni; l\'unifilare mostra l\'inverter sotto il contatore di produzione', async () => {
    const { checkWiring } = await import('../../graph/erc');
    const { buildSingleLine } = await import('../../diagram/singleLine');
    const p = fotovoltaico();
    expect(checkWiring(p).filter((i) => i.code.startsWith('PV_'))).toEqual([]);
    const sl = buildSingleLine(p)!;
    expect(sl.orphans.map((c) => c.label)).toEqual([]);
    const inv = sl.nodes.find((n) => n.kind === 'inverter')!;
    const parent = sl.nodes.find((n) => n.children.includes(inv))!;
    expect(parent.comp.label).toBe('M2');
  });

  it('segnala polarità invertita, inverter senza protezione e senza sezionatore DC', async () => {
    const { checkWiring } = await import('../../graph/erc');
    const p = fotovoltaico();
    const arr = p.components.find((c) => c.params.kind === 'pv-array')!;
    for (const w of p.wires) {
      if (w.from === `${arr.id}:DC+`) w.from = `${arr.id}:DC-`;
      else if (w.from === `${arr.id}:DC-`) w.from = `${arr.id}:DC+`;
    }
    expect(checkWiring(p).some((i) => i.code === 'PV_POLARITY')).toBe(true);

    // linea AC dell'inverter (attraverso il contatore M2) collegata direttamente al punto di fornitura: nessuna protezione
    const q = fotovoltaico();
    const qfv = byLabel(q, 'QFV');
    const cnt = q.components.find((c) => c.params.kind === 'supply')!;
    for (const w of q.wires) {
      if (w.from === `${qfv.id}:p0_out`) w.from = `${cnt.id}:L`;
      if (w.from === `${qfv.id}:p1_out`) w.from = `${cnt.id}:N`;
    }
    expect(checkWiring(q).some((i) => i.code === 'PV_AC_NO_OCP')).toBe(true);

    // stringa collegata direttamente all'inverter (senza sezionatore DC)
    const d = fotovoltaico();
    const qdc = d.components.find((c) => c.params.kind === 'dc-switch')!;
    const inv = inverterOf(d);
    d.wires = d.wires.filter((w) => !w.from.startsWith(`${qdc.id}:`) && !w.to.startsWith(`${qdc.id}:`));
    const a = d.components.find((c) => c.params.kind === 'pv-array')!;
    d.wires.push({ ...d.wires[0]!, id: 'w-dcp', from: `${a.id}:DC+`, to: `${inv.id}:DC+`, conductor: 'DC+', color: 'rosso', section: 6, length: 22 });
    d.wires.push({ ...d.wires[0]!, id: 'w-dcm', from: `${a.id}:DC-`, to: `${inv.id}:DC-`, conductor: 'DC-', color: 'nero', section: 6, length: 22 });
    const codes = checkWiring(d).map((i) => i.code);
    expect(codes).toContain('PV_NO_DC_ISOLATOR');
    expect(codes).not.toContain('PV_POLARITY');
  });
});

describe('multimetro sul lato DC', () => {
  it('legge la Voc della stringa anche a impianto spento, con il segno della polarità', async () => {
    const { dcVoltageBetween } = await import('../measure');
    const p = demo(1000, 25);
    const arr = p.components.find((c) => c.params.kind === 'pv-array')!;
    const inv = inverterOf(p);
    const voc = arrayOperatingPoint(arr.params.kind === 'pv-array' ? arr.params.p : arrP(), 1000, 25).voc;
    // ai morsetti dell'inverter, attraverso il sezionatore chiuso
    expect(dcVoltageBetween(p, `${inv.id}:DC+`, `${inv.id}:DC-`, null)).toBeCloseTo(voc, 6);
    expect(dcVoltageBetween(p, `${inv.id}:DC-`, `${inv.id}:DC+`, null)).toBeCloseTo(-voc, 6);
    // sezionatore aperto: lato inverter non più collegato alla stringa
    p.components.find((c) => c.params.kind === 'dc-switch')!.closed = false;
    expect(dcVoltageBetween(p, `${inv.id}:DC+`, `${inv.id}:DC-`, null)).toBeNull();
    // in produzione si legge la tensione del punto di lavoro, minore della Voc
    const q = demo(1000, 25);
    const r = simulate(q);
    const v = dcVoltageBetween(q, `${inverterOf(q).id}:DC+`, `${inverterOf(q).id}:DC-`, r);
    expect(v!).toBeLessThan(voc);
  });
});
