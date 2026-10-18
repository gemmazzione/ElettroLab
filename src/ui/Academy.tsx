import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, GraduationCap, LogOut, Play, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { useState } from 'react';
import { EXERCISES, exerciseById } from '../academy/exercises';
import { LEVELS, type Task } from '../academy/types';
import { catalogItem } from '../model/catalog';
import { useStore } from '../store/projectStore';

/** Pagina dell'Accademia: elenco degli esercizi per livello con i progressi. */
export function AcademyView() {
  const progress = useStore((s) => s.progress);
  const start = useStore((s) => s.startExercise);
  const done = EXERCISES.filter((e) => (progress[e.id]?.best ?? 0) >= 80).length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-end gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
            <GraduationCap size={26} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Accademia</h1>
            <p className="text-[13px] text-slate-400">
              Esercizi guidati dai fondamenti al trifase. Ogni esercizio usa il simulatore reale: le risposte sono confrontate con i valori calcolati dal modello e con le verifiche automatiche.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 px-4 py-2 text-right">
            <div className="font-mono text-xl text-amber-300">
              {done}/{EXERCISES.length}
            </div>
            <div className="text-[11px] text-slate-500">esercizi superati (≥ 80%)</div>
          </div>
        </div>
        {LEVELS.map((l) => (
          <section key={l.level} className="mb-8">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[12px] text-amber-300">Livello {l.level}</span>
              <h2 className="text-[17px] font-semibold text-slate-100">{l.title}</h2>
              <span className="text-[12.5px] text-slate-500">{l.description}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {EXERCISES.filter((e) => e.level === l.level).map((e) => {
                const p = progress[e.id];
                return (
                  <div key={e.id} className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <div className="mb-1 flex items-start gap-2">
                      <h3 className="flex-1 text-[14px] font-semibold text-slate-100">{e.title}</h3>
                      {p && (
                        <span
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] ${p.best >= 80 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}
                          title={`${p.attempts} tentativi`}
                        >
                          <Trophy size={11} /> {p.best}%
                        </span>
                      )}
                    </div>
                    <p className="mb-3 flex-1 text-[12.5px] leading-snug text-slate-400">{e.objective}</p>
                    <div className="mb-3 text-[11px] text-slate-500">
                      {e.tasks.length} prove · {e.tasks.reduce((n, t) => n + t.points, 0)} punti
                    </div>
                    <button
                      onClick={() => start(e.id)}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-sky-600 py-1.5 text-[12.5px] font-semibold text-white hover:bg-sky-500"
                    >
                      <Play size={13} fill="currentColor" /> {p ? 'Riprova' : 'Inizia'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TaskView({ task, index }: { task: Task; index: number }) {
  const ex = useStore((s) => s.exercise);
  const setAnswer = useStore((s) => s.setAnswer);
  const result = ex?.evaluation?.results[task.id];
  const answer = ex?.answers[task.id] ?? '';
  return (
    <div className={`rounded-md border p-2.5 ${result ? (result.ok ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-red-800/60 bg-red-950/20') : 'border-slate-800'}`}>
      <div className="flex gap-2">
        <span className="font-mono text-[11px] text-slate-500">{index + 1}.</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-snug text-slate-100">{task.text}</div>
          <div className="text-[10.5px] text-slate-500">
            {task.kind === 'check' ? 'Controllo automatico sull\'impianto' : task.kind === 'numeric' ? 'Risposta numerica' : 'Scelta multipla'} · {task.points} punti
          </div>
          {task.kind === 'numeric' && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                value={answer}
                onChange={(e) => setAnswer(task.id, e.target.value)}
                inputMode="decimal"
                placeholder="valore"
                className="w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[12px] text-slate-100 outline-none focus:border-sky-500"
              />
              <span className="text-[12px] text-slate-400">{task.unit}</span>
            </div>
          )}
          {task.kind === 'choice' && (
            <div className="mt-1.5 space-y-1">
              {task.options.map((o, k) => (
                <label key={k} className="flex cursor-pointer items-start gap-2 text-[12px] text-slate-300">
                  <input type="radio" className="mt-0.5" name={task.id} checked={answer === String(k)} onChange={() => setAnswer(task.id, String(k))} />
                  {o}
                </label>
              ))}
            </div>
          )}
          {result && (
            <div className={`mt-1.5 flex gap-1.5 text-[11.5px] leading-snug ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {result.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
              <span>{result.feedback}</span>
            </div>
          )}
          {result && task.explanation && <div className="mt-1 text-[11px] leading-snug text-slate-400">{task.explanation}</div>}
        </div>
      </div>
    </div>
  );
}

/** Pannello dell'esercizio attivo (scheda «Esercizio» della colonna destra). */
export function ExercisePanel() {
  const exState = useStore((s) => s.exercise);
  const verify = useStore((s) => s.verifyExercise);
  const retry = useStore((s) => s.retryExercise);
  const exit = useStore((s) => s.exitExercise);
  const [theory, setTheory] = useState(true);
  const ex = exState ? exerciseById(exState.id) : undefined;
  if (!ex || !exState) return null;
  const ev = exState.evaluation;
  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          Livello {ex.level} · {LEVELS.find((l) => l.level === ex.level)?.title}
        </div>
        <h3 className="text-[15px] font-semibold text-slate-100">{ex.title}</h3>
      </div>
      <div className="rounded-md border-l-2 border-sky-400 bg-sky-400/5 px-3 py-2 text-[12.5px] leading-snug text-slate-200">
        <b>Obiettivo.</b> {ex.objective}
      </div>
      <button className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200" onClick={() => setTheory(!theory)}>
        {theory ? <ChevronDown size={13} /> : <ChevronRight size={13} />} <BookOpen size={12} /> Teoria e ambiente
      </button>
      {theory && (
        <div className="space-y-2 text-[12px] leading-relaxed text-slate-300">
          <p>{ex.theory}</p>
          <p className="text-slate-400">
            <b className="text-slate-300">Ambiente: </b>
            {ex.environment}
          </p>
          <p className="text-slate-400">
            <b className="text-slate-300">Materiali: </b>
            {ex.materials.length ? ex.materials.map((m) => catalogItem(m).name).join(', ') : 'solo i componenti già presenti'}
          </p>
        </div>
      )}
      <div className="space-y-2">
        {ex.tasks.map((t, i) => (
          <TaskView key={t.id} task={t} index={i} />
        ))}
      </div>
      {ev && (
        <div className={`rounded-lg p-3 text-center ${ev.score >= 80 ? 'bg-emerald-500/15' : 'bg-amber-500/10'}`}>
          <div className={`font-mono text-2xl ${ev.score >= 80 ? 'text-emerald-300' : 'text-amber-300'}`}>{ev.score}%</div>
          <div className="text-[11.5px] text-slate-400">
            {ev.earned}/{ev.total} punti · {ev.score >= 80 ? 'esercizio superato' : 'correggi e verifica di nuovo, oppure ricomincia'}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={verify} className="col-span-3 flex items-center justify-center gap-1.5 rounded-md bg-sky-600 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-500">
          <CheckCircle2 size={14} /> Verifica
        </button>
        <button onClick={retry} className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border border-slate-700 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800">
          <RotateCcw size={13} /> Ricomincia da capo
        </button>
        <button onClick={exit} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 py-1.5 text-[12px] text-slate-300 hover:bg-slate-800">
          <LogOut size={13} /> Esci
        </button>
      </div>
    </div>
  );
}
