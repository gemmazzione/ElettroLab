import { simulate } from '../engine/simulate';
import { checkWiring } from '../graph/erc';
import type { Project } from '../model/types';
import type { ProtState } from '../protection/stepper';
import { runRules } from '../rules/engine';
import type { SimResult } from '../engine/simulate';
import type { Evaluation, Exercise, ExerciseCtx, TaskResult } from './types';

const fmt = (v: number) => v.toLocaleString('it-IT', { maximumFractionDigits: v < 10 ? 2 : 1 });

export function buildCtx(s: {
  project: Project;
  running: boolean;
  result: SimResult | null;
  prot: ProtState;
  probes: { red?: string; black?: string };
  clampTarget: ExerciseCtx['clampTarget'];
}): ExerciseCtx {
  let design: SimResult | null = null;
  let norm: ReturnType<typeof runRules> | null = null;
  return {
    project: s.project,
    running: s.running,
    live: s.running ? s.result : null,
    prot: s.prot,
    probes: s.probes,
    clampTarget: s.clampTarget,
    design: () => (design ??= simulate(s.project, { closed: () => true })),
    issues: () => checkWiring(s.project),
    norm: () => (norm ??= runRules(s.project)),
    byLabel: (label) => s.project.components.find((c) => c.label === label),
    loadByName: (name) => s.project.components.find((c) => c.params.kind === 'load' && c.params.p.name === name),
  };
}

/** Interpreta un numero scritto in italiano ("1.234,5" o "1234.5"). */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}

export function evaluate(ex: Exercise, ctx: ExerciseCtx, answers: Record<string, string>): Evaluation {
  const results: Record<string, TaskResult> = {};
  let earned = 0;
  let total = 0;
  for (const task of ex.tasks) {
    total += task.points;
    let r: TaskResult;
    try {
      if (task.kind === 'check') {
        const o = task.check(ctx);
        r = { ok: o.ok, points: o.ok ? task.points : 0, feedback: o.ok ? 'Controllo superato.' : (o.hint ?? 'Controllo non superato.') };
      } else if (task.kind === 'numeric') {
        const given = parseNumber(answers[task.id] ?? '');
        const expected = task.expected(ctx);
        if (expected === null) {
          r = { ok: false, points: 0, feedback: 'Valore atteso non calcolabile nello stato attuale dell\'impianto: verifica che il circuito sia collegato.' };
        } else if (given === null) {
          r = { ok: false, points: 0, feedback: `Nessuna risposta. Valore atteso: ${fmt(expected)} ${task.unit}.` };
        } else {
          const tol = Math.max(task.toleranceAbs ?? 0, (Math.abs(expected) * (task.tolerancePct ?? 3)) / 100);
          const ok = Math.abs(given - expected) <= tol;
          r = {
            ok,
            points: ok ? task.points : 0,
            feedback: ok
              ? `Corretto: il modello calcola ${fmt(expected)} ${task.unit}.`
              : `Il modello calcola ${fmt(expected)} ${task.unit} (tolleranza ± ${fmt(tol)} ${task.unit}); hai risposto ${fmt(given)} ${task.unit}.`,
          };
        }
      } else {
        const given = answers[task.id];
        const ok = given !== undefined && Number(given) === task.correct;
        r = {
          ok,
          points: ok ? task.points : 0,
          feedback: ok ? 'Risposta corretta.' : `Risposta corretta: «${task.options[task.correct]}».`,
        };
      }
    } catch (err) {
      r = { ok: false, points: 0, feedback: `Controllo non eseguibile: ${(err as Error).message}` };
    }
    earned += r.points;
    results[task.id] = r;
  }
  return { results, earned, total, score: total ? Math.round((earned / total) * 100) : 0 };
}

// ------------------------------------------------------------------ progressi

const PROGRESS_KEY = 'electrolab.academy.v1';

export interface Progress {
  best: number;
  attempts: number;
}

export function loadProgress(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Record<string, Progress>;
  } catch {
    return {};
  }
}

export function saveProgress(id: string, score: number): Record<string, Progress> {
  const all = loadProgress();
  const prev = all[id] ?? { best: 0, attempts: 0 };
  all[id] = { best: Math.max(prev.best, score), attempts: prev.attempts + 1 };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* memoria locale non disponibile */
  }
  return all;
}
