import { describe, expect, it } from 'vitest';
import { balance, billOfMaterials, cableDesignation, computePlant, currentOf, dm37, dropPct, peSection, pickIn } from '../calc';
import { coherent, examplePlants, line, normalizePlant, type Plant } from '../model';
import { applyPlan, roomCounts, routes } from '../plan';

const ex = (id: string): Plant => examplePlants().find((e) => e.id === id)!.make();

describe('Progetta impianto: formule', () => {
  it('corrente d\'impiego monofase e trifase', () => {
    expect(currentOf(2300, 1, 1)).toBeCloseTo(10, 5);
    expect(currentOf(10000, 3, 1)).toBeCloseTo(14.43, 1);
  });
  it('caduta di tensione: 16 A, 30 m, 2,5 mm², cos φ 1 ≈ 3,6%', () => {
    expect(dropPct(16, 30, 2.5, 1, 1)).toBeCloseTo(((2 * 16 * 30 * 0.0214) / 2.5 / 230) * 100, 3);
  });
  it('PE secondo la Tab. 54F', () => {
    expect(peSection(10)).toBe(10);
    expect(peSection(25)).toBe(16);
    expect(peSection(35)).toBe(16);
    expect(peSection(95)).toBe(50);
    expect(peSection(240)).toBe(120);
  });
  it('taglie degli interruttori e designazione dei cavi', () => {
    expect(pickIn(13.2)).toBe(16);
    expect(pickIn(70)).toBe(80);
    expect(cableDesignation(1, true, 2.5)).toBe('3G2,5');
    expect(cableDesignation(3, false, 16)).toBe('4G16');
    expect(cableDesignation(3, true, 1.5)).toBe('5G1,5');
  });
});

describe('Progetta impianto: esempi', () => {
  for (const e of examplePlants()) {
    it(`${e.title}: nessun errore`, () => {
      const r = computePlant(e.make());
      const errs = [...r.main.checks, ...r.lines.flatMap((l) => l.checks)].filter((c) => c.status === 'error');
      expect(errs.map((c) => c.text)).toEqual([]);
    });
  }
  it('appartamento: linee dimensionate con Ib ≤ In ≤ Iz e caduta entro il 4%', () => {
    const r = computePlant(ex('appartamento'));
    for (const l of r.lines) {
      expect(l.inA).not.toBeNull();
      expect(l.ibA).toBeLessThanOrEqual(l.inA!);
      expect(l.inA!).toBeLessThanOrEqual(l.iz!.iz);
      expect(l.dropTotPct).toBeLessThanOrEqual(4);
    }
    expect(r.lines.find((l) => l.line.kind === 'luce')!.section).toBe(1.5);
  });
  it('negozio: linee monofase distribuite sulle tre fasi', () => {
    const p = ex('negozio');
    const b = balance(p);
    const used = new Set(p.lines.filter((l) => l.phases === 1).map((l) => b.phaseOf.get(l.id)));
    expect(used.size).toBe(3);
    expect(b.unbalance).toBeLessThan(0.3);
  });
  it('officina: TN-S, Icc dalla cabina e generale scatolato', () => {
    const r = computePlant(ex('officina'));
    expect(r.source.iccMaxA).toBeGreaterThan(9000);
    expect(r.main.inA!).toBeGreaterThan(63);
    expect(r.lines.every((l) => l.checks.some((c) => c.id === '413'))).toBe(true);
  });
});

describe('Progetta impianto: verifiche', () => {
  it('TT senza differenziale: errore', () => {
    const p = ex('appartamento');
    p.lines[0]!.rcdMa = 0;
    p.lines[0]!.rcdGroup = '';
    const r = computePlant(p);
    expect(r.lines[0]!.checks.find((c) => c.id === '413')!.status).toBe('error');
  });
  it('TT con RA troppo alta: RA·IΔn > 50 V', () => {
    const p = ex('appartamento');
    p.raOhm = 2000;
    expect(computePlant(p).lines[0]!.checks.find((c) => c.id === '413')!.status).toBe('error');
  });
  it('TN senza differenziale: una linea lunga fa crescere la sezione per il guasto a massa', () => {
    const p = ex('officina');
    const short = line('fm', true, { lengthM: 20, rcdMa: 0, powerW: 9000 });
    const long = { ...short, id: 'lungo', lengthM: 300 };
    p.lines = [short, long];
    const r = computePlant(p);
    expect(r.lines[1]!.section!).toBeGreaterThan(r.lines[0]!.section!);
    expect(r.lines[1]!.faultA!).toBeGreaterThanOrEqual(r.lines[1]!.inA! * 10);
  });
  it('linea troppo lunga: caduta oltre il limite segnalata', () => {
    const p = ex('appartamento');
    p.lines = [{ ...p.lines[2]!, sectionOverride: 1.5, lengthM: 80 }];
    const c = computePlant(p).lines[0]!.checks.find((x) => x.id === '525')!;
    expect(c.status).toBe('warn');
  });
  it('potenza contemporanea oltre la potenza impegnata', () => {
    const p = ex('appartamento');
    p.supply.contractKW = 3;
    expect(computePlant(p).main.checks.find((c) => c.id === 'contract')!.status).toBe('warn');
  });
  it('motore con curva C e spunto alto: avviso', () => {
    const p = ex('officina');
    p.lines = [line('motore', true, { curve: 'C', powerW: 12000 })];
    const r = computePlant(p);
    expect(r.lines[0]!.checks.find((c) => c.id === 'start')!.status).toBe('warn');
  });
});

