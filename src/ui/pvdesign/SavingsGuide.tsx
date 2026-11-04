import { ClipboardList, Landmark, PiggyBank, Receipt, TrendingUp, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { f, type DesignResults } from '../../pvdesign/calc';
import { connectionInfo } from '../../pvdesign/connection';
import { BUSINESS_SOURCES, INCENTIVE_SOURCES } from '../../pvdesign/data';
import { isBusiness } from '../../pvdesign/design';
import { usePvDesign } from '../../pvdesign/store';
import { Sources } from './BatteryStep';
import { More } from './kit';

const eur = (v: number) => `${f(v)} €`;

/** Il risparmio del primo anno voce per voce e come cambia negli anni. */
export function SavingsBreakdown({ r }: { r: DesignResults }) {
  const e = usePvDesign((s) => s.design.economics);
  const deg = usePvDesign((s) => s.design.losses.degradationPct);
  const biz = usePvDesign((s) => isBusiness(s.design));
  const ec = r.economics;
  const y = r.yield;
  const where = biz ? 'in azienda' : 'in casa';
  const selfPrice = y.selfKWh > 0 ? ec.firstYearSaving / y.selfKWh : 0;
  const rate = e.deductionYears > 0 ? ec.deductionTotal / e.deductionYears : 0;
  const dedYear = e.taxPerYear > 0 ? Math.min(rate, e.taxPerYear) : rate;
  const rows: { label: string; how: string; value: number; color: string }[] = [
    { label: 'Energia che non compri più', how: `${f(y.selfKWh)} kWh usati ${where} × ${f(selfPrice, 3)} €/kWh`, value: ec.firstYearSaving, color: '#34d399' },
    { label: 'Energia venduta in rete', how: `${f(y.exportKWh)} kWh immessi × ${f(e.exportPrice, 3)} €/kWh (ritiro dedicato)`, value: ec.firstYearExport, color: '#38bdf8' },
    ...(ec.firstYearCer > 0
      ? [{ label: 'Incentivo della comunità energetica', how: `${f(y.exportKWh * (e.cerSharedPct / 100))} kWh condivisi × ${f(e.cerIncentive, 3)} €/kWh, per 20 anni`, value: ec.firstYearCer, color: '#a78bfa' }]
      : []),
    ...(dedYear > 0 ? [{ label: 'Quota della detrazione fiscale', how: `${eur(ec.deductionTotal)} in ${e.deductionYears} rate annuali${dedYear < rate ? `, limitate dall'IRPEF (${eur(rate)} la rata piena)` : ''}`, value: dedYear, color: '#fbbf24' }] : []),
    ...(biz
      ? [
          { label: 'Imposte sul risparmio (IRES e IRAP)', how: `il risparmio e i ricavi aumentano l'utile: ${f(e.business.iresPct + e.business.irapPct, 1)}%`, value: -ec.firstYearTax, color: '#fb923c' },
          {
            label: "Imposte risparmiate con l'ammortamento",
            how: `quota del primo anno (metà del ${f(e.business.depreciationPct, 1)}%)${e.business.hyperPct > 0 ? `, con l'iperammortamento +${f(e.business.hyperPct)}%` : ''}`,
            value: ec.firstYearShield,
            color: '#fbbf24',
          },
        ]
      : []),
    ...(e.omPerYear > 0 ? [{ label: 'Manutenzione e assicurazione', how: 'spesa annua stimata', value: -e.omPerYear, color: '#f87171' }] : []),
  ];
  const net = rows.reduce((a, x) => a + x.value, 0);
  const max = Math.max(1, ...rows.map((x) => Math.abs(x.value)));
  const ratio = e.exportPrice > 0 ? selfPrice / e.exportPrice : 0;

  // Gli anni in cui qualcosa cambia: fine della detrazione, cambio dell'inverter, fine dell'incentivo CER.
  const D = biz ? 0 : e.deductionYears;
  const marks = new Map<number, string>();
  const add = (k: number, why: string) => k >= 1 && k <= e.years && marks.set(k, marks.has(k) ? `${marks.get(k)}; ${why}` : why);
  add(1, 'primo anno');
  if (D > 0) {
    add(D, 'ultima rata della detrazione');
    add(D + 1, 'senza più la detrazione');
  }
  if (biz && e.business.depreciationPct > 0) {
    // Ultimo anno con una quota di ammortamento: metà quota il primo anno, poi quote intere.
    const q = e.business.depreciationPct / 100;
    add(1 + Math.ceil((1 - q / 2) / q - 1e-9), 'ultima quota di ammortamento');
  }
  if (e.inverterReplaceYear > 0) add(e.inverterReplaceYear, "sostituzione dell'inverter");
  if (e.cer) add(21, "finito l'incentivo CER");
  add(e.years, "fine dell'analisi");
  const years = [...marks.keys()].sort((a, b) => a - b);

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:p-4" aria-labelledby="pv-saving-title">
      <div>
        <h3 id="pv-saving-title" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-white">
          <PiggyBank size={17} className="text-emerald-300" /> Il risparmio nel dettaglio
        </h3>
        <p className="text-[0.75rem] text-slate-400">Da dove arrivano i soldi del primo anno, con i numeri del tuo progetto.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((x) => (
          <li key={x.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <div className="min-w-0">
              <div className="text-[0.78125rem] text-slate-200">{x.label}</div>
              <div className="text-[0.6875rem] text-slate-500">{x.how}</div>
            </div>
            <div className={`text-right font-mono text-[0.8125rem] font-semibold tabular-nums ${x.value < 0 ? 'text-red-300' : 'text-white'}`}>
              {x.value < 0 ? '−' : '+'}
              {eur(Math.abs(x.value))}
            </div>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(Math.abs(x.value) / max) * 100}%`, background: x.color }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-[0.8125rem]">
        <span className="font-semibold text-slate-200">Guadagno netto del primo anno</span>
        <span className="font-mono font-semibold tabular-nums text-emerald-300">{eur(net)}</span>
      </div>
      <div className="grid gap-2 text-[0.71875rem] leading-snug text-slate-400 sm:grid-cols-2">
        <p className="rounded-lg bg-emerald-500/[0.07] px-3 py-2 text-emerald-100/90">
          {ratio > 1 ? (
            <>
              Ogni kWh usato {where} vale <b>{f(ratio, 1)} volte</b> un kWh venduto: per questo conviene usare l'energia mentre il sole c'è{' '}
              {biz ? '(lavorazioni energivore, compressori, ricarica dei mezzi elettrici nelle ore centrali)' : '(lavatrice, lavastoviglie, auto elettrica di giorno)'} o accumularla in una batteria.
            </>
          ) : (
            "Il kWh usato in casa vale quanto il prezzo che paghi in bolletta, quello venduto quanto ti paga il ritiro dedicato."
          )}
        </p>
        <p className="rounded-lg bg-slate-900/80 px-3 py-2">
          {biz
            ? "L'energia autoconsumata non paga energia, trasporto, oneri e accise. Restano le quote fisse e quelle per la potenza impegnata, che l'impianto non riduce."
            : "L'energia autoconsumata non paga nessuna voce a consumo: energia, trasporto, oneri, accise e IVA. Restano invece le quote fisse della bolletta (per punto e per potenza impegnata), che l'impianto non riduce."}
        </p>
      </div>
      <More label="Come cambia negli anni">
        <p className="text-[0.71875rem] text-slate-400">
          Ogni anno l'energia costa il {f(e.energyInflationPct, 1)}% in più (risparmi di più) e i moduli producono lo {f(deg, 1)}% in meno.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-[0.75rem]">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-500">
                <th className="py-1 font-medium">Anno</th>
                <th className="py-1 font-medium">Cosa succede</th>
                <th className="py-1 text-right font-medium">Saldo dell'anno</th>
                <th className="py-1 text-right font-medium">Saldo totale</th>
              </tr>
            </thead>
            <tbody>
              {years.map((k) => {
                const c = ec.cashflow[k];
                if (!c) return null;
                return (
                  <tr key={k} className="border-b border-slate-800/60">
                    <td className="py-1 font-mono tabular-nums text-slate-300">{k}</td>
                    <td className="py-1 text-slate-400">{marks.get(k)}</td>
                    <td className={`py-1 text-right font-mono tabular-nums ${c.flow < 0 ? 'text-red-300' : 'text-slate-200'}`}>{eur(c.flow)}</td>
                    <td className={`py-1 text-right font-mono tabular-nums ${c.cumulative < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{eur(c.cumulative)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </More>
    </section>
  );
}

function Card({ icon, title, value, children, more, sources }: { icon: ReactNode; title: string; value?: ReactNode; children: ReactNode; more?: ReactNode; sources: Parameters<typeof Sources>[0]['sources'] }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <h4 className="flex items-center gap-2 text-[0.84375rem] font-semibold text-white">
        {icon}
        {title}
      </h4>
      {value && <div className="rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-[0.75rem] text-slate-200">{value}</div>}
      <div className="space-y-1.5 text-[0.75rem] leading-snug text-slate-300">{children}</div>
      {more && <More label="Requisiti e passaggi">{more}</More>}
      <div className="mt-auto border-t border-slate-800 pt-2">
        <Sources sources={sources} />
      </div>
    </article>
  );
}

const Steps = ({ items }: { items: ReactNode[] }) => (
  <ol className="list-decimal space-y-1 pl-4 text-[0.75rem] leading-snug text-slate-300 marker:text-slate-500">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ol>
);

/** Come funzionano detrazione, vendita dell'energia, comunità energetiche e gli altri bonus. */
export function IncentivesGuide({ r }: { r: DesignResults }) {
  const biz = usePvDesign((s) => isBusiness(s.design));
  return biz ? <BusinessGuide r={r} /> : <HomeGuide r={r} />;
}

/** Incentivi, imposte e obblighi per un impianto aziendale. */
function BusinessGuide({ r }: { r: DesignResults }) {
  const d = usePvDesign((s) => s.design);
  const e = d.economics;
  const ec = r.economics;
  const over = r.yield.consumptionKWh > 0 ? r.yield.productionKWh / r.yield.consumptionKWh : 0;
  const items = connectionInfo(d);
  return (
    <section className="space-y-3" aria-labelledby="pv-incentives-title">
      <div>
        <h3 id="pv-incentives-title" className="text-[0.9375rem] font-semibold text-white">
          Incentivi, imposte e obblighi per un'azienda
        </h3>
        <p className="text-[0.75rem] text-slate-400">Regole in vigore a novembre 2026, spiegate in breve. Cambiano spesso: prima di decidere verificale con l'installatore e il commercialista.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          icon={<TrendingUp size={16} className="text-amber-300" />}
          title="Iperammortamento 2026"
          value={
            e.business.hyperPct > 0 ? (
              <>
                Nel tuo progetto: +{f(e.business.hyperPct)}% sul costo, <b>{eur(ec.hyperTotal)}</b> di IRES in meno oltre all'ammortamento ordinario.
              </>
            ) : (
              "Nel tuo progetto non è attivo: puoi provarlo qui sopra, in «Fiscalità dell'azienda»."
            )
          }
          sources={BUSINESS_SOURCES.hyper}
          more={
            <Steps
              items={[
                "Scegli moduli iscritti al registro ENEA nella categoria B (celle prodotte nell'UE, efficienza almeno 23,5%) o C (celle bifacciali a eterogiunzione o tandem, almeno 24%).",
                "Fai calcolare il fabbisogno dell'azienda sui consumi dell'esercizio precedente: la produzione attesa non deve superarne il 105%.",
                'Raccogli la perizia tecnica asseverata (ingegnere, perito industriale o ente accreditato) e la certificazione contabile di un revisore.',
                "Invia le comunicazioni previste dal decreto attuativo e completa l'investimento entro il 30 settembre 2028.",
              ]}
            />
          }
        >
          <p>Il costo dell'impianto si deduce dal reddito come se fosse più alto: con il +180% ogni 100 € spesi se ne deducono 280, quindi si pagano meno imposte negli anni dell'ammortamento.</p>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>Legge 199/2025 (bilancio 2026), commi 427-436: +180% fino a 2,5 milioni di euro di investimento, +100% fino a 10 milioni, +50% fino a 20 milioni.</li>
            <li>Investimenti dal 1° gennaio 2026 al 30 settembre 2028. Prende il posto dei crediti d'imposta Transizione 4.0 e 5.0.</li>
            <li>Solo impianti per l'autoconsumo dell'azienda; gli accumuli sono compresi. Vale per tutte le imprese, di ogni dimensione e forma.</li>
            {over > 1.05 && <li className="text-amber-200">Il tuo impianto produce il {f(over * 100)}% dei consumi: oltre il 105% l'iperammortamento non spetta.</li>}
          </ul>
        </Card>

        <Card icon={<Receipt size={16} className="text-sky-300" />} title="IVA, ammortamento e imposte" sources={BUSINESS_SOURCES.depreciation}>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>
              <b>IVA al 22%</b> in fattura, ma l'azienda che la detrae la recupera: il costo dell'impianto è l'imponibile{e.business.vatRecoverable ? ' (come nel tuo progetto)' : ''}.
            </li>
            <li>
              <b>Ammortamento</b>: l'impianto sul tetto, se non è accatastato con il fabbricato, si ammortizza al 9% all'anno (metà quota il primo esercizio). La detrazione del 50% per le case non vale per
              le imprese.
            </li>
            <li>
              <b>Imposte</b>: l'energia non comprata riduce i costi e quella venduta è un ricavo, quindi l'utile sale e con lui IRES e IRAP. Nel calcolo i flussi sono al netto delle imposte.
            </li>
          </ul>
        </Card>

        <Card
          icon={<Users size={16} className="text-violet-300" />}
          title="Energia venduta e comunità energetiche"
          value={
            <>
              Nel tuo progetto: {f(r.yield.exportKWh)} kWh all'anno in rete, circa <b>{eur(ec.firstYearExport)}</b>
              {ec.firstYearCer > 0 && <> più {eur(ec.firstYearCer)} di incentivo CER</>}.
            </>
          }
          sources={[...INCENTIVE_SOURCES.rid, ...INCENTIVE_SOURCES.cer]}
        >
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>L'energia in più si vende con il ritiro dedicato del GSE (prezzo zonale orario con un minimo garantito) o a un operatore di mercato.</li>
            <li>
              Le piccole e medie imprese possono entrare in una comunità energetica, purché non sia la loro attività principale: per l'energia condivisa la tariffa dura 20 anni. Nei fine settimana un'azienda
              chiusa immette molta energia, che gli altri membri possono usare.
            </li>
            <li>Nei Comuni fino a 50.000 abitanti c'era anche il contributo PNRR del 40% per gli impianti in CER: verifica se lo sportello è aperto e la cumulabilità con l'iperammortamento.</li>
          </ul>
        </Card>

        <Card icon={<ClipboardList size={16} className="text-emerald-300" />} title="Connessione e pratiche" sources={[...BUSINESS_SOURCES.connection, ...BUSINESS_SOURCES.adm, ...BUSINESS_SOURCES.fire]}>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            {items.map((x) => (
              <li key={x.id}>
                <b>{x.title}</b>: {x.summary}.
              </li>
            ))}
          </ul>
          <p className="text-[0.71875rem] text-slate-400">I dettagli sono nel passo «Cavi e protezioni», sezione «Connessione alla rete e pratiche».</p>
        </Card>
      </div>
      <p className="text-[0.71875rem] leading-snug text-slate-500">
        Informazioni divulgative, non sono una consulenza fiscale: aliquote, scadenze e requisiti dipendono dall'azienda e dalle norme in vigore quando investi.
      </p>
    </section>
  );
}

/** Incentivi e bonus per un'abitazione. */
function HomeGuide({ r }: { r: DesignResults }) {
  const e = usePvDesign((s) => s.design.economics);
  const ec = r.economics;
  const dedYear = e.deductionYears > 0 ? ec.deductionTotal / e.deductionYears : 0;
  return (
    <section className="space-y-3" aria-labelledby="pv-incentives-title">
      <div>
        <h3 id="pv-incentives-title" className="text-[0.9375rem] font-semibold text-white">
          Detrazioni, vendita dell'energia e bonus: come funzionano
        </h3>
        <p className="text-[0.75rem] text-slate-400">Regole in vigore a novembre 2026, spiegate in breve. Cambiano spesso: prima di decidere verificale con l'installatore o un commercialista.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          icon={<Receipt size={16} className="text-amber-300" />}
          title="Detrazione fiscale (bonus ristrutturazioni)"
          value={
            dedYear > 0 ? (
              <>
                Nel tuo progetto: {f(e.deductionPct)}% di {eur(ec.total)} = <b>{eur(ec.deductionTotal)}</b>, cioè {eur(dedYear)} all'anno per {e.deductionYears} anni.
              </>
            ) : (
              'Nel tuo progetto la detrazione è a zero.'
            )
          }
          sources={INCENTIVE_SOURCES.deduction}
          more={
            <Steps
              items={[
                "Paga l'installatore con il bonifico «parlante» per le ristrutturazioni: causale, codice fiscale di chi detrae, partita IVA dell'impresa.",
                "Entro 90 giorni dalla fine dei lavori (di regola) invia la comunicazione all'ENEA sul portale dei bonus fiscali.",
                'Conserva fatture, ricevute dei bonifici, ricevuta ENEA, dichiarazione di conformità e documenti della connessione.',
                'Indica la spesa nella dichiarazione dei redditi (730 o Redditi PF) ogni anno, per tutte le rate.',
              ]}
            />
          }
        >
          <p>Non è uno sconto in fattura: paghi tutto subito e recuperi una parte della spesa dalle tasse, in 10 rate uguali, una per anno.</p>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>
              <b>50%</b> nel 2026 sull'abitazione principale, per il proprietario o chi ha un diritto reale (usufrutto, abitazione). <b>36%</b> negli altri casi: seconde case, inquilini, familiari
              conviventi.
            </li>
            <li>Per le spese del 2027 la legge in vigore prevede il 36% (abitazione principale) e il 30% (altri immobili). La manovra approvata dal Consiglio dei ministri il 28 ottobre 2026 propone di confermare 50% e 36%: va ancora approvata dal Parlamento.</li>
            <li>Spesa massima 96.000 € per abitazione, insieme agli altri lavori di ristrutturazione. La batteria è compresa, anche se aggiunta dopo.</li>
            <li>
              Recuperi solo fino alle tasse che paghi: per {dedYear > 0 ? <>usare {eur(dedYear)} all'anno</> : 'usare ogni rata'} ti serve almeno altrettanta IRPEF. La parte che non trova
              capienza si perde, non viene rimborsata.
            </li>
          </ul>
        </Card>

        <Card
          icon={<Landmark size={16} className="text-sky-300" />}
          title="Energia venduta: il ritiro dedicato"
          value={
            <>
              Nel tuo progetto: {f(r.yield.exportKWh)} kWh all'anno in rete, circa <b>{eur(ec.firstYearExport)}</b>.
            </>
          }
          sources={INCENTIVE_SOURCES.rid}
          more={
            <Steps
              items={[
                "L'installatore chiede la connessione al distributore e registra l'impianto su Terna (Gaudì).",
                'Dopo l\'attivazione chiedi al GSE la convenzione di ritiro dedicato dal suo portale.',
                "Il GSE paga l'energia immessa e fa un conguaglio annuale con il prezzo minimo garantito.",
              ]}
            />
          }
        >
          <p>L'energia che non usi va in rete e il GSE te la paga al prezzo orario della tua zona, che nelle ore di sole è più basso della media.</p>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>Per i piccoli impianti c'è un prezzo minimo garantito: se il mercato scende sotto, il GSE paga almeno quello.</li>
            <li>Lo scambio sul posto non è più disponibile per gli impianti entrati in esercizio dopo il 29 maggio 2025.</li>
            <li>Vendere l'energia non fa perdere la detrazione, se l'impianto è al servizio dell'abitazione e non è un'attività commerciale.</li>
          </ul>
        </Card>

        <Card
          icon={<Users size={16} className="text-violet-300" />}
          title="Comunità energetica rinnovabile (CER)"
          value={
            e.cer ? (
              <>
                Nel tuo progetto: {f(e.cerSharedPct)}% dell'energia immessa condivisa, circa <b>{eur(ec.firstYearCer)}</b> il primo anno.
              </>
            ) : (
              'Nel tuo progetto la CER non è attiva: puoi provarla qui sopra, in «Comunità energetica».'
            )
          }
          sources={[...INCENTIVE_SOURCES.cer, ...INCENTIVE_SOURCES.pnrr]}
          more={
            <Steps
              items={[
                "Cerca una CER già attiva nella tua zona (il Comune, una cooperativa) o costituiscine una: serve un'associazione o una cooperativa con atto costitutivo e statuto.",
                'Controlla sulla mappa del GSE che la tua casa sia sotto la stessa cabina primaria degli altri membri.',
                "La CER chiede l'incentivo al GSE entro 120 giorni dall'entrata in esercizio dell'impianto.",
                "Leggi nello statuto come la CER divide l'incentivo tra chi produce e chi consuma.",
              ]}
            />
          }
        >
          <p>
            Famiglie, imprese e Comuni vicini si associano. Ora per ora, l'energia che immetti e che un altro membro consuma nello stesso momento è «condivisa»: per quella il GSE paga un
            incentivo per 20 anni. La tua energia la continui a vendere con il ritiro dedicato.
          </p>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>Tariffa di 80–120 €/MWh secondo il prezzo dell'energia, più circa 8 €/MWh restituiti da ARERA e una piccola maggiorazione al centro e al nord.</li>
            <li>L'incentivo va alla comunità, che lo ripartisce secondo il suo statuto: la tua quota può essere più bassa del calcolo qui sopra.</li>
            <li>Si somma alla detrazione al 50%; non spetta se l'impianto ha avuto il Superbonus. Le tariffe valgono per gli impianti attivati entro il 31 dicembre 2027.</li>
            <li>
              Nei Comuni fino a 50.000 abitanti c'era anche un contributo PNRR del 40% della spesa, in alternativa alla detrazione e con la tariffa ridotta: verifica se lo sportello è ancora aperto.
            </li>
          </ul>
        </Card>

        <Card icon={<PiggyBank size={16} className="text-emerald-300" />} title="Altri aiuti" sources={INCENTIVE_SOURCES.other}>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-500">
            <li>
              <b>IVA al 10%</b> sui beni e sui lavori per l'impianto, invece del 22%: è già nel costo totale ({f(e.vatPct)}% nel tuo progetto).
            </li>
            <li>
              <b>Conto Termico 3.0</b>: contributo del GSE che per le case copre il fotovoltaico solo insieme alla sostituzione del riscaldamento con una pompa di calore. È in alternativa alla
              detrazione, non si sommano.
            </li>
            <li>
              <b>Reddito energetico</b>: contributo a fondo perduto per famiglie con ISEE sotto 15.000 € (30.000 € con almeno quattro figli a carico). Il rifinanziamento per il 2026 non è
              confermato.
            </li>
          </ul>
          <p className="text-[0.71875rem] text-slate-400">
            Nella stessa spesa non si possono sommare due agevolazioni alternative (per esempio detrazione e Conto Termico): scegli quella che rende di più.
          </p>
        </Card>
      </div>
      <p className="text-[0.71875rem] leading-snug text-slate-500">
        Informazioni divulgative, non sono una consulenza fiscale: percentuali, scadenze e requisiti dipendono dalla tua situazione e dalle norme in vigore quando paghi.
      </p>
    </section>
  );
}
