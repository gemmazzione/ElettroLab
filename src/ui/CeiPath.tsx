import { useMemo, useState } from 'react';
import { BookOpenCheck, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, FlaskConical, PencilRuler, RotateCcw, XCircle } from 'lucide-react';
import { ALL_CARDS, CEI_EDITION, CEI_TOPICS, dueCards, INTERVALS, loadCeiProgress, mastered, recordAnswer, today, type CeiCard, type CeiProgress, type CeiQuestion, type Practice } from '../academy/cei';
import { useImpianto } from '../impianto/store';
import { useStore } from '../store/projectStore';

/**
 * Percorso di studio della CEI 64-8 nell'Accademia: argomenti in ordine, una scheda per prescrizione
 * (rischio, regola, condizioni, eccezioni, esempio, articolo), esercizi collegati e ripasso a 1, 7 e 30 giorni.
 */

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

function badge(progress: CeiProgress, id: string): { text: string; cls: string } {
  const s = progress[id];
  if (!s) return { text: 'da studiare', cls: 'bg-slate-800 text-slate-400' };
  if (s.due <= today()) return { text: 'da ripassare oggi', cls: 'bg-amber-500/20 text-amber-200' };
  if (s.box >= INTERVALS.length) return { text: `acquisita · ripasso ${fmtDate(s.due)}`, cls: 'bg-emerald-500/15 text-emerald-300' };
  return { text: `ripasso ${fmtDate(s.due)}`, cls: 'bg-sky-500/15 text-sky-200' };
}