describe('DM 37/2008 art. 5', () => {
  it('abitazione da 6 kW e 110 m²: progetto dell\'installatore', () => {
    expect(dm37(ex('appartamento')).required).toBe(false);
  });
  it('abitazione oltre 6 kW o 400 m²', () => {
    const p = ex('appartamento');
    p.supply.contractKW = 7;
    expect(dm37(p).required).toBe(true);
    p.supply.contractKW = 6;
    p.areaM2 = 420;
    expect(dm37(p).required).toBe(true);
  });
  it('condominio sempre, negozio oltre 200 m², cabina sempre', () => {
    const p = ex('appartamento');
    p.use = 'condominio';
    expect(dm37(p).required).toBe(true);
    expect(dm37(ex('negozio')).reasons.length).toBeGreaterThan(0);
    expect(dm37(ex('officina')).reasons.some((r) => r.includes('1000 V'))).toBe(true);
  });
});

describe('Progetta impianto: dati', () => {
  it('fornitura monofase: le linee diventano monofase; cabina → TN-S', () => {
    const p = ex('negozio');
    p.supply.kind = 'bt-mono';
    const c = coherent(p);
    expect(c.lines.every((l) => l.phases === 1)).toBe(true);
    expect(c.earthing).toBe('TT');
    expect(coherent(ex('officina')).earthing).toBe('TN-S');
  });
  it('normalizePlant completa i dati mancanti', () => {
    const p = normalizePlant({ name: 'X', lines: [{ id: 'a', kind: 'luce', name: 'L' }] });
    expect(p.name).toBe('X');
    expect(p.lines[0]!.powerW).toBeGreaterThan(0);
    expect(p.supply.kind).toBe('bt-mono');
  });
});

describe('Progetta impianto: sottoquadri e differenziali', () => {
  it('officina: il sottoquadro prende la potenza dalle sue linee e le sue linee partono più a valle', () => {
    const p = ex('officina');
    const r = computePlant(p);
    const qu = r.lines.find((l) => l.line.kind === 'sottoquadro')!;
    expect(qu.sub).not.toBeNull();
    expect(qu.ibA).toBeGreaterThan(5);
    const child = r.lines.find((l) => l.boardId === qu.line.id)!;
    expect(child.tag.startsWith(`${qu.tag}.`)).toBe(true);
    expect(child.iccOriginA).toBeLessThan(r.source.iccMaxA);
    expect(child.dropTotPct).toBeGreaterThan(qu.dropTotPct);
    expect(r.boards.length).toBe(2);
  });
  it('differenziale di gruppo: le linee del gruppo sono protette dal gruppo', () => {
    const r = computePlant(ex('appartamento'));
    expect(r.groups.length).toBe(2);
    expect(r.groups[0]!.lines.length).toBeGreaterThan(0);
    for (const l of r.groups[0]!.lines) expect(l.checks.find((c) => c.id === '413')!.status).toBe('ok');
    expect(r.groups[0]!.inA).toBeGreaterThanOrEqual(25);
  });
  it('selettività differenziale: 30 mA sotto un 300 mA S è selettivo, sotto un 30 mA no', () => {
    const p = ex('appartamento');
    p.mainRcdMa = 300;
    p.mainRcdS = true;
    const ok = computePlant(p).lines.find((l) => l.line.rcdMa === 30 && !l.line.rcdGroup)!;
    expect(ok.checks.find((c) => c.id === '536')!.status).toBe('ok');
    p.mainRcdS = false;
    const bad = computePlant(p).lines.find((l) => l.line.rcdMa === 30 && !l.line.rcdGroup)!;
    expect(bad.checks.find((c) => c.id === '536')!.status).toBe('warn');
  });
  it('selettività tra interruttori: a monte stessa taglia → avviso', () => {
    const p = ex('appartamento');
    p.lines[0]!.inOverride = 63;
    const r = computePlant(p);
    expect(r.lines[0]!.checks.find((c) => c.id === 'sel')!.status).toBe('warn');
  });
  it('bagno: prescrizioni della Sez. 701', () => {
    const r = computePlant(ex('appartamento'));
    const b = r.lines.find((l) => l.line.bathroom)!;
    expect(b.checks.some((c) => c.ref?.includes('701'))).toBe(true);
  });
});

