import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfSafe } from '../export/reportData';
import { f, moduleCount, peakW, stringsPerMppt, type DesignResults } from './calc';
import { LOAD_PROFILES, MONTHS, MOUNTINGS, SITES } from './data';
import { isHybrid, type PvDesign } from './design';

const MARGIN = 14;
const INK: [number, number, number] = [20, 24, 32];
const MUTED: [number, number, number] = [95, 100, 110];
const ACCENT: [number, number, number] = [180, 120, 10];
const T = (s: string) => pdfSafe(s);
const eur = (v: number) => `${f(v)} EUR`;

/** Scarica la relazione del progetto fotovoltaico. */
export function exportPvDesignPdf(d: PvDesign, r: DesignResults): void {
  buildPvDesignPdf(d, r).save(pdfFileName(d));
}

export const pdfFileName = (d: PvDesign) => `${d.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'progetto'}_fotovoltaico.pdf`;

/** Relazione del progetto fotovoltaico: dati, verifiche, cavi, produzione, costi, ipotesi di calcolo. */
export function buildPvDesignPdf(d: PvDesign, r: DesignResults): jsPDF {
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
      ['Configurazione', `${d.strings} ${d.strings > 1 ? 'stringhe' : 'stringa'} da ${d.modulesPerString} moduli, ${stringsPerMppt(d)} per ingresso MPPT`],
      ['Inverter', `${d.inverter.label} (${f(d.inverter.pacW)} W)${isHybrid(d) && d.batteryKWh > 0 ? `, batteria ${f(d.batteryKWh, 1)} kWh` : ''}`],
      ['Produzione annua stimata', `${f(r.yield.productionKWh)} kWh (${f(r.yield.specificYield)} kWh/kWp, PR ${f(r.yield.pr * 100, 1)}%)`],
      ['Consumi annui', `${f(d.consumption.annualKWh)} kWh`],
      ['Autoconsumo / autosufficienza', `${f(r.yield.selfConsumptionPct)}% / ${f(r.yield.selfSufficiencyPct)}%`],
      ['Costo totale stimato (IVA inclusa)', eur(r.economics.total)],
      ['Rientro semplice', r.economics.paybackYears === null ? 'oltre la durata dell\'analisi' : `${f(r.economics.paybackYears, 1)} anni`],
    ],
    undefined,
    true,
  );

  // ---------------------------------------------------------------- 1. sito
  heading('1. Sito e orientamento', 'Dati climatici indicativi o inseriti dall\'utente: per un progetto definitivo vanno usati i dati del sito (UNI 10349, PVGIS).');
  table(
    [],
    [
      ['Zona climatica', site?.label ?? 'Dati personalizzati'],
      ['Latitudine', `${f(d.site.latitude, 1)}° N`],
      ['Inclinazione / orientamento', `${f(d.site.tilt)}° / ${f(d.site.azimuth)}° (0 = sud, -90 = est, +90 = ovest)`],
      ['Albedo / ombreggiamento', `${f(d.site.albedo, 2)} / ${f(d.site.shadingPct, 1)}%`],
      ['Montaggio', MOUNTINGS[d.site.mounting].label],
      ['Temperature di progetto', `minima ${f(d.site.tMin)} °C, massima ${f(d.site.tMax)} °C`],
      ['Profilo dei consumi', LOAD_PROFILES[d.consumption.profile].label],
      ['Potenza della fornitura', `${f(d.consumption.contractKW, 1)} kW`],
    ],
    undefined,
    true,
  );

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

  // ---------------------------------------------------------------- 4. produzione
  heading('4. Produzione e autoconsumo mese per mese', 'Giorno medio di ogni mese a passi di 15 minuti. Il giorno medio non contiene l\'alternanza di giornate serene e nuvolose: l\'autoconsumo risulta un po\' ottimistico.');
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
  heading('6. Ritorno dell\'investimento');
  const e = d.economics;
  table(
    [],
    [
      ['Prezzo energia prelevata / valore energia immessa', `${f(e.importPrice, 3)} / ${f(e.exportPrice, 3)} EUR/kWh`],
      ['Detrazione fiscale', `${f(e.deductionPct)}% in ${e.deductionYears} anni = ${eur(ec.deductionTotal)}`],
      ['Aumento annuo energia / degrado moduli', `${f(e.energyInflationPct, 1)}% / ${f(d.losses.degradationPct, 1)}%`],
      ['Manutenzione / sostituzione inverter', `${eur(e.omPerYear)} all'anno / anno ${e.inverterReplaceYear || '-'}`],
      ['Risparmio del primo anno', `${eur(ec.firstYearSaving)} di energia non acquistata + ${eur(ec.firstYearExport)} di energia venduta`],
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

  // ---------------------------------------------------------------- ipotesi
  doc.addPage();
  y = MARGIN;
  heading('Modello di calcolo e approssimazioni');
  bullets([
    'Irraggiamento sul piano dei moduli: giorno medio del mese (Klein), indice di serenità, frazione diffusa di Erbs, ripartizione oraria di Collares-Pereira e Rabl e di Liu e Jordan, modello isotropo per il piano inclinato (Duffie e Beckman).',
    'Temperatura delle celle dal NOCT, con una sovratemperatura indicativa che dipende dal montaggio; temperatura dell\'aria con un andamento giornaliero di +/- 5 °C attorno alla media mensile.',
    'Potenza del generatore proporzionale all\'irraggiamento, corretta con il coefficiente di temperatura della potenza; perdite di riflessione, sporcamento, disaccoppiamento e disponibilità come percentuali fisse.',
    'Inverter con rendimento europeo costante e limitazione alla potenza nominale; perdite nei cavi proporzionali al quadrato della corrente.',
    `Batteria: capacità utilizzabile ${f(90)}%, rendimento di andata e ritorno 90%, potenza circa 0,5 C (valori indicativi).`,
    'Consumi: ripartizione mensile e profilo orario tipici, scalati sul consumo annuo indicato.',
    'Costi: listino indicativo; IVA, detrazioni e valore dell\'energia sono parametri da verificare secondo la normativa fiscale e il mercato del momento. Non sono considerate quote fisse della bolletta, finanziamenti e costi di connessione.',
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