export function CeiPathView() {
  const [progress, setProgress] = useState<CeiProgress>(() => loadCeiProgress());
  const [topicId, setTopicId] = useState(CEI_TOPICS[0]!.id);
  const [review, setReview] = useState(false);
  const due = useMemo(() => dueCards(progress), [progress]);
  const studied = ALL_CARDS.filter((c) => progress[c.id]).length;
  const topic = CEI_TOPICS.find((t) => t.id === topicId)!;
  const answer = (id: string, ok: boolean) => setProgress(recordAnswer(id, ok));

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h2 className="text-[1.0625rem] font-semibold text-slate-100">Percorso CEI 64-8</h2>
          <p className="mt-1 max-w-[70ch] text-[0.8125rem] leading-relaxed text-slate-300">
            Un argomento alla volta, nell'ordine della progettazione. Per ogni prescrizione una scheda: rischio, regola, condizioni, eccezioni, esempio e articolo. Poi un esercizio sull'impianto e le domande di ripasso, che tornano dopo 1, 7 e 30 giorni.
          </p>
          <p className="mt-2 max-w-[70ch] text-[0.75rem] leading-snug text-slate-400">
            Sessione consigliata da 45–60 minuti: 15 minuti sul manuale per capire, 20 sul testo della norma per verificare, 15 di esercizi e domande. Negli appunti scrivi sempre edizione e articolo.
          </p>
          <p className="mt-2 max-w-[70ch] rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.71875rem] leading-snug text-amber-100">
            Gli articoli sono quelli della {CEI_EDITION}, letti sul testo. Dal 1/11/2024 vale la IX edizione: numerazione e alcune prescrizioni sono cambiate. Usa le schede per capire il ragionamento e verifica sul testo vigente.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3 lg:flex-col lg:items-end">
          <Stat value={`${studied}/${ALL_CARDS.length}`} label="schede studiate" tone="text-sky-300" />
          <Stat value={`${mastered(progress)}`} label="acquisite (ripasso a 30 giorni)" tone="text-emerald-300" />
          <button
            onClick={() => setReview(true)}
            disabled={!due.length}
            className="flex items-center gap-1.5 rounded-md bg-amber-400 px-3 py-2 text-[0.8125rem] font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CalendarClock size={15} /> Ripasso di oggi ({due.length})
          </button>
        </div>
      </section>

      {review ? (
        <ReviewSession ids={due} progress={progress} onAnswer={answer} onClose={() => setReview(false)} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Argomenti del percorso" className="space-y-1 lg:sticky lg:top-4 lg:self-start">
            {CEI_TOPICS.map((t) => {
              const n = t.cards.filter((c) => progress[c.id]).length;
              return (
                <button
                  key={t.id}
                  onClick={() => setTopicId(t.id)}
                  aria-current={t.id === topicId ? 'page' : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[0.8125rem] ${t.id === topicId ? 'bg-slate-800 font-semibold text-white' : 'text-slate-300 hover:bg-slate-900'}`}
                >
                  <span>{t.title}</span>
                  <span className={`shrink-0 font-mono text-[0.6875rem] ${n === t.cards.length ? 'text-emerald-300' : 'text-slate-500'}`}>
                    {n}/{t.cards.length}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="space-y-4">
            <div>
              <h3 className="text-[1rem] font-semibold text-slate-100">{topic.title}</h3>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-slate-300">{topic.intro}</p>
            </div>
            {topic.cards.map((c) => (
              <CardView key={c.id} card={c} progress={progress} onAnswer={answer} />
            ))}
            <PracticeBox items={topic.practice} />
          </div>
        </div>
      )}
    </div>
  );
}

const Stat = ({ value, label, tone }: { value: string; label: string; tone: string }) => (
  <div className="rounded-lg border border-slate-800 px-4 py-2 text-right">
    <div className={`font-mono text-xl ${tone}`}>{value}</div>
    <div className="text-[0.6875rem] text-slate-500">{label}</div>
  </div>
);

function CardView({ card, progress, onAnswer }: { card: CeiCard; progress: CeiProgress; onAnswer: (id: string, ok: boolean) => void }) {
  const [open, setOpen] = useState(!progress[card.id]);
  const b = badge(progress, card.id);
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/60">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
        <span className="flex-1 text-[0.875rem] font-semibold text-slate-100">{card.title}</span>
        <span className="hidden font-mono text-[0.6875rem] text-slate-500 sm:inline">{card.articles}</span>
        <span className={`rounded px-2 py-0.5 text-[0.65625rem] ${b.cls}`}>{b.text}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-800 px-4 py-3">
          <dl className="grid gap-x-4 gap-y-2 text-[0.8125rem] leading-relaxed sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Item k="Rischio" v={card.risk} />
            <Item k="Regola" v={card.rule} strong />
            <Item k="Condizioni" v={card.conditions} />
            {card.exceptions && <Item k="Eccezioni" v={card.exceptions} />}
            <Item k="Esempio" v={card.example} />
            <Item k="Articoli" v={`${card.articles} — ${CEI_EDITION}`} mono />
          </dl>
          <Quiz card={card} onDone={(ok) => onAnswer(card.id, ok)} />
        </div>
      )}
    </article>
  );
}

const Item = ({ k, v, strong, mono }: { k: string; v: string; strong?: boolean; mono?: boolean }) => (
  <>
    <dt className="text-[0.71875rem] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
    <dd className={`${strong ? 'text-slate-100' : 'text-slate-300'} ${mono ? 'font-mono text-[0.75rem]' : ''}`}>{v}</dd>
  </>
);

/** Domande della scheda: superata se tutte giuste. */
function Quiz({ card, onDone, questions = card.questions }: { card: CeiCard; onDone: (ok: boolean) => void; questions?: CeiQuestion[] }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const all = picked.every((x) => x !== null);
  const ok = picked.every((x, i) => x === questions[i]!.answer);
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold text-slate-200">
        <BookOpenCheck size={14} className="text-amber-300" /> Mettiti alla prova
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <fieldset key={i}>
            <legend className="mb-1.5 text-[0.8125rem] text-slate-100">{q.q}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {q.options.map((o, j) => {
                const sel = picked[i] === j;
                const right = checked && j === q.answer;
                const wrong = checked && sel && j !== q.answer;
                return (
                  <label
                    key={j}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-[0.78125rem] ${right ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : wrong ? 'border-red-500/60 bg-red-500/10 text-red-200' : sel ? 'border-sky-500 text-slate-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                  >
                    <input type="radio" className="accent-sky-500" name={`${card.id}-${i}`} checked={sel} disabled={checked} onChange={() => setPicked((p) => p.map((x, k) => (k === i ? j : x)))} />
                    {o}
                  </label>
                );
              })}
            </div>
            {checked && <p className="mt-1 text-[0.75rem] leading-snug text-slate-400">{q.explain}</p>}
          </fieldset>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {!checked ? (
          <button
            disabled={!all}
            onClick={() => {
              setChecked(true);
              onDone(ok);
            }}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
          >
            Verifica
          </button>
        ) : (
          <>
            <span className={`flex items-center gap-1 text-[0.78125rem] font-semibold ${ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {ok ? 'Giusto: la scheda torna al prossimo intervallo di ripasso.' : 'Da rivedere: la scheda torna domani.'}
            </span>
            <button
              onClick={() => {
                setChecked(false);
                setPicked(questions.map(() => null));
              }}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] text-slate-400 hover:bg-slate-800"
            >
              <RotateCcw size={13} /> Riprova
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewSession({ ids, progress, onAnswer, onClose }: { ids: string[]; progress: CeiProgress; onAnswer: (id: string, ok: boolean) => void; onClose: () => void }) {
  // Coda fissata all'inizio: le schede risposte escono dal ripasso di oggi.
  const [queue] = useState(ids);
  const [i, setI] = useState(0);
  const card = ALL_CARDS.find((c) => c.id === queue[i]);
  if (!card)
    return (
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={28} />
        <p className="text-[0.9375rem] font-semibold text-emerald-200">Ripasso di oggi completato</p>
        <p className="mt-1 text-[0.8125rem] text-slate-300">{ALL_CARDS.filter((c) => progress[c.id]).length} schede nel ripasso; le prossime tornano alle loro date.</p>
        <button onClick={onClose} className="mt-4 rounded-md bg-slate-800 px-3 py-1.5 text-[0.8125rem] text-slate-100 hover:bg-slate-700">
          Torna al percorso
        </button>
      </section>
    );
  // Una domanda a rotazione per scheda
  const q = card.questions[(progress[card.id]?.seen ?? 0) % card.questions.length]!;
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.75rem] text-slate-400">
          Ripasso · scheda {i + 1} di {queue.length}
        </span>
        <button onClick={onClose} className="text-[0.75rem] text-slate-400 hover:text-slate-200">
          Interrompi
        </button>
      </div>
      <h3 className="text-[0.9375rem] font-semibold text-slate-100">{card.title}</h3>
      <p className="text-[0.75rem] text-slate-500">Prova a ricordare la regola prima di rispondere; dopo la risposta trovi l'articolo.</p>
      <Quiz key={card.id} card={card} questions={[q]} onDone={(ok) => onAnswer(card.id, ok)} />
      <details className="text-[0.78125rem] text-slate-300">
        <summary className="cursor-pointer text-slate-400">Rileggi la scheda ({card.articles})</summary>
        <p className="mt-2">{card.rule}</p>
        <p className="mt-1 text-slate-400">{card.conditions}</p>
      </details>
      <button onClick={() => setI(i + 1)} className="rounded-md bg-amber-400 px-3 py-1.5 text-[0.8125rem] font-semibold text-slate-950 hover:bg-amber-300">
        Avanti →
      </button>
    </section>
  );
}

function PracticeBox({ items }: { items: Practice[] }) {
  const start = useStore((s) => s.startExercise);
  const setMode = useStore((s) => s.setMode);
  const setStep = useImpianto((s) => s.setStep);
  if (!items.length) return null;
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <h4 className="mb-1 text-[0.8125rem] font-semibold text-slate-100">Applica a un impianto</h4>
      <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">Fai la scelta nel simulatore, poi cerca nella norma l'articolo che la giustifica: è il modo più rapido per ricordarlo.</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.label}
            onClick={() => {
              if (it.kind === 'exercise') start(it.id);
              else {
                setStep(it.step);
                setMode('impianto');
              }
            }}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-[0.75rem] text-slate-200 hover:border-sky-500 hover:bg-slate-800"
          >
            {it.kind === 'exercise' ? <FlaskConical size={13} /> : <PencilRuler size={13} />}
            {it.label}
          </button>
        ))}
      </div>
    </section>
  );
}
