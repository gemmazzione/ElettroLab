import { describe, expect, it } from 'vitest';
import { addDays, ALL_CARDS, CEI_TOPICS, dueCards, mergeCeiProgress, nextState } from '../cei';
import { exerciseById } from '../exercises';

describe('percorso CEI 64-8', () => {
  it('schede complete, con articoli e domande coerenti', () => {
    const ids = new Set<string>();
    for (const c of ALL_CARDS) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      for (const k of ['risk', 'rule', 'conditions', 'example'] as const) expect(c[k].length, `${c.id}.${k}`).toBeGreaterThan(5);
      expect(c.articles).toMatch(/\d/);
      expect(c.questions.length).toBeGreaterThan(0);
      for (const q of c.questions) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });
  it('gli esercizi collegati esistono', () => {
    for (const t of CEI_TOPICS) for (const pr of t.practice) if (pr.kind === 'exercise') expect(exerciseById(pr.id), pr.id).toBeTruthy();
  });
  it('ripasso: giusto → 1, 7, 30 giorni; sbagliato → domani dal livello 0', () => {
    const d0 = '2026-11-07';
    const s1 = nextState(undefined, true, d0);
    expect(s1).toMatchObject({ box: 1, due: '2026-11-08' });
    const s2 = nextState(s1, true, s1.due);
    expect(s2).toMatchObject({ box: 2, due: addDays('2026-11-08', 7) });
    const s3 = nextState(s2, true, s2.due);
    expect(s3.box).toBe(3);
    expect(s3.due).toBe(addDays(s2.due, 30));
    const s4 = nextState(s3, true, s3.due);
    expect(s4.box).toBe(3);
    const w = nextState(s3, false, d0);
    expect(w).toMatchObject({ box: 0, due: '2026-11-08', seen: 4 });
  });
  it('schede da ripassare e unione dei progressi', () => {
    const id = ALL_CARDS[0]!.id;
    const p = { [id]: nextState(undefined, true, '2026-11-01') };
    expect(dueCards(p, '2026-11-01')).toEqual([]);
    expect(dueCards(p, '2026-11-02')).toEqual([id]);
    const more = { [id]: { ...p[id]!, seen: 5 } };
    expect(mergeCeiProgress(p, more)[id]!.seen).toBe(5);
  });
});
