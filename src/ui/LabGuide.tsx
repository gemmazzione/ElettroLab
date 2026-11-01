import { Check, ChevronDown, ChevronUp, GraduationCap, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '../store/projectStore';

/*
 * Primi passi nel laboratorio: quattro azioni che portano a vedere l'impianto funzionare.
 * Ogni passo si spunta da solo quando l'azione avviene davvero nel simulatore (stato della simulazione,
 * utilizzatori alimentati, puntali del multimetro, intervento di una protezione) e resta spuntato.
 * Preferenza di questo dispositivo: chiusa o ridotta resta così.
 */

const KEY = 'electrolab.labGuide';

interface GuideState {
  done: number[];
  hidden: boolean;
  minimized: boolean;
}

function load(): GuideState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { done: [], hidden: false, minimized: false, ...(JSON.parse(raw) as Partial<GuideState>) };
  } catch {
    /* memoria locale non disponibile */
  }
  return { done: [], hidden: false, minimized: false };
}

const STEPS = [
  { title: 'Avvia la simulazione', hint: 'Premi il pulsante verde «Avvia simulazione» in alto.' },
  { title: "Dai corrente all'impianto", hint: "Clicca la leva dell'interruttore generale (di solito Q1) per chiuderlo: le linee degli utilizzatori si accendono." },
  { title: 'Misura una tensione', hint: 'Scegli il multimetro nella barra in alto e clicca due morsetti, per esempio L e N di un utilizzatore.' },
  { title: 'Fai intervenire una protezione', hint: 'Seleziona un utilizzatore e inserisci un guasto dal pannello delle proprietà, oppure premi il tasto di prova «T» del differenziale.' },
] as const;

export function LabGuide() {
  const [g, setG] = useState<GuideState>(load);
  const exercise = useStore((s) => !!s.exercise);
  // Rilevamento dei passi nel simulatore.
  const running = useStore((s) => s.running);
  const powered = useStore((s) => !!s.result && s.result.ok && [...s.result.loads.values()].some((l) => l.energized && l.p > 1));
  const measured = useStore((s) => s.tool === 'multimeter' && !!s.probes.red && !!s.probes.black);
  const tripped = useStore((s) => Object.values(s.prot).some((p) => !!p?.tripped));
  const now = [running, running && powered, measured, running && tripped];

  const save = (next: GuideState) => {
    setG(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* memoria locale non disponibile */
    }
  };
  useEffect(() => {
    const add = now.map((v, i) => (v && !g.done.includes(i) ? i : -1)).filter((i) => i >= 0);
    if (add.length) save({ ...g, done: [...g.done, ...add] });
  }, [running, powered, measured, tripped]);

  if (g.hidden || exercise) return null;
  const doneCount = STEPS.filter((_, i) => g.done.includes(i)).length;
  const current = STEPS.findIndex((_, i) => !g.done.includes(i));
  const finished = current === -1;
  const goAcademy = () => {
    useStore.getState().setMode('academy');
    save({ ...g, hidden: true });
  };

  if (g.minimized) {
    return (
      <button
        onClick={() => save({ ...g, minimized: false })}
        className="pv-pop-in absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-[0.75rem] font-semibold text-slate-200 shadow-[0_6px_18px_rgba(2,6,23,0.55)] hover:border-amber-400/60"
        aria-label="Mostra i primi passi"
      >
        <Sparkles size={14} className="text-amber-300" /> Primi passi {doneCount}/{STEPS.length}
        <ChevronDown size={14} className="text-slate-500" />
      </button>
    );
  }

  return (
    <section
      className="pv-pop-in absolute left-3 top-3 z-20 w-[min(21rem,calc(100%-1.5rem))] rounded-xl border border-slate-700 bg-slate-900/95 shadow-[0_10px_30px_rgba(2,6,23,0.6)] backdrop-blur"
      aria-label="Primi passi nel laboratorio"
    >
      <header className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <Sparkles size={15} className="text-amber-300" />
        <h2 className="flex-1 text-[0.8125rem] font-semibold text-white">{finished ? 'Ce l\'hai fatta!' : 'Primi passi'}</h2>
        <span className="text-[0.6875rem] tabular-nums text-slate-400">
          {doneCount}/{STEPS.length}
        </span>
        <button onClick={() => save({ ...g, minimized: true })} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Riduci">
          <ChevronUp size={15} />
        </button>
        <button onClick={() => save({ ...g, hidden: true })} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Chiudi i primi passi">
          <X size={15} />
        </button>
      </header>
      <div className="h-0.5 bg-slate-800">
        <div className="pv-progress h-full bg-amber-400" style={{ transform: `scaleX(${Math.max(0.04, doneCount / STEPS.length)})` }} />
      </div>
      <ol className="space-y-1 px-3 py-2.5">
        {STEPS.map((s, i) => {
          const ok = g.done.includes(i);
          const active = i === current;
          return (
            <li key={s.title} className={`flex gap-2.5 rounded-lg px-2 py-1.5 ${active ? 'bg-amber-400/[0.08]' : ''}`}>
              <span
                key={ok ? 'ok' : 'n'}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${ok ? 'pv-pop bg-emerald-500/20 text-emerald-300' : active ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}
              >
                {ok ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[0.8125rem] font-medium ${ok ? 'text-slate-400 line-through decoration-slate-600' : 'text-slate-100'}`}>{s.title}</span>
                {active && <span className="pv-pop-in mt-0.5 block text-[0.75rem] leading-snug text-slate-300">{s.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {finished && (
        <div className="pv-pop-in border-t border-slate-800 px-3 py-2.5 text-[0.75rem] leading-snug text-slate-300">
          Hai acceso un impianto, misurato una tensione e visto intervenire una protezione. Per capire il perché di ogni passo:
          <button
            onClick={goAcademy}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[0.8125rem] font-semibold text-slate-950 transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.98]"
          >
            <GraduationCap size={15} /> Continua nell'Accademia
          </button>
        </div>
      )}
    </section>
  );
}

/** Progetto vuoto: come iniziare (esempio pronto oppure fornitura e terra già posizionate). */
export function EmptyProject({ onOpenExamples, onOpenCatalog }: { onOpenExamples: () => void; onOpenCatalog: () => void }) {
  const empty = useStore((s) => s.project.components.length === 0);
  const view = useStore((s) => s.view);
  const add = useStore((s) => s.addComponent);
  if (!empty || view !== 'quadro') return null;
  const start = () => {
    add('supply-mono', { x: -280, y: 40 });
    add('earth', { x: -260, y: 420 });
    // Dopo l'aggiunta (che chiude il catalogo sugli schermi stretti) si apre il catalogo per il passo successivo.
    window.setTimeout(onOpenCatalog, 120);
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <section className="pv-pop-in pointer-events-auto w-full max-w-[26rem] rounded-xl border border-slate-700 bg-slate-900/95 p-5 text-center shadow-[0_10px_30px_rgba(2,6,23,0.6)]">
        <h2 className="text-[1rem] font-semibold text-white">Progetto vuoto</h2>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-slate-300">
          Un impianto parte sempre dalla fornitura (il contatore) e dall'impianto di terra; poi si aggiungono l'interruttore generale, le protezioni e gli utilizzatori, e si collegano i morsetti
          trascinando da uno all'altro.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={start}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-[0.8125rem] font-semibold text-slate-950 transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.98]"
          >
            Inizia da fornitura e terra
          </button>
          <button onClick={onOpenExamples} className="rounded-lg bg-slate-700 px-4 py-2.5 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-slate-600">
            Apri un esempio pronto
          </button>
        </div>
      </section>
    </div>
  );
}
