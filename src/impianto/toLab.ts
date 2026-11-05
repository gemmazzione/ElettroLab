import { cabinImpedance } from '../model/cabin';
import { catalogItem } from '../model/catalog';
import type { ComponentInstance, Project, WireSection } from '../model/types';
import { ProjectBuilder, t } from '../projects/demos';
import { computePlant, f, isMccb, SECTIONS, sourceImpedance, type LineResult } from './calc';
import { isThreePhaseSupply, type Plant } from './model';

/**
 * Quadro generale del progetto ricostruito nel laboratorio, per simularlo: fornitura, generale, differenziali
 * (generale, di gruppo e di linea), interruttori delle linee e utilizzatori con i cavi calcolati. I sottoquadri
 * diventano un utilizzatore con la loro potenza contemporanea (il laboratorio li simula come carico unico).
 */

const LOAD_ID: Record<string, string> = { luce: 'load-luce', prese: 'load-prese', cucina: 'load-forno', scaldabagno: 'load-boiler', clima: 'load-clima' };
const labSection = (s: number): WireSection => [...SECTIONS].reverse().find((x) => x <= s) ?? 1.5;

export function plantToProject(p: Plant): Project {
  const r = computePlant(p);
  const tri = isThreePhaseSupply(p);
  const tn = p.earthing === 'TN-S';
  const main = r.boards[0]!;
  const b = new ProjectBuilder(p.name, 4, 24);
  b.project.panels[0]!.name = 'Quadro generale';
  b.project.norm = { residential: p.use === 'abitazione' || p.use === 'condominio', ul: 50 };
  const subs = main.lines.filter((x) => x.sub);
  b.project.description =
    `Generato da «Progetta impianto»: quadro generale di «${p.name}» con ${main.lines.length} linee, protezioni e cavi del dimensionamento. ` +
    (subs.length ? `I sottoquadri (${subs.map((x) => x.line.name).join(', ')}) sono rappresentati come un carico con la loro potenza contemporanea. ` : '') +
    'Le potenze degli utilizzatori sono quelle assorbite (P · ku). Avvia la simulazione e chiudi il generale.';

  // Posizioni sulla guida DIN, una dopo l'altra
  let row = 0;
  let slot = 0;
  const place = (id: string) => {
    const m = catalogItem(id).modules || 1;
    if (slot + m > 24) {
      row++;
      slot = 0;
    }
    const at = { row, slot };
    slot += m;
    return { rail: at };
  };
  const setBreaker = (c: ComponentInstance, inA: number, curve: 'B' | 'C' | 'D', icu: number | null) => {
    if (c.params.kind === 'mcb') c.params.p = { ...c.params.p, in: inA, curve, icn: icu ?? c.params.p.icn, ...(isMccb(inA) ? { ir: inA, im: 10 } : {}) };
    if (c.params.kind === 'rcbo') c.params.p = { ...c.params.p, in: inA, curve, icn: icu ?? c.params.p.icn };
  };
  const setRcd = (c: ComponentInstance, idn: number, type: string, inA?: number) => {
    if (c.params.kind === 'rcd') c.params.p = { ...c.params.p, idn, rcdType: type as never, ...(inA ? { in: inA } : {}) };
  };
  const breakerId = (inA: number, phases: 1 | 3, neutral: boolean) =>
    isMccb(inA) ? (inA > 160 || neutral ? (inA > 250 ? 'mccb-4p-630' : 'mccb-4p-250') : 'mccb-3p-160') : phases === 1 ? 'mcb-1pn' : neutral ? 'mcb-4p' : 'mcb-3p';

  // Fornitura
  const src = sourceImpedance(p);
  const sup = b.add(p.supply.kind === 'cabina' ? 'supply-cabina' : tri ? 'supply-tri' : 'supply-mono', { position: { x: -320, y: 30 } }, (c) => {
    if (c.params.kind !== 'supply') return;
    if (p.supply.kind === 'cabina') {
      const z = cabinImpedance(p.supply.kva, p.supply.ukPct, p.supply.mvSccMVA);
      c.params.p = { ...c.params.p, transformerKVA: p.supply.kva, ukPct: p.supply.ukPct, mvSccMVA: p.supply.mvSccMVA, rNetwork: z.rNetwork, xNetwork: z.xNetwork, contractKW: Math.round(p.supply.kva * 0.9) };
    } else c.params.p = { ...c.params.p, contractKW: p.supply.contractKW, rNetwork: src.loop.r, xNetwork: src.loop.x };
  });
  const earth = tn
    ? null
    : b.add('earth', { position: { x: -300, y: 440 } }, (c) => {
        if (c.params.kind === 'earth') c.params.p = { ...c.params.p, ra: p.raOhm };
      });
  const nPh = tri ? 3 : 1;
  const inK = (i: number) => `p${i}_in`;
  const outK = (i: number) => `p${i}_out`;
  /** Ingressi di un dispositivo: fasi (0..nPh-1) e neutro (indice nPh). */
  const mainIn = r.main.inA ?? 32;
  const qgId = isMccb(mainIn) ? breakerId(mainIn, 3, true) : tri ? 'mcb-4p' : 'mcb-2p';
  const qg = b.add(qgId, place(qgId), (c) => {
    c.label = 'QG';
    setBreaker(c, mainIn, 'C', r.main.icuKA);
  });
  const fsec = labSection((r.main.section ?? 10) * r.main.parallel);
  const supKeys = tri ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
  supKeys.forEach((k, i) => b.wire(t(sup, k), t(qg, inK(i)), fsec, p.feeder.lengthM));
  // Sbarra di distribuzione: uscite del generale o del differenziale generale
  let bus = qg;
  if (p.mainRcdMa) {
    const rd = b.add(tri ? 'rcd-4p' : 'rcd-2p', place(tri ? 'rcd-4p' : 'rcd-2p'), (c) => {
      c.label = 'QD0';
      c.closed = true;
      setRcd(c, p.mainRcdMa, 'A', mainIn <= 63 ? Math.max(40, mainIn) : undefined);
    });
    for (let i = 0; i <= nPh; i++) b.wire(t(qg, outK(i)), t(rd, inK(i)), fsec, 0.2);
    bus = rd;
  }
  const busOut = (dev: ComponentInstance, i: number) => t(dev, outK(i));

  // Barre PE
  const peBars: ComponentInstance[] = [];
  let peWay = 8;
  const peTerm = () => {
    if (peWay >= 8) {
      const bar = b.add('bar-pe-8', place('bar-pe-8'));
      if (earth) b.wire(t(earth, 'PE'), t(bar, 't0'), 16, 5);
      else b.wire(t(sup, 'PE'), t(bar, 't0'), labSection(r.earth.peMaxMm2 || 16), p.feeder.lengthM);
      peBars.push(bar);
      peWay = 1;
    }
    return t(peBars[peBars.length - 1]!, `t${peWay++}`);
  };

  // Differenziali di gruppo del quadro generale
  const groupDev = new Map<string, ComponentInstance>();
  for (const g of r.groups.filter((x) => x.group.boardId === '' && x.lines.length)) {
    const four = g.poles === 4 && tri;
    const rd = b.add(four ? 'rcd-4p' : 'rcd-2p', place(four ? 'rcd-4p' : 'rcd-2p'), (c) => {
      c.label = g.group.name.slice(0, 12);
      c.closed = true;
      setRcd(c, g.group.idnMa, g.group.type, g.inA);
    });
    if (four) for (let i = 0; i <= 3; i++) b.wire(busOut(bus, i), t(rd, inK(i)), 10, 0.3);
    else {
      const ph = (g.lines.find((x) => x.phase)?.phase ?? 1) - 1;
      b.wire(busOut(bus, tri ? ph : 0), t(rd, inK(0)), 10, 0.3).wire(busOut(bus, tri ? 3 : 1), t(rd, inK(1)), 10, 0.3);
    }
    groupDev.set(g.group.id, rd);
  }

  // Linee del quadro generale
  main.lines.forEach((lr: LineResult, i) => {
    const l = lr.line;
    const inA = lr.inA ?? 16;
    const sec = labSection((lr.section ?? 2.5) * lr.parallel);
    const mono = l.phases === 1;
    const neutral = mono || l.withNeutral;
    const grp = l.rcdGroup ? groupDev.get(l.rcdGroup) : undefined;
    const ownRcd = !l.rcdGroup && l.rcdMa > 0;
    const useRcbo = mono && ownRcd && inA <= 32 && !isMccb(inA);
    const devId = useRcbo ? 'rcbo-1pn' : breakerId(inA, l.phases, neutral);
    const q = b.add(devId, place(devId), (c) => {
      c.label = lr.tag;
      c.closed = true;
      setBreaker(c, inA, l.curve, lr.icuKA);
      if (useRcbo && c.params.kind === 'rcbo') c.params.p = { ...c.params.p, idn: l.rcdMa, rcdType: l.rcdType as never };
    });
    // Alimentazione dell'interruttore: dal differenziale di gruppo o dalla sbarra
    const ph = (lr.phase ?? 1) - 1;
    const src4 = grp ?? bus;
    const grp2 = grp && catalogItem(grp.catalogId).id === 'rcd-2p';
    if (mono) {
      if (grp2) b.wire(t(src4, outK(0)), t(q, inK(0)), sec, 0.2).wire(t(src4, outK(1)), t(q, inK(1)), sec, 0.2);
      else b.wire(busOut(src4, tri ? ph : 0), t(q, inK(0)), sec, 0.2).wire(busOut(src4, tri ? 3 : 1), t(q, inK(1)), sec, 0.2);
    } else for (let k = 0; k < (neutral ? 4 : 3); k++) b.wire(busOut(src4, k), t(q, inK(k)), sec, 0.2);
    let out = q;
    if (ownRcd && !useRcbo) {
      const rd = b.add(mono ? 'rcd-2p' : 'rcd-4p', place(mono ? 'rcd-2p' : 'rcd-4p'), (c) => {
        c.closed = true;
        setRcd(c, l.rcdMa, l.rcdType, Math.max(25, Math.min(125, inA)));
      });
      for (let k = 0; k < (mono ? 2 : neutral ? 4 : 3); k++) b.wire(t(q, outK(k)), t(rd, inK(k)), sec, 0.2);
      out = rd;
    }
    // Utilizzatore
    const pw = lr.sub ? lr.sub.simultaneousW : l.powerW * l.ku;
    const cat = mono ? (LOAD_ID[l.kind] ?? 'load-generico') : 'load-tri';
    const u = b.add(cat, { position: { x: -80 + i * 200, y: 0 } }, (c) => {
      if (c.params.kind !== 'load') return;
      c.params.p = {
        ...c.params.p,
        name: lr.sub ? `${l.name} (sottoquadro)` : l.name,
        powerW: Math.round(pw),
        cosPhi: lr.cosPhi,
        cableLength: l.lengthM,
        cableSection: sec,
        install: { method: l.method, insulation: l.insulation, ambientC: l.ambientC, grouped: l.grouped },
        ...(mono ? {} : { phases: 3 as const, withNeutral: l.withNeutral }),
        ...(l.kind === 'prese' ? { hasSockets: true, socketRating: 16 } : {}),
      };
    });
    if (mono) b.wire(t(out, outK(0)), t(u, 'L'), sec, 0.4).wire(t(out, outK(1)), t(u, 'N'), sec, 0.4);
    else {
      for (let k = 0; k < 3; k++) b.wire(t(out, outK(k)), t(u, `L${k + 1}`), sec, 0.4);
      if (l.withNeutral) b.wire(t(out, outK(3)), t(u, 'N'), sec, 0.4);
    }
    b.wire(peTerm(), t(u, 'PE'), labSection(lr.peSection ?? sec), 0.5);
  });
  // Quadro con le sole file usate; utilizzatori sotto il quadro.
  b.project.panels[0]!.rows = row + 1;
  const yLoads = 760 + row * 150;
  for (const c of b.project.components) if (c.params.kind === 'load' && c.position) c.position = { ...c.position, y: yLoads };
  b.project.description += ` Potenza contemporanea di progetto ${f(r.balance.simultaneousW / 1000, 1)} kW.`;
  return b.project;
}
