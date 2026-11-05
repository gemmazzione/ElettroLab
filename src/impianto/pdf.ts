import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfSafe } from '../export/reportData';
import { billOfMaterials, f, fA, type BomRow, type PlantResult } from './calc';
import { DEVICE_LABEL, KIND_LABEL, SUPPLY_LABEL, USE_LABEL, type Plant } from './model';
import { planExtent, routes } from './plan';
import { singleLine, type Diagram } from './unifilare';
import { multiLine, WIRE_PRINT } from './multifilare';

const MARGIN = 14;
const INK: [number, number, number] = [20, 24, 32];
const MUTED: [number, number, number] = [95, 100, 110];
const T = (s: string) => pdfSafe(s.replace(/φ/g, 'phi').replace(/≫/g, '>>').replace(/Σ/g, 'somma '));
const TONE: Record<string, [number, number, number]> = { ok: [22, 163, 74], info: [2, 132, 199], warn: [202, 138, 4], error: [220, 38, 38] };
const STATUS: Record<string, string> = { ok: 'OK', info: 'In opera', warn: 'Attenzione', error: 'Da correggere' };

export const pdfName = (p: Plant) => `${p.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'impianto'}_relazione.pdf`;

/** Relazione tecnica del progetto: dati, bilancio delle potenze, dimensionamento delle linee, verifiche, schema unifilare. */
export function buildPlantPdf(p: Plant, r: PlantResult): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = MARGIN + 4;
  const heading = (title: string, intro?: string) => {
    y += 9;
    if (y > 250) {
      doc.addPage('a4', 'portrait');
      y = MARGIN + 6;
    }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(T(title), MARGIN, y);
    y += 2;
    if (intro) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
      const lines = doc.splitTextToSize(T(intro), 182);
      doc.text(lines, MARGIN, y + 4);
      y += lines.length * 3.8 + 2;
    }
  };
  const table = (head: string[], body: string[][], kv = false, opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y + 2,
      head: head.length ? [head.map(T)] : undefined,
      body: body.map((row) => row.map(T)),
      theme: kv ? 'grid' : 'striped',
      styles: { fontSize: 7.5, cellPadding: 1.3, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
      columnStyles: kv ? { 0: { cellWidth: 62, fontStyle: 'bold' } } : {},
      margin: { left: MARGIN, right: MARGIN },
      ...opts,
    });
    y = lastY();
  };

  // Intestazione
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
  doc.text(T('Relazione tecnica dell\'impianto elettrico'), MARGIN, y + 2);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED);
  doc.text(T(`${p.name} - ${new Date().toLocaleDateString('it-IT')}`), MARGIN, y + 8);
  y += 10;
  doc.setFontSize(7.5);
  const disclaimer = doc.splitTextToSize(
    T('Documento di studio generato da ElectroLab. Non è un progetto ai sensi del DM 37/2008: i valori (portate, curve, poteri di interruzione) vanno verificati sulle norme vigenti e sui dati dei costruttori, e il progetto va firmato da chi ne ha titolo. Le verifiche richiamano la CEI 64-8:2007 (6a ed.), sostituita dalla IX edizione.'),
    182,
  );
  doc.text(disclaimer, MARGIN, y + 4);
  y += disclaimer.length * 3.3 + 2;

  heading('1. Dati generali');
  table(
    [],
    [
      ['Committente', p.client || '-'],
      ['Ubicazione', p.address || '-'],
      ['Progettista', p.designer || '-'],
      ['Destinazione d\'uso', `${USE_LABEL[p.use]}, ${f(p.areaM2, 0)} m²`],
      ['Fornitura', SUPPLY_LABEL[p.supply.kind]],
      p.supply.kind === 'cabina'
        ? ['Trasformatore', `${p.supply.kva} kVA, ucc ${f(p.supply.ukPct, 1)}%, Scc rete MT ${p.supply.mvSccMVA} MVA`]
        : ['Potenza impegnata', `${f(p.supply.contractKW, 1)} kW; Icc presunta al punto di consegna ${f(p.supply.iccKA, 1)} kA (dato del distributore)`],
      ['Sistema di distribuzione', p.earthing === 'TT' ? `TT, resistenza di terra RA = ${f(p.raOhm, 0)} ohm` : 'TN-S (PE dal centro stella del trasformatore)'],
      ['Caduta di tensione ammessa', `${f(p.maxDropPct, 1)}% dall'origine all'utilizzatore`],
      ['Quadri', r.boards.map((b) => b.name).join(', ')],
      ['Scaricatori di sovratensione', p.spd === 'nessuno' ? 'nessuno (necessità da valutazione del rischio CEI EN 62305-2)' : p.spd === 'origine' ? "all'origine dell'impianto" : "all'origine e nei sottoquadri"],
      ['Differenziale sul generale', p.mainRcdMa ? `${p.mainRcdMa} mA${p.mainRcdS ? ' selettivo (S)' : ''}` : 'nessuno'],
      ['Progetto da professionista (DM 37/2008 art. 5)', r.dm.required ? `Sì: ${r.dm.reasons.join('; ')}` : 'No, secondo i dati inseriti (progetto del responsabile tecnico dell\'impresa installatrice)'],
    ],
    true,
  );

  heading('2. Bilancio delle potenze', `Potenza contemporanea = kc · somma (P · ku), con kc = ${f(p.kc, 2)} sul quadro generale.`);
  const b = r.balance;
  table(
    [],
    [
      ['Potenza installata', `${f(b.installedW / 1000, 1)} kW`],
      ['Potenza assorbita (con ku)', `${f(b.absorbedW / 1000, 1)} kW`],
      ['Potenza contemporanea', `${f(b.simultaneousW / 1000, 1)} kW, cos phi medio ${f(b.cosPhi, 2)}`],
      ['Corrente d\'impiego del generale', b.phaseA.length === 3 ? `${b.phaseA.map((v, i) => `L${i + 1} ${f(v, 1)} A`).join(' · ')} (squilibrio ${f(b.unbalance * 100, 0)}%)` : `${f(b.ibA, 1)} A`],
      ['Icc presunta sul quadro generale', fA(r.source.iccMaxA)],
      ['Interruttore generale', r.main.inA ? `In ${r.main.inA} A, potere di interruzione ${r.main.icuKA ?? '-'} kA` : '-'],
      ['Rifasamento', p.pfcKvar ? `${p.pfcKvar} kvar (cos phi da ${f(r.pfc.cosPhiBefore, 2)} a ${f(b.cosPhi, 2)})` : r.pfc.suggestedKvar ? `nessuno; per cos phi 0,95 servono circa ${f(r.pfc.neededKvar, 1)} kvar` : 'non necessario'],
      ['Linea di alimentazione', r.main.section ? `${r.main.parallel > 1 ? `${r.main.parallel} x ` : ''}${f(r.main.section, 0)} mm², ${f(p.feeder.lengthM, 0)} m, posa ${p.feeder.method}, ${p.feeder.insulation}; caduta ${f(r.main.dropPct, 2)}%` : '-'],
    ],
    true,
  );
  if (r.main.checks.some((c) => c.status !== 'ok')) {
    table(['Verifica', 'Esito'], r.main.checks.filter((c) => c.status !== 'ok').map((c) => [c.label, `${STATUS[c.status]}: ${c.text}`]));
  }

  heading('3. Dimensionamento delle linee', 'Ib ≤ In ≤ Iz (433.2); portate IEC 60364-5-52 All. B con k1 (temperatura) e k2 (raggruppamento), da verificare su CEI-UNEL 35024/1 o sul catalogo del cavo.');
  for (const bd of r.boards) {
  if (r.boards.length > 1) {
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
    doc.text(T(bd.feeder ? `${bd.name} (alimentato da ${bd.feeder.tag}, Icc al quadro ${fA(bd.lines[0]?.iccOriginA ?? 0)})` : bd.name), MARGIN, y + 7);
    y += 6;
  }
  table(
    ['N.', 'Linea', 'P kW', 'ku', 'cos phi', 'Ib A', 'Protezione', 'Diff.', 'Cavo', 'L m', 'Posa', 'Iz A', 'DV %', 'Icc min', 'Esito'],
    bd.lines.map((lr) => {
      const l = lr.line;
      return [
        lr.tag,
        `${l.name}${lr.phase ? ` (L${lr.phase})` : ''}`,
        f(l.powerW / 1000, 1),
        f(l.ku, 2),
        f(l.cosPhi, 2),
        f(lr.ibA, 1),
        lr.inA ? `${lr.inA > 63 ? 'In ' : l.curve}${lr.inA} ${l.phases === 3 ? '4P' : '1P+N'} ${lr.icuKA ?? '-'} kA` : '-',
        l.rcdGroup ? `gruppo ${p.rcdGroups.find((g) => g.id === l.rcdGroup)?.name ?? ''}` : l.rcdMa ? `${l.rcdMa} mA ${l.rcdType}` : '-',
        lr.designation,
        f(l.lengthM, 0),
        `${l.method} ${l.insulation}`,
        lr.izA ? f(lr.izA, 1) : '-',
        f(lr.dropTotPct, 2),
        lr.iccMinA ? fA(lr.iccMinA) : '-',
        STATUS[lr.status]!,
      ];
    }),
    false,
    {
      styles: { fontSize: 6.5, cellPadding: 1, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.5 },
      columnStyles: { 1: { cellWidth: 28 } },
      didParseCell: (d: { section: string; column: { index: number }; cell: { raw: unknown; styles: { textColor: unknown } } }) => {
        if (d.section === 'body' && d.column.index === 14) {
          const k = Object.keys(STATUS).find((s) => STATUS[s] === d.cell.raw);
          if (k) d.cell.styles.textColor = TONE[k];
        }
      },
    },
  );
  }
  if (r.groups.length) {
    heading('Differenziali di gruppo', 'Selettività tra differenziali in serie: a monte tipo S con IΔn almeno 3 volte quella a valle (CEI 64-8:2007 536.3, commento).');
    table(['Differenziale', 'Quadro', 'Caratteristiche', 'Linee protette'], r.groups.map((g) => [g.group.name, g.boardName, `${g.poles}P In ${g.inA} A, ${g.group.idnMa} mA tipo ${g.group.type}${g.group.s ? ' S' : ''}`, g.lines.map((x) => x.tag).join(', ') || '-']));
  }

  heading('4. Verifiche per linea');
  for (const lr of r.lines) {
    if (y > 260) {
      doc.addPage('a4', 'portrait');
      y = MARGIN;
    }
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
    doc.text(T(`${lr.tag} - ${lr.line.name} (${KIND_LABEL[lr.line.kind]})`), MARGIN, y + 6);
    y += 6;
    table([], lr.checks.map((c) => [`${c.label}${c.ref ? `\n${c.ref}` : ''}`, `${STATUS[c.status]}: ${c.text}`]), true, { columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } } });
  }

  heading('5. Impianto di terra');
  table([], r.earth.checks.map((c) => [`${c.label}${c.ref ? `\n${c.ref}` : ''}`, `${STATUS[c.status]}: ${c.text}`]), true, { columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } } });

  heading('6. Computo dei materiali', 'Quantità ricavate dal progetto, senza prezzi e senza sfridi.');
  table(['Voce', 'Materiale', 'Quantità'], billOfMaterials(p, r).map((b) => [b.group, b.item, `${f(b.qty, 0)} ${b.unit}`]), false, { columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 24 } } });

  heading('7. Ipotesi di calcolo e limiti');
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...INK);
  const notes = [
    'Resistività del rame a 70 °C (0,0214 ohm·mm²/m), reattanza dei cavi 0,08 mohm/m; impedenze sommate con parte resistiva e reattiva.',
    p.supply.kind === 'cabina'
      ? 'Impedenza a monte dalla cabina (IEC 60909): rete MT Zq = 1,1·U²/Scc, trasformatore Zt = ucc·U²/Sn; anello fase-neutro/fase-PE pari al doppio dell\'impedenza di fase.'
      : 'Impedenza della rete a monte ricavata dall\'Icc dichiarata dal distributore, con R = X (ipotesi).',
    'Correnti delle linee sommate aritmeticamente sulle fasi (cautelativo); linee monofase distribuite sulle fasi meno cariche se non indicato.',
    'Potere di interruzione scelto sull\'Icc massima al quadro generale (cautelativo). Con la protezione dal sovraccarico e Icu adeguato la linea è protetta anche dal cortocircuito (435.1), salvo interruttori non limitatori: verificare I²t sui dati del costruttore.',
    'Soglie magnetiche convenzionali: B 3-5·In, C 5-10·In, D 10-20·In (CEI EN 60898-1); scatolati Im = 10·In ± 20%.',
    'Sezioni minime: 1,5 mm² (Tab. 52E) per la luce e 2,5 mm² per gli altri circuiti (buona pratica); PE secondo la Tab. 54F.',
  ];
  for (const n of notes) {
    const lines = doc.splitTextToSize(T(`- ${n}`), 180);
    if (y + lines.length * 3.6 > 285) {
      doc.addPage('a4', 'portrait');
      y = MARGIN;
    }
    doc.text(lines, MARGIN + 1, y + 5);
    y += lines.length * 3.6 + 1;
  }
  if (p.notes.trim()) {
    heading('Note del progettista');
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
    doc.text(doc.splitTextToSize(T(p.notes), 182), MARGIN, y + 5);
  }

  // Planimetria
  if (p.plan.rooms.length || p.plan.devices.length) {
    doc.addPage('a4', 'landscape');
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(T('Planimetria (schema di massima)'), MARGIN, MARGIN + 2);
    drawPlan(doc, p, r, MARGIN, MARGIN + 8, 297 - 2 * MARGIN - 60, 210 - 2 * MARGIN - 10);
  }

  // Schema unifilare di ogni quadro su una pagina orizzontale
  for (const bd of r.boards) {
    doc.addPage('a4', 'landscape');
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(T(`Schema unifilare: ${bd.name}`), MARGIN, MARGIN + 2);
    drawDiagram(doc, singleLine(p, r, bd.id), MARGIN, MARGIN + 8, 297 - 2 * MARGIN, 210 - 2 * MARGIN - 10);
  }
  // Schema multifilare di ogni quadro
  for (const bd of r.boards) {
    doc.addPage('a4', 'landscape');
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(T(`Schema multifilare: ${bd.name}`), MARGIN, MARGIN + 2);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(T('Fasi L1 marrone, L2 nero, L3 grigio; neutro blu; PE giallo-verde (tratteggiato).'), MARGIN, MARGIN + 7);
    drawDiagram(doc, multiLine(p, r, bd.id), MARGIN, MARGIN + 11, 297 - 2 * MARGIN, 210 - 2 * MARGIN - 13);
  }
  return doc;
}