describe('Progetta impianto: rifasamento, cavi in parallelo, terra, computo', () => {
  it('rifasamento: suggerisce i kvar e la batteria porta il cos φ sopra 0,95', () => {
    const p = ex('officina');
    const r = computePlant(p);
    expect(r.pfc.neededKvar).toBeGreaterThan(0);
    p.pfcKvar = r.pfc.suggestedKvar!;
    const r2 = computePlant(p);
    expect(r2.balance.cosPhi).toBeGreaterThanOrEqual(0.95);
    expect(r2.main.checks.find((c) => c.id === 'pf')!.status).toBe('ok');
  });
  it('linea da 300 A: cavi in parallelo', () => {
    const p = ex('officina');
    p.lines = [line('fm', true, { powerW: 190000, ku: 1, cosPhi: 0.9, lengthM: 60, method: 'E', insulation: 'EPR', grouped: 1 })];
    const r = computePlant(p);
    const l = r.lines[0]!;
    expect(l.section).not.toBeNull();
    expect(l.izA!).toBeGreaterThanOrEqual(l.inA!);
  });
  it('terra TT: RA massima dalla IΔn più alta e stima dei picchetti', () => {
    const p = ex('appartamento');
    const r = computePlant(p);
    expect(r.earth.raMaxOhm).toBeCloseTo(50 / 0.03, 0);
    expect(r.earth.rods).toBeGreaterThanOrEqual(1);
    p.mainRcdMa = 300;
    p.raOhm = 200;
    expect(computePlant(p).earth.raOk).toBe(false);
    expect(r.earth.equipotentialMm2).toBeGreaterThanOrEqual(6);
  });
  it('computo: protezioni, cavi e terra', () => {
    const p = ex('officina');
    const r = computePlant(p);
    const bom = billOfMaterials(p, r);
    expect(bom.some((b) => b.group === 'Cavi' && b.unit === 'm' && b.qty > 0)).toBe(true);
    expect(bom.some((b) => b.item.startsWith('Differenziale puro'))).toBe(true);
    expect(bom.some((b) => b.group === 'Comando motori')).toBe(true);
    expect(bom.filter((b) => b.group === 'Quadri').length).toBe(2);
  });
});

describe('Progetta impianto: planimetria, SPD, sicurezza', () => {
  it('planimetria: lunghezze stimate e bagni dalle posizioni dei punti', () => {
    const p = ex('appartamento');
    const rs = routes(p);
    expect(rs.length).toBe(8);
    for (const r of rs) expect(r.lengthM).toBeGreaterThan(3);
    const q = applyPlan(p);
    const notte = q.lines.find((l) => l.name.startsWith('Prese zona notte'))!;
    expect(notte.bathroom).toBe(true);
    expect(q.lines.find((l) => l.name === 'Prese zona giorno')!.bathroom).toBe(false);
    expect(roomCounts(p).find((c) => c.room.type === 'bagno')!.counts.luce).toBe(1);
    const bom = billOfMaterials(q, computePlant(q));
    expect(bom.some((b) => b.group === 'Punti' && b.qty > 0)).toBe(true);
  });
  it('SPD: verifica informativa e voce nel computo', () => {
    const p = ex('negozio');
    expect(computePlant(p).main.checks.find((c) => c.id === 'spd')!.ref).toContain('443');
    p.spd = 'origine';
    const r = computePlant(p);
    expect(billOfMaterials(p, r).some((b) => b.item.startsWith('Scaricatore'))).toBe(true);
  });
  it('illuminazione di sicurezza: prescrizioni del Cap. 56', () => {
    const p = ex('negozio');
    p.lines.push(line('emergenza', true, {}));
    const r = computePlant(p);
    expect(r.lines[r.lines.length - 1]!.checks.some((c) => c.ref?.includes('563'))).toBe(true);
  });
});
