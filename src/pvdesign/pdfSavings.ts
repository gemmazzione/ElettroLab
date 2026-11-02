// Relazione PDF: risparmio voce per voce, bolletta mese per mese, agevolazioni, scenari, finanziamento,
// potenza del contatore e una guida breve agli incentivi.

import { f, type DesignResults } from './calc';
import { MONTHS } from './data';
import { DEDUCTION_RATES, type PvDesign } from './design';
import { incentiveOptions, loanPlan, monthlyBills, powerAdvice, scenarios } from './money';

const eur = (v: number) => `${f(v)} EUR`;
const years = (v: number | null) => (v === null ? 'oltre la durata' : `${f(v, 1)} anni`);

export interface PdfWriter {
  heading: (title: string, intro?: string) => void;
  table: (head: string[], body: string[][], widths?: number[], kv?: boolean) => void;
  bullets: (items: string[]) => void;
}

export function savingsSection(d: PvDesign, r: DesignResults, { heading, table, bullets }: PdfWriter): void {
  const e = d.economics;
  const ec = r.economics;
  const y = r.yield;
  const rate = e.deductionYears > 0 ? ec.deductionTotal / e.deductionYears : 0;
  const ded = e.taxPerYear > 0 ? Math.min(rate, e.taxPerYear) : rate;
  const self = y.selfKWh > 0 ? ec.firstYearSaving / y.selfKWh : 0;

  heading(
    '7. Il risparmio nel dettaglio',
    `Regole fiscali considerate: ${DEDUCTION_RATES[e.taxYear].label.toLowerCase()}, ${e.mainHome ? 'abitazione principale' : 'altro immobile'}. L'energia usata in casa non paga nessuna voce a consumo; le quote fisse della bolletta restano.`,
  );
  table(
    [],
    [
      ['Energia che non compri più', `${f(y.selfKWh)} kWh x ${f(self, 3)} EUR/kWh = ${eur(ec.firstYearSaving)}`],
      ['Energia venduta (ritiro dedicato)', `${f(y.exportKWh)} kWh x ${f(e.exportPrice, 3)} EUR/kWh = ${eur(ec.firstYearExport)}`],
      ...(ec.firstYearCer > 0 ? [['Incentivo CER', eur(ec.firstYearCer)]] : []),
      ...(ded > 0 ? [['Rata della detrazione', `${eur(ded)}${ded < rate ? ` (rata piena ${eur(rate)}, limitata dall'IRPEF)` : ''}`]] : []),
      ...(e.omPerYear > 0 ? [['Manutenzione e assicurazione', `-${eur(e.omPerYear)}`]] : []),
      ['Guadagno netto del primo anno', eur(ec.firstYearSaving + ec.firstYearExport + ec.firstYearCer + ded - e.omPerYear)],
    ],
    undefined,
    true,
  );
  table(
    ['Mese', "Spesa per l'energia senza impianto", 'Con impianto (tolte vendita e CER)'],
    monthlyBills(d, y, ec).map((b, i) => [MONTHS[i]!, eur(b.before), eur(b.after)]),
    [1, 2, 2],
  );

  heading('Quale agevolazione conviene', 'Lo stesso impianto con le strade possibili. Il Conto Termico per le case vale solo insieme a una pompa di calore e non si somma alla detrazione.');
  table(
    ['Strada', 'Spesa iniziale', 'Detrazione', 'CER in 20 anni', 'Rientro', 'VAN'],
    incentiveOptions(d, y).map((o) => [
      `${o.label}${o.current ? ' (progetto)' : ''}: ${o.note}`,
      eur(o.upfront),
      o.deduction > 0 ? eur(o.deduction) : '-',
      o.cer20 > 0 ? eur(o.cer20) : '-',
      years(o.paybackYears),
      eur(o.npv),
    ]),
    [4, 1.4, 1.3, 1.3, 1.3, 1.3],
  );

  heading('Scenari', 'Il rientro se prezzi, rincari e produzione vanno peggio o meglio del previsto.');
  table(
    ['Scenario', 'Ipotesi', 'Rientro', 'VAN'],
    scenarios(d, y).map((s) => [s.label, s.note, years(s.economics.paybackYears), eur(s.economics.npv)]),
    [1.2, 3.4, 1.2, 1.2],
  );

  if (e.loan.enabled) {
    const l = loanPlan(e, ec);
    heading('Finanziamento');
    table(
      [],
      [
        ['Importo finanziato', `${eur(l.financed)} (${f(e.loan.pct)}% della spesa), TAN ${f(e.loan.tanPct, 1)}%, ${f(e.loan.years)} anni`],
        ['Rata mensile / interessi totali', `${eur(l.monthly)} / ${eur(l.interest)}`],
        ['Risparmio medio mensile del primo anno', eur(l.monthlyBenefit)],
        ['Saldo positivo dopo', l.paybackYears === 0 ? 'da subito' : years(l.paybackYears)],
      ],
      undefined,
      true,
    );
  }

  const pw = powerAdvice(d.consumption);
  if (pw) {
    heading('Potenza del contatore', 'Stima indicativa del picco con i carichi indicati; il contatore tollera il 10% in più della potenza impegnata.');
    table(
      [],
      [
        ...pw.items.map((x) => [x.label, `${f(x.kW, 1)} kW`]),
        ['Tutto acceso insieme', `${f(pw.peakKW, 1)} kW`],
        [
          'Esito',
          pw.raise
            ? `Da ${f(d.consumption.contractKW, 1)} a ${f(pw.suggestedKW, 1)} kW: circa ${eur(pw.oneOff)} una volta e ${eur(pw.yearlyExtra)} all'anno in più, IVA esclusa (costi 2026, delibera ARERA 575/2025)`
            : `${f(d.consumption.contractKW, 1)} kW sufficienti`,
        ],
      ],
      undefined,
      true,
    );
  }

  heading(
    "Come funzionano detrazione, vendita dell'energia e incentivi",
    'Regole in vigore a novembre 2026, in breve: vanno verificate al momento della spesa. Informazioni divulgative, non una consulenza fiscale.',
  );
  bullets([
    "Detrazione (bonus ristrutturazioni): si recupera una parte della spesa dalle tasse in 10 rate annuali. Nel 2026: 50% per l'abitazione principale del proprietario o di chi ha un diritto reale, 36% negli altri casi. Per il 2027 la legge in vigore prevede 36% e 30%; la manovra 2027 propone di confermare 50% e 36%. Spesa massima 96.000 EUR per abitazione, batteria compresa. La rata oltre l'IRPEF dovuta si perde.",
    "Adempimenti: bonifico «parlante» per ristrutturazioni, comunicazione all'ENEA di regola entro 90 giorni dalla fine dei lavori, conservazione di fatture, ricevute e dichiarazione di conformità.",
    "Energia venduta: con il ritiro dedicato il GSE paga l'energia immessa al prezzo zonale orario, con un prezzo minimo garantito per i piccoli impianti. Lo scambio sul posto non è disponibile per gli impianti entrati in esercizio dopo il 29 maggio 2025.",
    "Comunità energetica (CER): per l'energia immessa e consumata nello stesso momento da altri membri (sotto la stessa cabina primaria) il GSE riconosce una tariffa per 20 anni, più circa 8 EUR/MWh di valorizzazione ARERA. L'incentivo va alla comunità, che lo ripartisce secondo lo statuto. Si somma alla detrazione al 50%; non spetta agli impianti con Superbonus.",
    'Contributo PNRR del 40% per le CER nei Comuni fino a 50.000 abitanti: in alternativa alla detrazione, con la tariffa CER ridotta; verificare se lo sportello è aperto.',
    'Altri aiuti: IVA agevolata al 10%; Conto Termico 3.0 per le case solo insieme a una pompa di calore, alternativo alla detrazione; reddito energetico per famiglie con ISEE basso, rifinanziamento 2026 non confermato.',
  ]);
}
