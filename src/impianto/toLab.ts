import { cabinImpedance } from '../model/cabin';
import { catalogItem } from '../model/catalog';
import type { ComponentInstance, Project, WireSection } from '../model/types';
import { ProjectBuilder, t } from '../projects/demos';
import { computePlant, f, isMccb, SECTIONS, sourceImpedance, type LineResult, type PlantResult } from './calc';
import { isThreePhaseSupply, type Plant } from './model';

/**
 * Impianto del progetto ricostruito nel laboratorio, per simularlo: fornitura, quadro generale con generale,
 * differenziali (generale, di gruppo e di linea), SPD e interruttori delle linee, un quadro per ogni sottoquadro
 * (sezionatore generale e sue linee) e gli utilizzatori con i cavi calcolati.
 */

const LOAD_ID: Record<string, string> = { luce: 'load-luce', emergenza: 'load-luce', prese: 'load-prese', cucina: 'load-forno', scaldabagno: 'load-boiler', clima: 'load-clima' };
const labSection = (s: number): WireSection => [...SECTIONS].reverse().find((x) => x <= s) ?? 1.5;
const MODULES = 24;

export function plantToProject(p: Plant): Project {
  const r = computePlant(p);
  const tri = isThreePhaseSupply(p);
  const tn = p.earthing === 'TN-S';
  const b = new ProjectBuilder(p.name, 4, MODULES);
  b.project.panels[0]!.name = 'Quadro generale';
  b.project.norm = { residential: p.use === 'abitazione' || p.use === 'condominio', ul: 50 };
  b.project.description =
    `Generato da «Progetta impianto»: «${p.name}» con ${r.boards.length > 1 ? `${r.boards.length} quadri` : 'il quadro generale'}, ${r.lines.length} linee, protezioni e cavi del dimensionamento. ` +
    'Le potenze degli utilizzatori sono quelle assorbite (P · ku). Avvia la simulazione e chiudi il generale.';

  const setBreaker = (c: ComponentInstance, inA: number, curve: 'B' | 'C' | 'D', icu: number | null) => {
    if (c.params.kind === 'mcb') c.params.p = { ...c.params.p, in: inA, curve, icn: icu ?? c.params.p.icn, ...(isMccb(inA) ? { ir: inA, im: 10 } : {}) };
    if (c.params.kind === 'rcbo') c.params.p = { ...c.params.p, in: inA, curve, icn: icu ?? c.params.p.icn };
  };
  const setRcd = (c: ComponentInstance, idn: number, type: string, inA?: number) => {
    if (c.params.kind === 'rcd') c.params.p = { ...c.params.p, idn, rcdType: type as never, ...(inA ? { in: inA } : {}) };
  };
  const breakerId = (inA: number, phases: 1 | 3, neutral: boolean) =>
    isMccb(inA) ? (inA > 160 || neutral ? (inA > 250 ? 'mccb-4p-630' : 'mccb-4p-250') : 'mccb-3p-160') : phases === 1 ? 'mcb-1pn' : neutral ? 'mcb-4p' : 'mcb-3p';
  const inK = (i: number) => `p${i}_in`;
  const outK = (i: number) => `p${i}_out`;

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

  /** Un quadro del laboratorio: posizioni sulla guida, barre PE, linee e utilizzatori. */
  function board(boardId: string, panelId: string | undefined, bus: ComponentInstance, busTri: boolean, peFeed: (bar: ComponentInstance) => void, loadsX: number, res: PlantResult) {
    let row = 0;
    let slot = 0;
    const place = (id: string) => {
      const m = catalogItem(id).modules || 1;
      if (slot + m > MODULES) {
        row++;
        slot = 0;
      }
      const at = { row, slot, ...(panelId ? { panelId } : {}) };
      slot += m;
      return { rail: at };
    };
    // Il primo dispositivo (generale o sezionatore) è già sulla guida: si parte dopo.
    slot = catalogItem(bus.catalogId).modules || 4;
    const busOut = (dev: ComponentInstance, i: number) => t(dev, outK(i));
    const nPh = busTri ? 3 : 1;
    const bd = res.boards.find((x) => x.id === boardId)!;
    let bus2 = bus;
    // Differenziale generale (solo quadro generale)
    if (!boardId && p.mainRcdMa) {
      const rd = b.add(busTri ? 'rcd-4p' : 'rcd-2p', place(busTri ? 'rcd-4p' : 'rcd-2p'), (c) => {
        c.label = 'QD0';
        c.closed = true;
        setRcd(c, p.mainRcdMa, 'A', (res.main.inA ?? 40) <= 63 ? Math.max(40, res.main.inA ?? 40) : undefined);
      });
      for (let i = 0; i <= nPh; i++) b.wire(t(bus, outK(i)), t(rd, inK(i)), 10, 0.2);
      bus2 = rd;
    }
    // Barre PE del quadro
    const bars: ComponentInstance[] = [];
    let way = 8;
    const peTerm = () => {
      if (way >= 8) {
        const bar = b.add('bar-pe-8', place('bar-pe-8'));
        peFeed(bar);
        bars.push(bar);
        way = 1;
      }
      return t(bars[bars.length - 1]!, `t${way++}`);
    };
    // SPD
    if (p.spd !== 'nessuno' && (!boardId || p.spd === 'origine-sottoquadri')) {
      const spd = b.add(busTri ? 'spd-3pn' : 'spd-1pn', place(busTri ? 'spd-3pn' : 'spd-1pn'));
      const keys = busTri ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
      keys.forEach((k, i) => b.wire(busOut(bus2, i), t(spd, k), 6, 0.3));
      b.wire(peTerm(), t(spd, 'PE'), 6, 0.3);
    }
    // Differenziali di gruppo del quadro
    const groupDev = new Map<string, ComponentInstance>();
    for (const g of res.groups.filter((x) => x.group.boardId === boardId && x.lines.length)) {
      const four = g.poles === 4 && busTri;
      const rd = b.add(four ? 'rcd-4p' : 'rcd-2p', place(four ? 'rcd-4p' : 'rcd-2p'), (c) => {
        c.label = g.group.name.slice(0, 12);
        c.closed = true;
        setRcd(c, g.group.idnMa, g.group.type, g.inA);
      });
      if (four) for (let i = 0; i <= 3; i++) b.wire(busOut(bus2, i), t(rd, inK(i)), 10, 0.3);
      else {
        const ph = (g.lines.find((x) => x.phase)?.phase ?? 1) - 1;
        b.wire(busOut(bus2, busTri ? ph : 0), t(rd, inK(0)), 10, 0.3).wire(busOut(bus2, busTri ? 3 : 1), t(rd, inK(1)), 10, 0.3);
      }
      groupDev.set(g.group.id, rd);
    }
    // Linee
    bd.lines.forEach((lr: LineResult, i) => {
      const l = lr.line;
      const inA = lr.inA ?? 16;
      const sec = labSection((lr.section ?? 2.5) * lr.parallel);
      const mono = l.phases === 1;
      const neutral = mono || l.withNeutral || !!lr.sub;
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
      const ph = (lr.phase ?? 1) - 1;
      const from = grp ?? bus2;
      const grp2 = grp && grp.catalogId === 'rcd-2p';
      if (mono) {
        if (grp2) b.wire(t(from, outK(0)), t(q, inK(0)), sec, 0.2).wire(t(from, outK(1)), t(q, inK(1)), sec, 0.2);
        else b.wire(busOut(from, busTri ? ph : 0), t(q, inK(0)), sec, 0.2).wire(busOut(from, busTri ? 3 : 1), t(q, inK(1)), sec, 0.2);
      } else for (let k = 0; k < (neutral ? 4 : 3); k++) b.wire(busOut(from, k), t(q, inK(k)), sec, 0.2);
      let out = q;
      if (ownRcd && !useRcbo) {
        const rd = b.add(mono ? 'rcd-2p' : 'rcd-4p', place(mono ? 'rcd-2p' : 'rcd-4p'), (c) => {
          c.closed = true;
          setRcd(c, l.rcdMa, l.rcdType, Math.max(25, Math.min(125, inA)));
        });
        for (let k = 0; k < (mono ? 2 : neutral ? 4 : 3); k++) b.wire(t(q, outK(k)), t(rd, inK(k)), sec, 0.2);
        out = rd;
      }
      if (lr.sub) {
        // Sottoquadro: nuovo pannello con sezionatore generale e le sue linee
        const subTri = l.phases === 3;
        const pid = b.addPanel(l.name, MODULES, 3);
        const sw = b.add(subTri ? 'switch-4p' : 'switch-2p', { rail: { panelId: pid, row: 0, slot: 0 } }, (c) => {
          c.label = `${lr.tag}.0`;
          c.closed = true;
        });
        for (let k = 0; k < (subTri ? 4 : 2); k++) b.wire(t(out, outK(k)), t(sw, inK(k)), sec, l.lengthM);
        const myPe = peTerm();
        board(l.id, pid, sw, subTri, (bar) => b.wire(myPe, t(bar, 't0'), labSection(lr.peSection ?? sec), l.lengthM), loadsX + 1100, res);
        return;
      }
      const pw = l.powerW * l.ku;
      const cat = mono ? (LOAD_ID[l.kind] ?? 'load-generico') : 'load-tri';
      const u = b.add(cat, { position: { x: loadsX + i * 200, y: 0 } }, (c) => {
        if (c.params.kind !== 'load') return;
        c.params.p = {
          ...c.params.p,
          name: l.name,
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
      boardLoads.push({ u, panelId });
    });
    const panel = panelId ? b.project.panels.find((x) => x.id === panelId) : b.project.panels[0];
    if (panel) panel.rows = row + 1;
  }

  const boardLoads: { u: ComponentInstance; panelId: string | undefined }[] = [];
  // Quadro generale
  const mainIn = r.main.inA ?? 32;
  const qgId = isMccb(mainIn) ? breakerId(mainIn, 3, true) : tri ? 'mcb-4p' : 'mcb-2p';
  const qg = b.add(qgId, { rail: { row: 0, slot: 0 } }, (c) => {
    c.label = 'QG';
    setBreaker(c, mainIn, 'C', r.main.icuKA);
  });
  const fsec = labSection((r.main.section ?? 10) * r.main.parallel);
  (tri ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N']).forEach((k, i) => b.wire(t(sup, k), t(qg, inK(i)), fsec, p.feeder.lengthM));
  board('', undefined, qg, tri, (bar) => (earth ? b.wire(t(earth, 'PE'), t(bar, 't0'), 16, 5) : b.wire(t(sup, 'PE'), t(bar, 't0'), labSection(r.earth.peMaxMm2 || 16), p.feeder.lengthM)), -80, r);

  // Utilizzatori sotto il loro quadro
  for (const { u, panelId } of boardLoads) {
    const panel = (panelId ? b.project.panels.find((x) => x.id === panelId) : b.project.panels[0])!;
    const i = boardLoads.filter((x) => x.panelId === panelId).indexOf(boardLoads.find((x) => x.u === u)!);
    u.position = { x: panel.origin.x - 60 + i * 200, y: panel.origin.y + 260 + panel.rows * 150 };
  }
  b.project.description += ` Potenza contemporanea di progetto ${f(r.balance.simultaneousW / 1000, 1)} kW.`;
  return b.project;
}
