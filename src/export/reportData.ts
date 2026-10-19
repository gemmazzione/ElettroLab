import { checkWiring } from '../graph/erc';
import { catalogItem } from '../model/catalog';
import { modulesUsed, panelOf } from '../model/placement';
import { MODEL_ASSUMPTIONS } from '../model/constants';
import { FAULT_INFO } from '../model/faults';
import type { Project } from '../model/types';
import { PROTECTION_ASSUMPTIONS } from '../protection/curves';
import { buildNormContext } from '../rules/context';
import { runRules } from '../rules/engine';
import { STATUS_LABEL } from '../rules/types';

/** Contenuto della relazione, indipendente dal formato di uscita. */
export interface ReportTable {
  title: string;
  intro?: string;
  head: string[];
  body: string[][];
  /** Larghezze relative delle colonne */
  widths?: number[];
}

export interface ReportData {
  title: string;
  subtitle: string;
  date: string;
  description: string;
  general: [string, string][];
  tables: ReportTable[];
  normSummary: string;
  notes: { title: string; text: string }[];
  disclaimer: string;
}

const f = (v: number, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const fA = (a: number) => (a >= 1000 ? `${f(a / 1000, 2)} kA` : `${f(a, a < 10 ? 2 : 1)} A`);

export const DISCLAIMER =
  'Documento generato da ElectroLab a scopo didattico e di pre-verifica. Non costituisce progetto, dichiarazione di conformità né certificazione; non sostituisce progettazione, installazione e verifiche eseguite da professionisti abilitati. Le verifiche normative si riferiscono a regole verificate sul testo CEI 64-8:2007 (studio storico); la conformità va valutata sull\'edizione vigente della norma.';

export function buildReport(project: Project, now = new Date()): ReportData {
  const ctx = buildNormContext(project);
  const report = runRules(project);
  const issues = checkWiring(project);
  const supply = ctx.supply;
  const earth = ctx.earths[0];
  const byId = new Map(project.components.map((c) => [c.id, c]));

  const general: [string, string][] = [];
  if (supply) {
    const sp = supply.p;
    general.push(['Fornitura', `${sp.phases === 3 ? `Trifase 3F+N 400/${sp.voltage} V` : `Monofase ${sp.voltage} V`} · ${sp.frequency} Hz · sistema TT`]);
    general.push(['Potenza impegnata', `${f(sp.contractKW, sp.contractKW % 1 ? 1 : 0)} kW`]);
    general.push(['Impedenza di rete (anello)', `R = ${f(sp.rNetwork, 3)} Ω · X = ${f(sp.xNetwork, 3)} Ω · RB = ${f(sp.rb, 1)} Ω`]);
    general.push(['Icc presunta ai morsetti (stima)', fA(sp.voltage / Math.hypot(sp.rNetwork, sp.xNetwork))]);
  } else {
    general.push(['Fornitura', 'non presente']);
  }
  general.push(['Impianto di terra', earth && earth.params.kind === 'earth' ? `RA = ${f(earth.params.p.ra, 1)} Ω (${earth.params.p.raMeasured ? 'misurata' : 'valore di progetto'})` : 'assente']);
  for (const panel of project.panels) {
    general.push([
      project.panels.length > 1 ? `Quadro: ${panel.name}` : 'Quadro',
      `${panel.modulesPerRow * panel.rows} moduli (${panel.rows} × ${panel.modulesPerRow}), ${modulesUsed(project, panel.id)} occupati`,
    ]);
  }
  general.push(['Contesto', `${ctx.settings.residential ? 'Locali ad uso abitativo' : 'Locali non abitativi'} · UL = ${ctx.settings.ul} V${ctx.settings.declaredIccKA ? ` · Icc dichiarata ${f(ctx.settings.declaredIccKA, 1)} kA` : ''}`]);
  general.push(['Circuiti utilizzatori', String(ctx.circuits.length)]);

  const devices: ReportTable = {
    title: 'Elenco dei dispositivi',
    head: ['Sigla', 'Dispositivo', 'Caratteristiche', 'Posizione', 'Stato'],
    widths: [10, 30, 32, 16, 12],
    body: project.components
      .filter((c) => c.rail)
      .sort(
        (a, b) =>
          project.panels.indexOf(panelOf(project, a.rail!.panelId)) - project.panels.indexOf(panelOf(project, b.rail!.panelId)) ||
          a.rail!.row - b.rail!.row ||
          a.rail!.slot - b.rail!.slot,
      )
      .map((c) => {
        const pr = c.params;
        let car = '';
        if (pr.kind === 'mcb') car = `${pr.p.poles} ${pr.p.curve}${pr.p.in} · Icn ${f(pr.p.icn, 1)} kA`;
        if (pr.kind === 'rcbo') car = `${pr.p.poles} ${pr.p.curve}${pr.p.in} · Icn ${f(pr.p.icn, 1)} kA · IΔn ${pr.p.idn} mA tipo ${pr.p.rcdType}`;
        if (pr.kind === 'rcd') car = `${pr.p.poles} ${pr.p.in} A · IΔn ${pr.p.idn} mA tipo ${pr.p.rcdType}${pr.p.selective ? ' S' : ''}`;
        if (pr.kind === 'fuse') car = `${pr.p.poles} gG ${pr.p.in} A (10,3×38) · potere di interruzione ${f(pr.p.icn, 0)} kA${c.blown?.length ? ' · CARTUCCIA FUSA' : ''}`;
        if (pr.kind === 'switch') car = `${pr.p.poles} ${pr.p.in} A`;
        if (pr.kind === 'bar') car = `${pr.p.barFn}, ${pr.p.ways} vie`;
        if (pr.kind === 'relay') car = `contatto ${pr.p.in} A · bobina ${pr.p.coilV} V~`;
        if (pr.kind === 'spd') car = `${pr.p.poles} tipo ${pr.p.spdType} · Uc ${pr.p.uc} V · Up ${f(pr.p.up, 1)} kV · In ${pr.p.inKA} kA`;
        const m = catalogItem(c.catalogId).modules;
        const pn = project.panels.length > 1 ? `${panelOf(project, c.rail!.panelId).name}, ` : '';
        const pos = `${pn}guida ${c.rail!.row + 1}, mod. ${c.rail!.slot + 1}${m > 1 ? `-${c.rail!.slot + m}` : ''}`;
        const stato = pr.kind === 'bar' || pr.kind === 'spd' ? '—' : c.closed ? 'chiuso' : 'aperto';
        return [c.label, catalogItem(c.catalogId).name, car, pos, stato];
      }),
  };

  const circuits: ReportTable = {
    title: 'Circuiti utilizzatori',
    intro: 'IB = corrente d\'impiego alla potenza nominale; Iz = portata della conduttura con i fattori di correzione; ΔV = caduta di tensione di progetto con l\'utilizzatore a piena potenza e gli altri utilizzatori contemporanei (' +
      `${project.components.filter((c) => c.params.kind === 'load' && c.params.p.designOn !== false).length} considerati accesi, fattore di contemporaneità ${f((ctx.settings.simultaneity ?? 1) * 100, 0)}%` +
      '); Icc min = cortocircuito franco a fondo linea.',
    head: ['Circuito', 'Fase', 'Protezioni', 'P', 'IB', 'Linea', 'Posa', 'Iz', 'ΔV', 'Icc min'],
    widths: [17, 6, 14, 8, 8, 13, 9, 8, 7, 10],
    body: ctx.circuits.map((c) => {
      const phases = c.info.threePhase ? '3F' : c.info.phases[0] ? `L${c.info.phases[0]}` : '—';
      const prot = c.info.lDevices.map((id) => byId.get(id)?.label ?? '?').join(' › ') || '—';
      const posa = c.install ? `${c.install.method} ${c.install.insulation} ${c.install.ambientC}°C ×${c.install.grouped}` : 'n.d.';
      return [
        `${c.load.label} ${c.p.name}`,
        phases,
        prot,
        `${f(c.p.powerW / 1000, 2)} kW`,
        fA(c.ib),
        `${f(c.p.cableSection, c.p.cableSection % 1 ? 1 : 0)} mm² · ${f(c.p.cableLength, 0)} m`,
        posa,
        c.iz ? `${f(c.iz.value, 1)} A` : 'n.d.',
        c.dropPct === null ? '—' : `${f(c.dropPct, 2)}%`,
        c.iccEnd.ln === null ? '—' : fA(c.iccEnd.ln),
      ];
    }),
  };

  const norm: ReportTable = {
    title: 'Verifiche normative',
    intro: `${report.ruleset.title} (set di regole v${report.ruleset.version}). ${report.summary}`,
    head: ['Area', 'Regola', 'Oggetto', 'Esito', 'Dettaglio', 'Riferimento'],
    widths: [14, 16, 12, 12, 32, 14],
    body: report.outcomes.map((o) => [
      o.rule.area,
      o.rule.title,
      o.subject,
      STATUS_LABEL[o.status],
      o.message,
      o.rule.refs
        .filter((r) => r.verified)
        .map((r) => `${r.edition} ${r.article}`)
        .join('; ') || 'non verificato',
    ]),
  };

  const wiring: ReportTable = {
    title: 'Verifiche di cablaggio',
    head: ['Gravità', 'Problema', 'Dettaglio'],
    widths: [12, 30, 58],
    body: issues.length ? issues.map((i) => [i.severity, i.title, i.message]) : [['—', 'Nessun problema rilevato', 'I controlli di cablaggio disponibili non hanno segnalato problemi.']],
  };

  const tables = [devices, circuits, norm, wiring];
  const visibleFaults = (project.faults ?? []).filter((x) => !x.hidden);
  if (visibleFaults.length) {
    tables.push({
      title: 'Guasti simulati presenti nel progetto',
      head: ['Guasto', 'Su', 'Parametro'],
      widths: [40, 30, 30],
      body: visibleFaults.map((x) => [
        FAULT_INFO[x.type].label,
        byId.get(x.targetId)?.label ?? 'conduttore',
        FAULT_INFO[x.type].resistive ? `Rf ${f(x.resistance, 2)} Ω` : FAULT_INFO[x.type].power ? `+${f(x.powerW ?? 0, 0)} W` : '—',
      ]),
    });
  }

  return {
    title: project.name,
    subtitle: 'Relazione didattica dell\'impianto elettrico',
    date: now.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }),
    description: project.description,
    general,
    tables,
    normSummary: report.summary,
    notes: [...MODEL_ASSUMPTIONS, ...PROTECTION_ASSUMPTIONS],
    disclaimer: DISCLAIMER,
  };
}

/** Testo nell'insieme di caratteri dei font PDF standard (WinAnsi): sostituisce i simboli non disponibili. */
export function pdfSafe(s: string): string {
  const map: Record<string, string> = {
    'Ω': 'ohm',
    'Δ': 'D',
    '≤': '<=',
    '≥': '>=',
    '√': 'rad',
    '→': '->',
    '←': '<-',
    '›': '>',
    '′': "'",
    '–': '-',
    '—': '-',
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '…': '...',
    '•': '-',
    '●': '-',
    '✓': 'OK',
    '✗': 'X',
    '⚠': '!',
    '€': 'EUR',
    '·': '·',
  };
  let out = '';
  for (const ch of s) {
    if (map[ch] !== undefined) out += map[ch];
    else out += ch.charCodeAt(0) <= 255 ? ch : '?';
  }
  return out;
}
