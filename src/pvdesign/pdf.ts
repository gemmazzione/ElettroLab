import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfSafe } from '../export/reportData';
import { batteryAdvice, EV_KWH_PER_KM, f, fieldDesign, fields, moduleCount, peakW, stringsPerMppt, type DesignResults } from './calc';
import { DEFAULT_PRICES, ECONOMIC_SOURCES, INCENTIVE_SOURCES, LOAD_PROFILES, MONTHS, MOUNTINGS, PRICE_SOURCES, PRICES_CHECKED, SITES, type PriceSource } from './data';
import { isHybrid, type PvDesign } from './design';
import { powerAdvice } from './money';
import { lossRgb, planImage, type PlanImage } from './pdfPlan';
import { savingsSection } from './pdfSavings';
import { fieldLayouts, roofLayout, ROOF_TYPES } from './roof';
import { annualShading, type ShadingResult } from './shading';

const MARGIN = 14;
const INK: [number, number, number] = [20, 24, 32];
const MUTED: [number, number, number] = [95, 100, 110];
const ACCENT: [number, number, number] = [180, 120, 10];
const T = (s: string) => pdfSafe(s);
const eur = (v: number) => `${f(v)} EUR`;

/** Scarica la relazione del progetto fotovoltaico (con la pianta sulla foto satellitare, se si riesce a scaricarla). */
export async function exportPvDesignPdf(d: PvDesign, r: DesignResults, view3d: string | null = null): Promise<void> {
  const shading = d.obstacles.length ? annualShading(d) : null;
  const plan = await planImage(d, shading).catch(() => null);
  buildPvDesignPdf(d, r, view3d, plan, shading).save(pdfFileName(d));
}

export const pdfFileName = (d: PvDesign) => `${d.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'progetto'}_fotovoltaico.pdf`;

