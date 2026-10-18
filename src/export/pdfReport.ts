import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSingleLine } from '../diagram/singleLine';
import { PALETTES, SingleLineSvg } from '../diagram/SingleLineSvg';
import type { Project } from '../model/types';
import { buildReport, pdfSafe } from './reportData';

const MARGIN = 14;
const INK: [number, number, number] = [20, 24, 32];
const MUTED: [number, number, number] = [95, 100, 110];
const ACCENT: [number, number, number] = [180, 120, 10];

/** Converte l'SVG dello schema unifilare in PNG (i caratteri Unicode sono resi dal browser). */
async function schemaPng(project: Project, date: string): Promise<{ data: string; w: number; h: number } | null> {
  const sl = buildSingleLine(project);
  if (!sl) return null;
  const markup = renderToStaticMarkup(createElement(SingleLineSvg, { sl, project, palette: PALETTES.print, date }));
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('rendering dello schema non riuscito'));
      img.src = url;
    });
    const scale = 2;
    const w = img.width || sl.width;
    const h = img.height || sl.height;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.92), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportProjectPdf(project: Project): Promise<void> {
  const data = buildReport(project);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const T = (s: string) => pdfSafe(s);

  // ---------------------------------------------------------------- copertina e dati generali
  let y = MARGIN + 4;
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ACCENT);
  doc.text('ELECTROLAB', MARGIN, y);
  y += 8;
  doc.setFontSize(20).setTextColor(...INK);
  doc.text(doc.splitTextToSize(T(data.title), 180), MARGIN, y);
  y += 9;
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...MUTED);
  doc.text(T(`${data.subtitle} · ${data.date}`), MARGIN, y);
  y += 8;
  if (data.description) {
    doc.setFontSize(9.5).setTextColor(...INK);
    const lines = doc.splitTextToSize(T(data.description), 182);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.4 + 3;
  }
  autoTable(doc, {
    startY: y,
    head: [[T('Dati generali'), '']],
    body: data.general.map(([k, v]) => [T(k), T(v)]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8, textColor: INK },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ---------------------------------------------------------------- tabelle
  for (const t of data.tables) {
    const last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    let ty = last + 10;
    if (ty > 260) {
      doc.addPage();
      ty = MARGIN + 6;
    }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(T(t.title), MARGIN, ty);
    ty += 2;
    if (t.intro) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
      const lines = doc.splitTextToSize(T(t.intro), 182);
      doc.text(lines, MARGIN, ty + 4);
      ty += lines.length * 3.8 + 2;
    }
    const total = (t.widths ?? t.head.map(() => 1)).reduce((a, b) => a + b, 0);
    autoTable(doc, {
      startY: ty + 2,
      head: [t.head.map(T)],
      body: t.body.map((r) => r.map(T)),
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 1.4, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
      columnStyles: Object.fromEntries((t.widths ?? []).map((w, i) => [i, { cellWidth: (w / total) * 182 }])),
      margin: { left: MARGIN, right: MARGIN },
    });
  }

  // ---------------------------------------------------------------- schema unifilare
  const png = await schemaPng(project, data.date).catch(() => null);
  doc.addPage('a4', 'landscape');
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
  doc.text('Schema unifilare', MARGIN, MARGIN + 4);
  if (png) {
    const maxW = 297 - 2 * MARGIN;
    const maxH = 210 - 2 * MARGIN - 12;
    const k = Math.min(maxW / png.w, maxH / png.h);
    doc.addImage(png.data, 'JPEG', MARGIN, MARGIN + 8, png.w * k, png.h * k);
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(10).text(T('Schema non disponibile: il progetto non ha un punto di fornitura.'), MARGIN, MARGIN + 14);
  }

  // ---------------------------------------------------------------- note e avvertenze
  doc.addPage('a4', 'portrait');
  let ny = MARGIN + 4;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
  doc.text('Modello di calcolo e approssimazioni', MARGIN, ny);
  ny += 7;
  for (const n of data.notes) {
    const body = doc.splitTextToSize(T(n.text), 182);
    if (ny + 5 + body.length * 3.9 > 280) {
      doc.addPage('a4', 'portrait');
      ny = MARGIN + 4;
    }
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
    doc.text(T(n.title), MARGIN, ny);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
    doc.text(body, MARGIN, ny + 4.5);
    ny += 6 + body.length * 3.9;
  }
  ny += 4;
  doc.setDrawColor(...ACCENT).setLineWidth(0.5);
  const disc = doc.splitTextToSize(T(data.disclaimer), 176);
  doc.rect(MARGIN, ny, 182, disc.length * 4.2 + 6);
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
  doc.text(disc, MARGIN + 3, ny + 5);

  // ---------------------------------------------------------------- piè di pagina
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text(T(`ElectroLab · ${data.title} · documento didattico, non costituisce progetto né dichiarazione di conformità`), MARGIN, h - 7);
    doc.text(`${i} / ${pages}`, w - MARGIN, h - 7, { align: 'right' });
  }

  const safeName = project.name.replace(/[^\w\- ]+/g, '').trim() || 'progetto';
  doc.save(`${safeName} - ElectroLab.pdf`);
}
