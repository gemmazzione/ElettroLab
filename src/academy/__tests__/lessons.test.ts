import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../model/catalog';
import { DEMO_PROJECTS } from '../../projects/demos';
import { exerciseById } from '../exercises';
import { LESSONS, lessonsOf, quizPassed, TRACKS } from '../lessons';

describe('lezioni dell\'Accademia', () => {
  it('ogni percorso parte dal livello «base base» e sale di livello', () => {
    for (const t of TRACKS) {
      const ls = lessonsOf(t.id);
      expect(ls.length, t.id).toBeGreaterThanOrEqual(3);
      expect(ls[0]!.level, t.id).toBe(0);
      for (let i = 1; i < ls.length; i++) expect(ls[i]!.level).toBeGreaterThanOrEqual(ls[i - 1]!.level);
    }
  });

  it('identificativi univoci e contenuti completi', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(l.sections.length, l.id).toBeGreaterThan(0);
      expect(l.keyPoints.length, l.id).toBeGreaterThan(0);
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(3);
      for (const q of l.quiz) {
        expect(q.correct, `${l.id}: ${q.q}`).toBeGreaterThanOrEqual(0);
        expect(q.correct, `${l.id}: ${q.q}`).toBeLessThan(q.options.length);
        expect(q.why.length).toBeGreaterThan(0);
      }
    }
  });

  it('i collegamenti al laboratorio puntano a esercizi, progetti e articoli esistenti', () => {
    const catalog = new Set(CATALOG.map((c) => c.id));
    for (const l of LESSONS) {
      const p = l.practice;
      if (!p) continue;
      if (p.exercise) expect(exerciseById(p.exercise), `${l.id} → ${p.exercise}`).toBeDefined();
      if (p.demo) expect(DEMO_PROJECTS.some((d) => d.id === p.demo), `${l.id} → ${p.demo}`).toBe(true);
      for (const id of p.info ?? []) expect(catalog.has(id), `${l.id} → ${id}`).toBe(true);
    }
  });

  it('il quiz è superato con almeno due terzi delle risposte corrette', () => {
    expect(quizPassed(2, 3)).toBe(true);
    expect(quizPassed(1, 3)).toBe(false);
    expect(quizPassed(0, 0)).toBe(false);
  });
});
