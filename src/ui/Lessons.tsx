import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Cable,
  CheckCircle2,
  Circle,
  Clock,
  FlaskConical,
  Gauge,
  Info,
  LayoutGrid,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sun,
  ToggleRight,
  Triangle,
  XCircle,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { exerciseById } from '../academy/exercises';
import {
  LESSON_LEVELS,
  lessonById,
  lessonsOf,
  quizPassed,
  saveLessonResult,
  trackById,
  TRACKS,
  type Lesson,
  type LessonProgress,
  type Track,
  type TrackId,
} from '../academy/lessons';
import { catalogItem } from '../model/catalog';
import { DEMO_PROJECTS } from '../projects/demos';
import { useStore } from '../store/projectStore';

const TRACK_ICON: Record<Track['icon'], typeof Zap> = {
  zap: Zap,
  shield: Shield,
  'shield-check': ShieldCheck,
  cable: Cable,
  'layout-grid': LayoutGrid,
  'toggle-right': ToggleRight,
  triangle: Triangle,
  gauge: Gauge,
  sun: Sun,
};

const LEVEL_STYLE = ['bg-emerald-500/15 text-emerald-300', 'bg-sky-500/15 text-sky-300', 'bg-amber-500/15 text-amber-300', 'bg-rose-500/15 text-rose-300'];

function LevelBadge({ level }: { level: Lesson['level'] }) {
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${LEVEL_STYLE[level]}`}>L{level} · {LESSON_LEVELS[level].name}</span>;
}

/** Ultima posizione nell'elenco delle lezioni (sopravvive al passaggio tra laboratorio e Accademia). */
let lastTrack: TrackId = 'elettricita';
let lastLesson: string | null = null;

/** Percorsi verticali di lezioni per tema, dal livello «base base» all'avanzato. */
export function LessonsView({
  progress,
  setProgress,
}: {
  progress: Record<string, LessonProgress>;
  setProgress: (p: Record<string, LessonProgress>) => void;
}) {
  const [track, setTrackState] = useState<TrackId>(lastTrack);
  const [open, setOpenState] = useState<string | null>(lastLesson);
  const setTrack = (t: TrackId) => {
    lastTrack = t;
    setTrackState(t);
    setOpen(null);
  };
  const setOpen = (id: string | null) => {
    lastLesson = id;
    setOpenState(id);
  };
  const lesson = open ? lessonById(open) : undefined;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="shrink-0 lg:w-64" aria-label="Percorsi">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Percorsi</h2>
        <ul className="space-y-1">
          {TRACKS.map((t) => {
            const Icon = TRACK_ICON[t.icon];
            const ls = lessonsOf(t.id);
            const done = ls.filter((l) => progress[l.id]?.done).length;
            const active = t.id === track;
            return (
              <li key={t.id}>
                <button
                  onClick={() => setTrack(t.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${active ? 'bg-slate-800 ring-1 ring-slate-700' : 'hover:bg-slate-900'}`}
                >
                  <Icon size={16} className={active ? 'text-amber-300' : 'text-slate-500'} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] font-semibold ${active ? 'text-slate-100' : 'text-slate-300'}`}>{t.title}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded bg-slate-800">
                      <span className="block h-full rounded bg-emerald-400" style={{ width: `${(done / ls.length) * 100}%` }} />
                    </span>
                  </span>
                  <span className="font-mono text-[10.5px] text-slate-500">
                    {done}/{ls.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        {lesson ? (
          <LessonReader
            key={lesson.id}
            lesson={lesson}
            progress={progress[lesson.id]}
            onBack={() => setOpen(null)}
            onOpen={setOpen}
            onResult={(c, t) => setProgress(saveLessonResult(lesson.id, c, t))}
          />
        ) : (
          <TrackLadder track={track} progress={progress} onOpen={setOpen} />
        )}
      </div>
    </div>
  );
}

function TrackLadder({ track, progress, onOpen }: { track: TrackId; progress: Record<string, LessonProgress>; onOpen: (id: string) => void }) {
  const t = trackById(track);
  const ls = lessonsOf(track);
  const next = ls.find((l) => !progress[l.id]?.done);
  return (
    <section>
      <h2 className="text-[20px] font-bold tracking-tight text-slate-100">{t.title}</h2>
      <p className="mb-5 text-[13px] text-slate-400">{t.description}</p>
      <ol className="relative space-y-3 border-l-2 border-slate-800 pl-6">
        {ls.map((l) => {
          const p = progress[l.id];
          const isNext = next?.id === l.id;
          return (
            <li key={l.id} className="relative">
              <span className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950">
                {p?.done ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Circle size={14} className={isNext ? 'text-amber-300' : 'text-slate-600'} />}
              </span>
              <button
                onClick={() => onOpen(l.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${isNext ? 'border-amber-500/50 bg-slate-900' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'}`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <LevelBadge level={l.level} />
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock size={11} /> {l.minutes} min
                  </span>
                  {isNext && <span className="text-[11px] font-semibold text-amber-300">Prossima lezione</span>}
                  {p && (
                    <span className="ml-auto font-mono text-[11px] text-slate-400">
                      quiz {p.best}/{p.total}
                    </span>
                  )}
                </div>
                <h3 className="text-[15px] font-semibold text-slate-100">{l.title}</h3>
                <p className="mt-1 text-[12.5px] leading-snug text-slate-400">{l.goals.join(' · ')}</p>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((p, i) => (
        <p key={i} className="mb-2 text-[14px] leading-relaxed text-slate-300">
          {p}
        </p>
      ))}
    </>
  );
}