const PLAN_SYMBOL: Record<string, string> = { luce: 'X', presa: 'P', 'presa-16': 'P16', comando: 'C', 'presa-cee': 'CEE', emergenza: 'E', utilizzatore: 'U' };

function drawPlan(doc: jsPDF, p: Plant, r: PlantResult, ox: number, oy: number, w: number, h: number): void {
  const ext = planExtent(p);
  const k = Math.min(w / ext.w, h / ext.h);
  const X = (v: number) => ox + v * k;
  const Y = (v: number) => oy + v * k;
  doc.setLineWidth(0.3);
  for (const rm of p.plan.rooms) {
    doc.setDrawColor(...INK);
    if (rm.type === 'bagno') doc.setFillColor(224, 242, 254).rect(X(rm.x), Y(rm.y), rm.w * k, rm.h * k, 'FD');
    else doc.rect(X(rm.x), Y(rm.y), rm.w * k, rm.h * k);
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...INK);
    doc.text(T(rm.name), X(rm.x) + 1.5, Y(rm.y) + 3.5);
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...MUTED);
    doc.text(T(`${f(rm.w * rm.h, 1)} m²`), X(rm.x) + 1.5, Y(rm.y) + 6.5);
  }
  const tag = (id: string) => r.lines.find((x) => x.line.id === id)?.tag ?? '';
  for (const [id, pos] of Object.entries(p.plan.boards)) {
    doc.setDrawColor(180, 120, 10).setFillColor(255, 247, 237).rect(X(pos.x) - 3, Y(pos.y) - 2, 6, 4, 'FD');
    doc.setFont('helvetica', 'bold').setFontSize(5).setTextColor(180, 120, 10);
    doc.text(T(id ? tag(id) || 'SQ' : 'QG'), X(pos.x), Y(pos.y) + 1, { align: 'center' });
  }
  for (const d of p.plan.devices) {
    doc.setDrawColor(...INK).setFillColor(255, 255, 255).circle(X(d.x), Y(d.y), 1.8, 'FD');
    doc.setFont('helvetica', 'bold').setFontSize(4).setTextColor(...INK);
    doc.text(PLAN_SYMBOL[d.kind] ?? '?', X(d.x), Y(d.y) + 0.6, { align: 'center' });
    if (d.lineId) {
      doc.setFont('helvetica', 'normal').setFontSize(4).setTextColor(...MUTED);
      doc.text(T(tag(d.lineId)), X(d.x) + 2.2, Y(d.y) - 1.2);
    }
  }
  // Legenda e lunghezze stimate
  let ly = oy + 2;
  const lx = ox + w + 6;
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
  doc.text(T('Legenda'), lx, ly);
  doc.setFont('helvetica', 'normal').setFontSize(7);
  for (const [kk, lab] of Object.entries(DEVICE_LABEL)) {
    ly += 4;
    doc.text(T(`${PLAN_SYMBOL[kk]}  ${lab}`), lx, ly);
  }
  ly += 8;
  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.text(T('Lunghezze stimate'), lx, ly);
  doc.setFont('helvetica', 'normal').setFontSize(7);
  for (const ro of routes(p)) {
    ly += 4;
    if (ly > 200) break;
    doc.text(T(`${tag(ro.lineId)}  ${ro.lengthM} m${ro.bathroom ? ' (bagno)' : ''}`), lx, ly);
  }
}