/** Relazione del progetto fotovoltaico: dati, verifiche, cavi, produzione, costi, ipotesi di calcolo. */
export function buildPvDesignPdf(d: PvDesign, r: DesignResults, view3d: string | null = null, plan: PlanImage | null = null, shading: ShadingResult | null = d.obstacles.length ? annualShading(d) : null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const date = new Date().toLocaleDateString('it-IT');
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = MARGIN + 4;

  const heading = (title: string, intro?: string) => {
    y += 9;
    if (y > 255) {
      doc.addPage();
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
  const table = (head: string[], body: string[][], widths?: number[], kv = false) => {
    const total = (widths ?? head.map(() => 1)).reduce((a, b) => a + b, 0);
    autoTable(doc, {
      startY: y + 2,
      head: head.length ? [head.map(T)] : undefined,
      body: body.map((row) => row.map(T)),
      theme: kv ? 'grid' : 'striped',
      styles: { fontSize: 8, cellPadding: 1.5, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
      columnStyles: kv ? { 0: { cellWidth: 70, fontStyle: 'bold' } } : Object.fromEntries((widths ?? []).map((w, i) => [i, { cellWidth: (w / total) * 182 }])),
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastY();
  };
  const bullets = (items: string[]) => {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
    y += 4;
    for (const it of items) {
      const lines = doc.splitTextToSize(T(`- ${it}`), 180);
      if (y + lines.length * 3.8 > 285) {
        doc.addPage();
        y = MARGIN + 4;
      }
      doc.text(lines, MARGIN + 1, y);
      y += lines.length * 3.8 + 1;
    }
  };
  /** Schema unifilare semplificato disegnato con linee e riquadri. */
  const singleLine = () => {
    const fv = fields(d);
    const bat = isHybrid(d) && d.batteryKWh > 0;
    const hgt = 30 + fv.length * 20 + (bat ? 6 : 0);
    if (y + hgt + 14 > 285) {
      doc.addPage();
      y = MARGIN;
    }
    y += 8;
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
    doc.text('Schema unifilare semplificato', MARGIN, y);
    const top = y + 6;
    const box = (x: number, yy: number, w: number, h: number, title: string, sub = '') => {
      doc.setDrawColor(...INK).setLineWidth(0.35).setFillColor(248, 250, 252);
      doc.roundedRect(x, yy, w, h, 1.2, 1.2, 'FD');
      // Titolo e sottotitolo vanno a capo dentro il riquadro: il sottotitolo parte sotto l'ultima riga del titolo.
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK);
      const tl = doc.splitTextToSize(T(title), w - 2) as string[];
      doc.text(tl, x + w / 2, yy + 3.8, { align: 'center' });
      if (sub) {
        doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...MUTED);
        doc.text(doc.splitTextToSize(T(sub), w - 2), x + w / 2, yy + 3.8 + tl.length * 3.1, { align: 'center' });
      }
    };
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      doc.setDrawColor(...INK).setLineWidth(0.35);
      doc.line(x1, y1, x2, y2);
    };
    const invY = top + 2;
    const invH = Math.max(18, fv.length * 20 - 2);
    const invX = 112;
    fv.forEach((v, i) => {
      const yy = top + i * 20;
      const fd = fieldDesign(d, v);
      box(MARGIN, yy, 44, 16, `${fv.length > 1 ? `Falda ${i + 1}: ` : ''}${v.strings} x ${v.modulesPerString} moduli`, `${f((v.strings * v.modulesPerString * d.module.moduleWp) / 1000, 2)} kWp, ${f(v.tilt)}° / ${f(v.azimuth)}°${d.optimizers ? ', ottimizzatori' : ''}`);
      const pr = r.protection;
      const fuse = fd.strings > 1 && pr.fusesNeeded;
      box(66, yy + 1, 34, 14, fuse ? 'Fusibili gPV + sezionatore DC' : 'Sezionatore DC', `${pr.switchV} V DC, SPD ${pr.spdUcpv} V`);
      line(MARGIN + 44, yy + 8, 66, yy + 8);
      line(100, yy + 8, invX, Math.min(invY + invH - 3, Math.max(invY + 3, yy + 8)));
      doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(...MUTED);
      doc.text(T(`${r.dc.section} mm²`), MARGIN + 46, yy + 6.6);
    });
    box(invX, invY, 30, invH, 'Inverter', `${d.inverter.label}`);
    const midY = invY + invH / 2;
    box(150, midY - 7, 22, 14, 'Magnetoterm. differenziale', `${r.ac.inA} A`);
    line(invX + 30, midY, 150, midY);
    doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(...MUTED);
    doc.text(T(`${r.ac.section} mm²`), invX + 31, midY - 1.5);
    box(178, midY - 7, 18, 14, 'Quadro e contatore', 'rete');
    line(172, midY, 178, midY);
    if (bat) {
      const by = invY + invH + 6;
      box(invX, by, 30, 10, `Batteria ${f(d.batteryKWh, 1)} kWh`);
      line(invX + 15, invY + invH, invX + 15, by);
    }
    y = top + hgt - 8;
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text(T('Schema indicativo: protezioni, interfaccia di rete e messa a terra si definiscono nel progetto esecutivo.'), MARGIN, y + 4);
    y += 5;
  };
  const status = (ok: boolean | null) => (ok === true ? 'OK' : ok === false ? 'NON SUPERATA' : 'DA VALUTARE');

  // ---------------------------------------------------------------- copertina
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ACCENT);
  doc.text('ELECTROLAB - PROGETTA FV', MARGIN, y);
  y += 8;
  doc.setFontSize(19).setTextColor(...INK);
  doc.text(doc.splitTextToSize(T(d.name), 180), MARGIN, y);
  y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...MUTED);
  doc.text(T(`Studio di fattibilità di un impianto fotovoltaico · ${date}`), MARGIN, y);
  y += 2;
  const site = SITES.find((s) => s.id === d.site.presetId);
  table(
    [],
    [
      ['Potenza di picco', `${f(peakW(d) / 1000, 2)} kWp (${moduleCount(d)} moduli da ${d.module.moduleWp} Wp)`],
      ...fields(d).map((fv) => [
        fields(d).length > 1 ? `Configurazione falda ${fv.index + 1}` : 'Configurazione',
        `${fv.strings} ${fv.strings > 1 ? 'stringhe' : 'stringa'} da ${fv.modulesPerString} moduli, ${stringsPerMppt(fieldDesign(d, fv))} per ingresso MPPT${fields(d).length > 1 ? `, ${f(fv.tilt)}° / ${f(fv.azimuth)}°` : ''}${d.optimizers ? ', con ottimizzatori' : ''}`,
      ]),
      ['Inverter', `${d.inverter.label} (${f(d.inverter.pacW)} W)${isHybrid(d) && d.batteryKWh > 0 ? `, batteria ${f(d.batteryKWh, 1)} kWh` : ''}`],
      ['Produzione annua stimata', `${f(r.yield.productionKWh)} kWh (${f(r.yield.specificYield)} kWh/kWp, PR ${f(r.yield.pr * 100, 1)}%)`],
      ['Consumi annui', `${f(d.consumption.annualKWh)} kWh${r.yield.extrasKWh > 0 ? ` + ${f(r.yield.extrasKWh)} kWh di pompa di calore e auto elettrica` : ''}`],
      ['Autoconsumo / autosufficienza', `${f(r.yield.selfConsumptionPct)}% / ${f(r.yield.selfSufficiencyPct)}%`],
      ['Costo totale stimato (IVA inclusa)', eur(r.economics.total)],
      ['Rientro semplice', r.economics.paybackYears === null ? 'oltre la durata dell\'analisi' : `${f(r.economics.paybackYears, 1)} anni`],
    ],
    undefined,
    true,
  );

  // ---------------------------------------------------------------- 1. sito
  const w = d.site.weather;
  heading(
    '1. Sito e orientamento',
    w ? `Dati climatici dell'anno tipo PVGIS del sito (${w.source}${w.period ? `, ${w.period}` : ''}), con il profilo dell'orizzonte.` : "Dati climatici indicativi o inseriti dall'utente: per un progetto definitivo vanno usati i dati del sito (UNI 10349, PVGIS).",
  );
  table(
    [],
    [
      ...(d.location.lat !== null
        ? [
            ['Posizione', `${f(d.location.lat, 5)}, ${f(d.location.lon ?? 0, 5)}${d.location.address ? ` - ${d.location.address}` : ''}`],
          ]
        : []),
      ['Dati climatici', w ? `Anno tipo PVGIS (${w.source}), ${f(w.lat, 2)}, ${f(w.lon, 2)}: 8.760 ore con irraggiamento, temperatura e orizzonte` : d.site.presetId === 'auto' ? 'Stimati dalla latitudine (interpolazione tra zone indicative)' : (site?.label ?? 'Dati personalizzati')],
      ['Latitudine', `${f(d.site.latitude, 2)}° N`],
      ['Inclinazione / orientamento', `${f(d.site.tilt)}° / ${f(d.site.azimuth)}° (0 = sud, -90 = est, +90 = ovest)`],
      ['Albedo / ombreggiamento', `${f(d.site.albedo, 2)} / ${f(d.site.shadingPct, 1)}%`],
      ['Montaggio', MOUNTINGS[d.site.mounting].label],
      ['Temperature di progetto', `minima ${f(d.site.tMin)} °C, massima ${f(d.site.tMax)} °C`],
      ['Profilo dei consumi', d.consumption.measured ? `Curva di carico misurata (${d.consumption.measuredSource})` : LOAD_PROFILES[d.consumption.profile].label],
      ...(d.consumption.heatPumpKWh > 0 ? [['Pompa di calore', `${f(d.consumption.heatPumpKWh)} kWh all'anno, nei mesi freddi`]] : []),
      ...(d.consumption.evKm > 0 ? [['Auto elettrica', `${f(d.consumption.evKm)} km all'anno (circa ${f(d.consumption.evKm * EV_KWH_PER_KM)} kWh), ricarica ${d.consumption.evCharge === 'giorno' ? 'di giorno (10-16)' : 'di sera (19-23)'}`]] : []),
      ['Potenza della fornitura', `${f(d.consumption.contractKW, 1)} kW`],
    ],
    undefined,
    true,
  );

  // ---------------------------------------------------------------- tetto e vista 3D
  const roof = roofLayout(d);
  if (roof) {
    heading('Tetto e posa dei moduli', 'Ricostruiti dalla pianta disegnata sulla foto satellitare: le falde sono approssimate con il rettangolo che contiene la pianta. Camini, lucernari e ostacoli vanno verificati sul posto.');
    table(
      [],
      [
        ['Tipo di tetto', ROOF_TYPES[d.roof.type]],
        ['Pianta', `${f(roof.geo.footprintM2)} m² (${f(roof.geo.rect.length, 1)} x ${f(roof.geo.rect.width, 1)} m)`],
        ...fieldLayouts(d).map((l) => [
          l.field === 0 ? 'Falda scelta' : 'Seconda falda',
          `${l.slope.label}: orientamento ${f(l.slope.azimuth)}°, inclinazione ${f(l.slope.tilt)}°, superficie ${f(l.layout.slopeM2)} m², ${l.installed.length} moduli su ${l.usable.length} posti utili${l.excluded.length ? ` (${l.excluded.length} posti esclusi)` : ''}`,
        ]),
        ['Posa', `moduli in ${d.roof.orientation}, ${f(d.roof.setbackM, 1)} m dai bordi${d.roof.type === 'piano' ? `, file distanziate ${f(roof.layout.rowPitch, 2)} m` : ''}`],
        ['Moduli', `${moduleCount(d)} nel progetto`],
      ],
      undefined,
      true,
    );
  }
  if (plan) {
    const pw = 182;
    const ph = Math.min(150, pw / plan.ratio);
    const iw = ph * plan.ratio;
    if (y + ph + 20 > 285) {
      doc.addPage();
      y = MARGIN;
    }
    y += 8;
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
    doc.text(T(plan.photo ? 'Pianta sulla foto satellitare' : 'Pianta del tetto'), MARGIN, y);
    try {
      doc.addImage(plan.dataUrl, 'JPEG', MARGIN + (pw - iw) / 2, y + 2, iw, ph);
      y += ph + 4;
    } catch {
      y += 2;
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    const legend = shading
      ? 'Moduli colorati secondo la perdita annua per ombra: verde nessuna, giallo circa 5%, rosso 15% o più. Verde scuro: alberi; grigio: edifici e camini.'
      : 'Blu: moduli della prima falda; viola: della seconda; tratteggio rosso: posti esclusi.';
    const ll = doc.splitTextToSize(T(`${legend}${plan.photo ? ' Foto aerea © Esri, Maxar, Earthstar Geographics.' : ''}`), 182);
    doc.text(ll, MARGIN, y + 2);
    y += ll.length * 3.4 + 1;
    if (shading) {
      for (let i = 0; i < 5; i++) {
        doc.setFillColor(...lossRgb((i / 4) * 0.15));
        doc.rect(MARGIN + i * 8, y, 8, 2.5, 'F');
      }
      doc.text('0%      5%      10%    15%+', MARGIN + 42, y + 2.2);
      y += 4;
    }
  }
  if (shading) {
    heading('Ombre', 'Ombre di alberi, edifici e camini calcolate ora per ora su un anno con il percorso del sole. Senza ottimizzatori i moduli in ombra frenano gli altri della stessa stringa.');
    const worst = Math.max(0, ...shading.perPanel) * 100;
    table(
      [],
      [
        ['Perdita con moduli in stringa', `${f(shading.stringLossPct, 1)}%${d.optimizers ? '' : ' (configurazione del progetto)'}`],
        ['Perdita con ottimizzatori', `${f(shading.lossPct, 1)}%${d.optimizers ? ' (configurazione del progetto)' : ''}`],
        ['Modulo più ombreggiato', `${f(worst, 1)}% di energia persa in un anno`],
        ['Perdita usata nel calcolo', `${f(d.site.shadingPct, 1)}%`],
        ['Ostacoli', d.obstacles.map((o) => `${o.kind} ${f(o.height, 1)} m`).join(', ')],
      ],
      undefined,
      true,
    );
  }
  if (view3d) {
    const w = 182;
    const h = w * 0.56;
    if (y + h + 12 > 285) {
      doc.addPage();
      y = MARGIN;
    }
    y += 8;
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
    doc.text('Vista 3D (modello semplificato)', MARGIN, y);
    try {
      const props = doc.getImageProperties(view3d);
      const hh = (w * props.height) / props.width;
      doc.addImage(view3d, 'JPEG', MARGIN, y + 2, w, hh);
      y += hh + 4;
    } catch {
      y += 2;
    }
  }

  // ---------------------------------------------------------------- 2. generatore
  heading('2. Moduli, stringhe e inverter');
  table(
    ['Modulo', 'Pmax', 'Vmp', 'Imp', 'Voc', 'Isc', 'Coeff. Voc', 'Coeff. Pmax', 'NOCT'],
    [[d.module.label, `${d.module.moduleWp} Wp`, `${f(d.module.vmp, 1)} V`, `${f(d.module.imp, 2)} A`, `${f(d.module.voc, 1)} V`, `${f(d.module.isc, 2)} A`, `${f(d.module.tcVoc, 2)} %/°C`, `${f(d.module.tcPmax, 2)} %/°C`, `${d.module.noct} °C`]],
    [5, 1.3, 1.2, 1.2, 1.2, 1.2, 1.5, 1.5, 1.1],
  );
  table(
    ['Inverter', 'Pac', 'Rend. europeo', 'MPPT', 'Vdc max', 'Finestra MPPT', 'Idc per MPPT'],
    [[d.inverter.label, `${f(d.inverter.pacW)} W`, `${f(d.inverter.euroEff, 1)}%`, String(d.inverter.mppt), `${f(d.inverter.maxDcV)} V`, `${f(d.inverter.mpptMinV)}-${f(d.inverter.mpptMaxV)} V`, `${f(d.inverter.maxDcA)} A`]],
    [4, 1.2, 1.5, 1, 1.3, 1.8, 1.5],
  );
  heading('Verifiche di dimensionamento', 'Verifiche tecniche sui dati di targa e sulle temperature di progetto: non sono prescrizioni normative.');
  table(['Verifica', 'Esito', 'Calcolo'], r.checks.map((c) => [c.title, status(c.ok), c.detail]), [3, 1.2, 6]);

  // ---------------------------------------------------------------- 3. cavi e protezioni
  heading('3. Cavi e protezioni');
  table(
    ['Tratto', 'Sezione', 'Lunghezza', 'Corrente di progetto', 'Portata', 'Caduta di tensione', 'Esito'],
    [
      ['Stringhe -> inverter (DC)', `${r.dc.section} mm²`, `${f(d.cables.dcLengthM)} m`, `${f(r.dc.ib, 1)} A`, `${r.dc.iz === null ? '-' : f(r.dc.iz, 1)} A`, `${f(r.dc.dropPct, 2)}%`, r.dc.ok ? 'OK' : 'NON SUPERATA'],
      ['Inverter -> quadro (AC)', `${r.ac.section} mm²`, `${f(d.cables.acLengthM)} m`, `${f(r.ac.ib, 1)} A (In ${r.ac.inA} A)`, `${r.ac.iz === null ? '-' : f(r.ac.iz, 1)} A`, `${f(r.ac.dropPct, 2)}%`, r.ac.ok ? 'OK' : 'NON SUPERATA'],
    ],
    [3, 1.2, 1.2, 2, 1.2, 1.5, 1.4],
  );
  bullets([...r.dc.notes, ...r.ac.notes, ...r.protection.notes]);
  singleLine();

  // ---------------------------------------------------------------- 4. produzione
  heading(
    '4. Produzione e autoconsumo mese per mese',
    r.yield.hourly
      ? "Calcolo ora per ora sulle 8.760 ore dell'anno tipo PVGIS, con giornate serene e nuvolose e l'orizzonte del sito."
      : "Giorno medio di ogni mese a passi di 15 minuti. Il giorno medio non contiene l'alternanza di giornate serene e nuvolose: l'autoconsumo risulta un po' ottimistico.",
  );
  const m = r.yield.months;
  table(
    ['Mese', 'Irr. moduli kWh/m²', 'Prodotta kWh', 'Consumata kWh', 'Autoconsumata kWh', 'Immessa kWh', 'Prelevata kWh'],
    [
      ...m.map((x, i) => [MONTHS[i] ?? '', f(x.hPoa), f(x.productionKWh), f(x.consumptionKWh), f(x.selfKWh), f(x.exportKWh), f(x.importKWh)]),
      ['Anno', f(r.yield.hPoaYear), f(r.yield.productionKWh), f(r.yield.consumptionKWh), f(r.yield.selfKWh), f(r.yield.exportKWh), f(r.yield.importKWh)],
    ],
  );
  heading('Perdite');
  table(
    ['Voce', 'kWh', '% dell\'ideale'],
    [
      ['Energia ideale (kWp x irraggiamento sui moduli)', f(r.yield.idealKWh), '100%'],
      ...r.yield.losses.map((l) => [`- ${l.label}`, f(l.kWh), `${f((l.kWh / Math.max(1, r.yield.idealKWh)) * 100, 1)}%`]),
      ['Energia utile prodotta', f(r.yield.productionKWh), `${f(r.yield.pr * 100, 1)}%`],
    ],
    [6, 1.5, 1.5],
  );

  // ---------------------------------------------------------------- 5. costi
  heading('5. Stima dei costi', 'Listino indicativo modificabile, da sostituire con i preventivi.');
  const ec = r.economics;
  table(
    ['Voce', 'Quantità', 'Prezzo unitario', 'Importo'],
    [
      ...ec.lines.map((l) => [l.label, l.id === 'misc' ? `${f(l.qty, 1)}%` : f(l.qty, l.qty % 1 ? 2 : 0), l.id === 'misc' ? '' : `${f(l.price, 2)} ${l.unit.replace('€', 'EUR')}`, eur(l.total)]),
      ['Imponibile', '', '', eur(ec.subtotal)],
      [`IVA ${f(d.economics.vatPct)}%`, '', '', eur(ec.vat)],
      ['Totale', '', '', eur(ec.total)],
    ],
    [5, 1.3, 2, 1.6],
  );
  // ---------------------------------------------------------------- accumulo
  const adv = batteryAdvice(d);
  heading('Accumulo', `Accumulo consigliato: ${adv.recommended > 0 ? `${f(adv.recommended, 1)} kWh` : 'nessuna batteria'}. ${adv.reason}`);
  table(
    ['Batteria', 'Autosufficienza', 'Autoconsumo', 'Spesa in più', 'Rientro'],
    adv.options.map((o) => [
      `${o.kWh === 0 ? 'nessuna' : `${f(o.kWh, 1)} kWh`}${o.kWh === adv.recommended ? ' (consigliata)' : ''}${o.kWh === (isHybrid(d) ? d.batteryKWh : 0) ? ' - scelta' : ''}`,
      `${f(o.selfSufficiencyPct)}%`,
      `${f(o.selfConsumptionPct)}%`,
      eur(o.extraCost),
      o.paybackYears === null ? 'oltre la durata' : `${f(o.paybackYears, 1)} anni`,
    ]),
    [2.4, 1.6, 1.6, 1.6, 1.6],
  );

  heading('6. Ritorno dell\'investimento');
  const e = d.economics;
  table(
    [],
    [
      e.tariff === 'fasce'
        ? ['Prezzo energia prelevata F1 / F2 / F3', `${e.bandPrices.map((v) => f(v, 3)).join(' / ')} EUR/kWh; energia immessa ${f(e.exportPrice, 3)} EUR/kWh`]
        : ['Prezzo energia prelevata / valore energia immessa', `${f(e.importPrice, 3)} / ${f(e.exportPrice, 3)} EUR/kWh`],
      ...(e.cer ? [['Comunità energetica', `${f(e.cerSharedPct)}% dell'energia immessa condivisa, incentivo ${f(e.cerIncentive, 3)} EUR/kWh per 20 anni = ${eur(ec.firstYearCer)} il primo anno`]] : []),
      ['Detrazione fiscale', `${f(e.deductionPct)}% in ${e.deductionYears} anni = ${eur(ec.deductionTotal)}${ec.deductionLost > 1 ? `, di cui ${eur(ec.deductionLost)} persi per IRPEF insufficiente (${eur(e.taxPerYear)} all'anno)` : ''}`],
      ...(ec.grant > 0 ? [['Contributo a fondo perduto', `${f(e.grantPct)}% = ${eur(ec.grant)}`]] : []),
      ['Aumento annuo energia / degrado moduli', `${f(e.energyInflationPct, 1)}% / ${f(d.losses.degradationPct, 1)}%`],
      ['Manutenzione / sostituzione inverter', `${eur(e.omPerYear)} all'anno / anno ${e.inverterReplaceYear || '-'}`],
      ['Risparmio del primo anno', `${eur(ec.firstYearSaving)} di energia non acquistata + ${eur(ec.firstYearExport)} di energia venduta${ec.firstYearCer > 0 ? ` + ${eur(ec.firstYearCer)} di incentivo CER` : ''}`],
      ['Spesa energia senza / con impianto', `${eur(ec.billBefore)} / ${eur(ec.billAfter)} all'anno`],
      ['Rientro semplice', ec.paybackYears === null ? 'oltre la durata dell\'analisi' : `${f(ec.paybackYears, 1)} anni`],
      [`Valore attuale netto (${e.years} anni, tasso ${f(e.discountPct, 1)}%)`, eur(ec.npv)],
      ['Costo dell\'energia prodotta (LCOE)', `${f(ec.lcoe, 3)} EUR/kWh`],
    ],
    undefined,
    true,
  );
  table(
    ['Anno', 'Flusso', 'Cumulato'],
    ec.cashflow.map((c) => [String(c.year), eur(c.flow), eur(c.cumulative)]),
    [1, 2, 2],
  );

  // ---------------------------------------------------------------- risparmio e agevolazioni
  savingsSection(d, r, { heading, table, bullets });

  // ---------------------------------------------------------------- fonti dei prezzi
  heading(`Fonti dei prezzi (aggiornate a ${PRICES_CHECKED})`, 'Listino IVA esclusa, comprensivo del margine di chi vende e installa. Le voci senza fonte sono stime. Le fonti riportano dati di mercato indicativi: per un impianto reale valgono i preventivi.');
  const srcRows: string[][] = [];
  const addSrc = (what: string, list: PriceSource[] | undefined, fallback = 'stima, senza una fonte specifica') => {
    if (!list?.length) srcRows.push([what, fallback, '']);
    else for (const x of list) srcRows.push([what, `${x.label} (${x.date}): ${x.note}`, x.url]);
  };
  for (const item of DEFAULT_PRICES) addSrc(item.label, PRICE_SOURCES[item.id]?.sources);
  addSrc('Prezzo dell\'energia prelevata', ECONOMIC_SOURCES.importPrice.sources);
  addSrc('Valore dell\'energia immessa', ECONOMIC_SOURCES.exportPrice.sources);
  addSrc('Detrazione fiscale', ECONOMIC_SOURCES.deduction.sources);
  addSrc('IVA', ECONOMIC_SOURCES.vat.sources);
  if (e.cer) addSrc('Incentivo CER', ECONOMIC_SOURCES.cer.sources);
  addSrc('Detrazione: regole 2026 e 2027', INCENTIVE_SOURCES.deduction);
  addSrc('Ritiro dedicato', INCENTIVE_SOURCES.rid);
  addSrc('Comunità energetiche e PNRR', [...INCENTIVE_SOURCES.cer, ...INCENTIVE_SOURCES.pnrr]);
  addSrc('Altri aiuti', INCENTIVE_SOURCES.other);
  if (powerAdvice(d.consumption)) addSrc('Aumento di potenza', INCENTIVE_SOURCES.power);
  if (w) srcRows.push(['Dati climatici', `PVGIS, Commissione europea JRC: anno tipo, banca dati ${w.source}`, 'https://re.jrc.ec.europa.eu/pvg_tools/it/']);
  table(['Voce', 'Fonte e dato', 'Indirizzo'], srcRows, [2, 4, 3.6]);

  // ---------------------------------------------------------------- ipotesi
  doc.addPage();
  y = MARGIN;
  heading('Modello di calcolo e approssimazioni');
  bullets([
    r.yield.hourly
      ? "Irraggiamento sul piano dei moduli ora per ora dall'anno tipo PVGIS (radiazione diretta e diffusa misurate), posizione del sole con l'equazione del tempo, modello isotropo per il piano inclinato, radiazione diretta bloccata dall'orizzonte del sito."
      : 'Irraggiamento sul piano dei moduli: giorno medio del mese (Klein), indice di serenità, frazione diffusa di Erbs, ripartizione oraria di Collares-Pereira e Rabl e di Liu e Jordan, modello isotropo per il piano inclinato (Duffie e Beckman).',
    'Ombre di ostacoli vicini: raggi verso il sole da cinque punti di ogni modulo; senza ottimizzatori la stringa lavora alla corrente che rende di più, con diodi di bypass a livello di modulo.',
    'Temperatura delle celle dal NOCT, con una sovratemperatura indicativa che dipende dal montaggio; temperatura dell\'aria con un andamento giornaliero di +/- 5 °C attorno alla media mensile.',
    'Potenza del generatore proporzionale all\'irraggiamento, corretta con il coefficiente di temperatura della potenza; perdite di riflessione, sporcamento, disaccoppiamento e disponibilità come percentuali fisse.',
    'Inverter con rendimento europeo costante e limitazione alla potenza nominale; perdite nei cavi proporzionali al quadrato della corrente.',
    `Batteria: capacità utilizzabile ${f(90)}%, rendimento di andata e ritorno 90%, potenza circa 0,5 C (valori indicativi).`,
    d.consumption.measured
      ? 'Consumi: curva di carico misurata dal distributore, media per mese e ora del giorno; i mesi mancanti sono ricavati dai presenti.'
      : 'Consumi: ripartizione mensile e profilo orario tipici, scalati sul consumo annuo indicato.',
    "Costi: listino indicativo; IVA, detrazioni e valore dell\'energia sono parametri da verificare secondo la normativa fiscale e il mercato del momento. Non sono considerate le quote fisse della bolletta e i costi di connessione; il finanziamento è calcolato solo se indicato. Gli scenari variano prezzi dell'energia, rincari e produzione attorno alle ipotesi del progetto.",
    'Criteri per cavi e fusibili di stringa ripresi dalla pratica di progetto (IEC 62548) e riferimenti CEI 0-21 indicati come non verificati sul testo.',
  ]);
  y += 4;
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ACCENT);
  doc.text(
    doc.splitTextToSize(
      T('Documento didattico generato da ElectroLab. È uno studio di fattibilità con modelli semplificati e dati indicativi: non è un progetto esecutivo, non attesta la conformità alle norme e non sostituisce il lavoro di un tecnico abilitato.'),
      182,
    ),
    MARGIN,
    y,
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(T(`${d.name} · ${date}`), MARGIN, 290);
    doc.text(`${i} / ${pages}`, 210 - MARGIN, 290, { align: 'right' });
  }
  return doc;
}
