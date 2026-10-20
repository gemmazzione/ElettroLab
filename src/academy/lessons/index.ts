import { BASICS_LESSONS } from './basics';
import { PROTECTION_LESSONS } from './protection';
import { SYSTEM_LESSONS } from './systems';
import { TRACKS, type Lesson, type TrackId } from './types';

export * from './types';

export const LESSONS: Lesson[] = [...BASICS_LESSONS, ...PROTECTION_LESSONS, ...SYSTEM_LESSONS];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** Lezioni di un percorso, dal livello più basso al più alto. */
export function lessonsOf(track: TrackId): Lesson[] {
  return LESSONS.filter((l) => l.track === track).sort((a, b) => a.level - b.level);
}

export const trackById = (id: TrackId) => TRACKS.find((t) => t.id === id)!;

// ------------------------------------------------------------------ progressi (memoria locale del browser)

export interface LessonProgress {
  /** Miglior numero di risposte corrette al quiz */
  best: number;
  total: number;
  /** Lezione completata (quiz superato) */
  done: boolean;
}

const KEY = 'electrolab.lessons.v1';

/** Quiz superato: almeno due terzi delle risposte corrette. */
export const quizPassed = (correct: number, total: number) => total > 0 && correct / total >= 2 / 3;

export function loadLessonProgress(): Record<string, LessonProgress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, LessonProgress>;
  } catch {
    return {};
  }
}

export function saveLessonResult(id: string, correct: number, total: number): Record<string, LessonProgress> {
  const all = loadLessonProgress();
  const prev = all[id];
  const best = Math.max(prev?.best ?? 0, correct);
  all[id] = { best, total, done: (prev?.done ?? false) || quizPassed(correct, total) };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* memoria locale non disponibile: i progressi valgono solo per questa sessione */
  }
  return all;
}