function drawDiagram(doc: jsPDF, d: Diagram, ox: number, oy: number, w: number, h: number): void {
  const k = Math.min(w / d.width, h / d.height);
  const X = (v: number) => ox + v * k;
  const Y = (v: number) => oy + v * k;
  for (const pr of d.prims) {
    doc.setDrawColor(...INK).setLineWidth(0.25);
    if (pr.t === 'line') {
      if (pr.wire) doc.setDrawColor(...WIRE_PRINT[pr.wire]);
      doc.setLineWidth(pr.bold ? 0.9 : pr.wire ? 0.35 : 0.25);
      if (pr.dash) doc.setLineDashPattern([1.2, 0.8], 0);
      doc.line(X(pr.x1), Y(pr.y1), X(pr.x2), Y(pr.y2));
      if (pr.dash) doc.setLineDashPattern([], 0);
    } else if (pr.t === 'rect') {
      if (pr.tone && pr.tone !== 'ok') doc.setDrawColor(...TONE[pr.tone]!);
      doc.rect(X(pr.x), Y(pr.y), pr.w * k, pr.h * k);
    } else if (pr.t === 'circle') {
      if (pr.dot) doc.setFillColor(...WIRE_PRINT[pr.dot]).circle(X(pr.cx), Y(pr.cy), pr.r * k, 'F');
      else doc.circle(X(pr.cx), Y(pr.cy), pr.r * k);
    }
    else {
      const pt = pr.size * k * 2.83;
      doc.setFont('helvetica', pr.bold ? 'bold' : 'normal').setFontSize(pt).setTextColor(...(pr.muted ? MUTED : INK));
      doc.text(T(pr.s), X(pr.x), Y(pr.y), { align: pr.rot ? undefined : (pr.anchor === 'middle' ? 'center' : pr.anchor === 'end' ? 'right' : 'left'), angle: pr.rot ? 90 : 0 });
    }
  }
}