function LessonReader({
  lesson,
  progress,
  onBack,
  onOpen,
  onResult,
}: {
  lesson: Lesson;
  progress: LessonProgress | undefined;
  onBack: () => void;
  onOpen: (id: string) => void;
  onResult: (correct: number, total: number) => void;
}) {
  const siblings = lessonsOf(lesson.track);
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  return (
    <article className="max-w-3xl">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[12.5px] text-slate-400 hover:text-slate-100">
        <ArrowLeft size={14} /> {trackById(lesson.track).title}
      </button>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <LevelBadge level={lesson.level} />
        <span className="flex items-center gap-1 text-[11.5px] text-slate-500">
          <Clock size={12} /> {lesson.minutes} min
        </span>
        {progress?.done && (
          <span className="flex items-center gap-1 text-[11.5px] font-semibold text-emerald-300">
            <CheckCircle2 size={12} /> completata
          </span>
        )}
      </div>
      <h1 className="mb-3 text-[24px] font-bold tracking-tight text-slate-50">{lesson.title}</h1>
      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Alla fine saprai</div>
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-slate-300">
          {lesson.goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>

      {lesson.sections.map((s) => (
        <section key={s.title} className="mb-6">
          <h2 className="mb-2 text-[17px] font-semibold text-slate-100">{s.title}</h2>
          <Paragraphs text={s.body} />
          {s.formula && <div className="my-3 rounded-lg bg-slate-900 px-4 py-3 font-mono text-[14px] text-amber-200 ring-1 ring-slate-800">{s.formula}</div>}
          {s.example && (
            <div className="my-3 rounded-lg border-l-2 border-sky-500 bg-sky-500/5 px-4 py-2.5 text-[13.5px] leading-relaxed text-slate-300">
              <span className="mr-1 font-semibold text-sky-300">Esempio.</span>
              {s.example}
            </div>
          )}
        </section>
      ))}

      <section className="mb-6 rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-4">
        <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-emerald-200">
          <BookOpenCheck size={16} /> Da ricordare
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-slate-200">
          {lesson.keyPoints.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </section>

      <Quiz lesson={lesson} onResult={onResult} />
      {lesson.practice && <Practice lesson={lesson} />}

      <div className="mt-8 flex items-center gap-3 border-t border-slate-800 pt-4">
        {prev ? (
          <button onClick={() => onOpen(prev.id)} className="flex items-center gap-1.5 text-[12.5px] text-slate-400 hover:text-slate-100">
            <ArrowLeft size={14} /> {prev.title}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button onClick={() => onOpen(next.id)} className="ml-auto flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-sky-500">
            Livello successivo: {next.title} <ArrowRight size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

function Quiz({ lesson, onResult }: { lesson: Lesson; onResult: (correct: number, total: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const total = lesson.quiz.length;
  const correct = useMemo(() => lesson.quiz.filter((q, i) => answers[i] === q.correct).length, [answers, lesson]);
  const complete = Object.keys(answers).length === total;
  return (
    <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-[15px] font-semibold text-slate-100">Verifica</h2>
      <ol className="space-y-4">
        {lesson.quiz.map((q, i) => {
          const chosen = answers[i];
          return (
            <li key={i}>
              <fieldset>
                <legend className="mb-1.5 text-[13.5px] font-medium text-slate-200">
                  {i + 1}. {q.q}
                </legend>
                <div className="space-y-1">
                  {q.options.map((o, k) => {
                    const right = checked && k === q.correct;
                    const wrong = checked && chosen === k && k !== q.correct;
                    return (
                      <label
                        key={k}
                        className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                          right ? 'bg-emerald-500/15 text-emerald-200' : wrong ? 'bg-red-500/15 text-red-200' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${lesson.id}-q${i}`}
                          className="mt-0.5"
                          checked={chosen === k}
                          disabled={checked}
                          onChange={() => setAnswers({ ...answers, [i]: k })}
                        />
                        <span className="flex-1">{o}</span>
                        {right && <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
                        {wrong && <XCircle size={15} className="mt-0.5 shrink-0" />}
                      </label>
                    );
                  })}
                </div>
                {checked && <p className="mt-1.5 pl-2 text-[12.5px] leading-snug text-slate-400">{q.why}</p>}
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!checked ? (
          <button
            disabled={!complete}
            onClick={() => {
              setChecked(true);
              onResult(correct, total);
            }}
            className="rounded-md bg-amber-400 px-3 py-1.5 text-[12.5px] font-semibold text-slate-950 enabled:hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Verifica le risposte
          </button>
        ) : (
          <>
            <span className={`text-[13.5px] font-semibold ${quizPassed(correct, total) ? 'text-emerald-300' : 'text-amber-300'}`}>
              {correct}/{total} corrette · {quizPassed(correct, total) ? 'lezione completata' : 'ripassa e riprova (servono almeno due terzi)'}
            </span>
            <button
              onClick={() => {
                setAnswers({});
                setChecked(false);
              }}
              className="flex items-center gap-1 text-[12.5px] text-slate-400 hover:text-slate-100"
            >
              <RotateCcw size={13} /> Riprova
            </button>
          </>
        )}
        {!complete && !checked && <span className="text-[11.5px] text-slate-500">Rispondi a tutte le domande.</span>}
      </div>
    </section>
  );
}

function Practice({ lesson }: { lesson: Lesson }) {
  const startExercise = useStore((s) => s.startExercise);
  const openProject = useStore((s) => s.openProject);
  const setMode = useStore((s) => s.setMode);
  const showInfo = useStore((s) => s.setInfoItem);
  const p = lesson.practice!;
  const ex = p.exercise ? exerciseById(p.exercise) : undefined;
  const demo = p.demo ? DEMO_PROJECTS.find((d) => d.id === p.demo) : undefined;
  const openDemo = () => {
    if (!demo) return;
    if (!window.confirm(`Aprire «${demo.name}» nel laboratorio? Il progetto attuale viene sostituito: salvalo prima nella libreria se ti serve.`)) return;
    openProject(demo.build());
    setMode('lab');
  };
  return (
    <section className="rounded-lg border border-sky-800/60 bg-sky-950/20 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-sky-200">
        <FlaskConical size={16} /> Mettilo in pratica
      </h2>
      {p.hint && <p className="mb-3 text-[13px] leading-snug text-slate-300">{p.hint}</p>}
      <div className="flex flex-wrap gap-2">
        {ex && (
          <button onClick={() => startExercise(ex.id)} className="rounded-md bg-sky-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-sky-500">
            Esercizio: {ex.title}
          </button>
        )}
        {demo && (
          <button onClick={openDemo} className="rounded-md bg-slate-800 px-3 py-1.5 text-[12.5px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700">
            Apri il progetto «{demo.name}»
          </button>
        )}
        {p.info?.map((id) => (
          <button key={id} onClick={() => showInfo(id)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
            <Info size={13} /> {catalogItem(id).name}
          </button>
        ))}
      </div>
    </section>
  );
}
