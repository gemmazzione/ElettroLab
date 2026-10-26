import { catalogItem } from '../model/catalog';
import { WIRE_COLOR_LABEL } from '../model/constants';
import { lineWireIds } from '../model/lineWires';
import { modulesTotal, modulesUsed } from '../model/placement';
import type { ComponentInstance, Project } from '../model/types';

/**
 * Elenco materiali ricavato dal progetto: quantità reali del disegno, senza scarti né accessori
 * (morsetti, capicorda, tubi, scatole) che il simulatore non rappresenta.
 */

export interface BomRow {
  qty: number;
  unit: 'pz' | 'm';
  item: string;
  details: string;
}

export interface BomSection {
  title: string;
  rows: BomRow[];
}

const f = (v: number, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Caratteristiche che identificano l'articolo da ordinare. */
export function itemSpec(c: ComponentInstance): string {
  const pr = c.params;
  switch (pr.kind) {
    case 'mcb':
      return `${pr.p.poles} curva ${pr.p.curve} ${pr.p.in} A, Icn ${f(pr.p.icn, pr.p.icn % 1 ? 1 : 0)} kA`;
    case 'rcbo':
      return `${pr.p.poles} curva ${pr.p.curve} ${pr.p.in} A, IΔn ${pr.p.idn} mA tipo ${pr.p.rcdType}, Icn ${f(pr.p.icn, pr.p.icn % 1 ? 1 : 0)} kA`;
    case 'rcd':
      return `${pr.p.poles} ${pr.p.in} A, IΔn ${pr.p.idn} mA tipo ${pr.p.rcdType}${pr.p.selective ? ' selettivo' : ''}`;
    case 'switch':
      return `${pr.p.poles} ${pr.p.in} A`;
    case 'fuse':
      return `${pr.p.poles}, cartucce gG ${pr.p.in} A 10,3×38`;
    case 'spd':
      return `${pr.p.poles} tipo ${pr.p.spdType}, Uc ${pr.p.uc} V, Up ${f(pr.p.up, 1)} kV, In ${pr.p.inKA} kA`;
    case 'relay':
      return `contatto ${pr.p.in} A, bobina ${pr.p.coilV} V~`;
    case 'contactor':
      return `${pr.p.poles} ${pr.p.in} A, bobina ${pr.p.coilV} V~`;
    case 'voltage-relay':
      return `soglie ${pr.p.umin}–${pr.p.umax} V`;
    case 'psu':
      return `${pr.p.vout} V⎓, ${pr.p.pmaxW} W`;
    case 'dc-switch':
      return `${pr.p.in} A, ${pr.p.maxV} V DC`;
    case 'meter':
      return 'monofase, bidirezionale';
    case 'bar':
      return `${pr.p.barFn}, ${pr.p.ways} vie`;
    case 'inverter':
      return `${f(pr.p.pacW / 1000, 1)} kW, MPPT ${pr.p.mpptMinV}–${pr.p.mpptMaxV} V${pr.p.batteryKWh > 0 ? `, batteria ${f(pr.p.batteryKWh, 1)} kWh` : ''}`;
    case 'load':
      return `${f(pr.p.powerW / 1000, 2)} kW${pr.p.phases === 3 ? ' trifase' : ''}`;
    case 'wall-switch':
      return pr.p.type;
    default:
      return '';
  }
}

function group(items: { item: string; details: string; ref: string }[]): BomRow[] {
  const m = new Map<string, BomRow & { refs: string[] }>();
  for (const x of items) {
    const key = `${x.item}|${x.details}`;
    const r = m.get(key) ?? { qty: 0, unit: 'pz' as const, item: x.item, details: x.details, refs: [] };
    r.qty += 1;
    r.refs.push(x.ref);
    m.set(key, r);
  }
  return [...m.values()].map(({ refs, ...r }) => ({ ...r, details: `${r.details}${r.details ? ' — ' : ''}${refs.join(', ')}` }));
}

export function buildBom(project: Project): BomSection[] {
  const sections: BomSection[] = [];
  const name = (c: ComponentInstance) => catalogItem(c.catalogId).name;

  // Quadri
  sections.push({
    title: 'Quadri',
    rows: project.panels.map((p) => ({
      qty: 1,
      unit: 'pz' as const,
      item: `Quadro ${p.modulesPerRow * p.rows} moduli (${p.rows} × ${p.modulesPerRow})`,
      details: `${p.name}: ${modulesUsed(project, p.id)} moduli occupati${project.panels.length === 1 ? '' : ''}`,
    })),
  });

  // Dispositivi modulari
  const din = project.components.filter((c) => c.rail);
  sections.push({ title: 'Dispositivi modulari', rows: group(din.map((c) => ({ item: name(c), details: itemSpec(c), ref: c.label }))) });

  // Apparecchiature fuori quadro
  const free = project.components.filter((c) => !c.rail && c.params.kind !== 'supply' && c.params.kind !== 'pv-array');
  const freeRows = group(
    free.map((c) => ({
      item: c.params.kind === 'load' ? `${name(c)}: ${c.params.p.name}` : c.params.kind === 'wall-switch' ? `${name(c)}` : name(c),
      details: itemSpec(c),
      ref: c.label,
    })),
  );
  sections.push({ title: 'Apparecchiature e utilizzatori', rows: freeRows });

  // Fotovoltaico: moduli
  const pv = project.components.filter((c) => c.params.kind === 'pv-array');
  if (pv.length) {
    sections.push({
      title: 'Moduli fotovoltaici',
      rows: pv.map((c) => {
        const p = c.params.kind === 'pv-array' ? c.params.p : null!;
        const n = Math.round(p.modulesPerString) * Math.round(p.strings);
        return { qty: n, unit: 'pz' as const, item: `Modulo fotovoltaico ${p.moduleWp} Wp`, details: `${c.label} ${p.name}: ${p.strings} × ${p.modulesPerString}, ${f((n * p.moduleWp) / 1000, 2)} kWp` };
      }),
    });
  }

  // Pettini
  const combs = new Map<string, { type: string; devices: Set<string> }>();
  for (const w of project.wires) {
    if (!w.comb) continue;
    const e = combs.get(w.comb.id) ?? { type: w.comb.type, devices: new Set<string>() };
    e.devices.add(w.from.slice(0, w.from.lastIndexOf(':')));
    e.devices.add(w.to.slice(0, w.to.lastIndexOf(':')));
    combs.set(w.comb.id, e);
  }
  if (combs.size) {
    const byId = new Map(project.components.map((c) => [c.id, c]));
    sections.push({
      title: 'Pettini di collegamento',
      rows: [...combs.values()].map((c) => ({
        qty: 1,
        unit: 'pz' as const,
        item: `Pettine ${c.type}`,
        details: `${c.devices.size} dispositivi: ${[...c.devices].map((id) => byId.get(id)?.label ?? '?').join(', ')}`,
      })),
    });
  }

  // Conduttori: cablaggio del quadro (esclusi pettini e linee degli utilizzatori)
  const lineIds = lineWireIds(project);
  const panelWires = new Map<string, number>();
  for (const w of project.wires) {
    if (w.comb || lineIds.has(w.id)) continue;
    const key = `${w.section}|${w.color}`;
    panelWires.set(key, (panelWires.get(key) ?? 0) + w.length);
  }
  // Linee verso gli utilizzatori: lunghezza della linea × conduttori (fase/i, neutro, PE)
  const lineCable = new Map<string, number>();
  for (const c of project.components) {
    if (c.params.kind !== 'load') continue;
    const p = c.params.p;
    const phases = p.phases === 3 ? ['marrone', 'nero', 'grigio'] : ['marrone'];
    const colors = [...phases, ...(p.phases !== 3 || p.withNeutral ? ['blu'] : []), 'giallo-verde'];
    for (const col of colors) {
      const key = `${p.cableSection}|${col}`;
      lineCable.set(key, (lineCable.get(key) ?? 0) + p.cableLength);
    }
  }
  const cableRows = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => Number(a[0].split('|')[0]) - Number(b[0].split('|')[0]))
      .map(([k, len]) => {
        const [sec, col] = k.split('|') as [string, keyof typeof WIRE_COLOR_LABEL];
        return { qty: Math.ceil(len * 10) / 10, unit: 'm' as const, item: `Cavo unipolare ${f(Number(sec), Number(sec) % 1 ? 1 : 0)} mm²`, details: WIRE_COLOR_LABEL[col] ?? col };
      });
  sections.push({ title: 'Cavi: cablaggio e collegamenti', rows: cableRows(panelWires) });
  sections.push({ title: 'Cavi: linee verso gli utilizzatori', rows: cableRows(lineCable) });

  // Riepilogo moduli DIN
  sections.push({
    title: 'Riepilogo',
    rows: [{ qty: modulesUsed(project), unit: 'pz', item: 'Moduli DIN occupati', details: `su ${modulesTotal(project)} disponibili` }],
  });
  return sections.filter((s) => s.rows.length);
}

/** CSV con separatore «;» (si apre direttamente in Excel con le impostazioni italiane). */
export function bomCsv(project: Project): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['Sezione;Quantità;Unità;Articolo;Caratteristiche e riferimenti'];
  for (const s of buildBom(project)) {
    for (const r of s.rows) lines.push([s.title, f(r.qty, r.unit === 'm' ? 1 : 0), r.unit, r.item, r.details].map(esc).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