/** Tabella delle linee in CSV (separatore punto e virgola, per Excel in italiano). */
export function plantCsv(r: PlantResult): string {
  const head = ['Sigla', 'Linea', 'Tipo', 'Fasi', 'Fase', 'P [W]', 'ku', 'cos phi', 'Ib [A]', 'In [A]', 'Curva', 'Icu [kA]', 'Differenziale [mA]', 'Tipo diff.', 'Cavo', 'Sezione [mm2]', 'PE [mm2]', 'Lunghezza [m]', 'Posa', 'Isolante', 'Iz [A]', 'Caduta totale [%]', 'Icc min fondo linea [A]', 'Esito'];
  const n = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '' : v.toFixed(d).replace('.', ','));
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = r.lines.map((lr) => {
    const l = lr.line;
    return [
      lr.tag,
      q(l.name),
      KIND_LABEL[l.kind],
      l.phases,
      lr.phase ? `L${lr.phase}` : '',
      l.powerW,
      n(l.ku),
      n(l.cosPhi),
      n(lr.ibA, 1),
      lr.inA ?? '',
      lr.inA && lr.inA > 63 ? '' : l.curve,
      n(lr.icuKA, 1),
      l.rcdGroup ? 'gruppo' : l.rcdMa || '',
      l.rcdGroup ? '' : l.rcdMa ? l.rcdType : '',
      lr.designation,
      n(lr.section, 1),
      n(lr.peSection, 1),
      n(l.lengthM, 0),
      l.method,
      l.insulation,
      n(lr.izA, 1),
      n(lr.dropTotPct),
      n(lr.iccMinA, 0),
      STATUS[lr.status],
    ].join(';');
  });
  return '﻿' + [head.join(';'), ...rows].join('\r\n');
}

/** Computo dei materiali in CSV. */
export function bomCsv(rows: BomRow[]): string {
  const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
  return '\uFEFF' + ['Voce;Materiale;Quantità;Unità', ...rows.map((b) => [q(b.group), q(b.item), b.qty, b.unit].join(';'))].join('\r\n');
}
