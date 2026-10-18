import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { tracePhase } from '../../graph/netGraph';
import { createComponent, createWire } from '../../model/factory';
import type { Project } from '../../model/types';
import { line, setMcb, t } from '../../projects/demos';
import { buildCtx, evaluate, parseNumber } from '../evaluate';
import { EXERCISES, exerciseById } from '../exercises';
import { LEVELS } from '../types';

const ctxOf = (project: Project, extra: Partial<Parameters<typeof buildCtx>[0]> = {}) =>
  buildCtx({ project, running: false, result: null, prot: {}, probes: {}, clampTarget: null, ...extra });

describe('Accademia: struttura', () => {
  it('ogni livello ha almeno due esercizi con obiettivo, teoria, ambiente e controlli', () => {
    for (const l of LEVELS) expect(EXERCISES.filter((e) => e.level === l.level).length).toBeGreaterThanOrEqual(2);
    const ids = new Set<string>();
    for (const e of EXERCISES) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(e.objective.length).toBeGreaterThan(20);
      expect(e.theory.length).toBeGreaterThan(40);
      expect(e.environment.length).toBeGreaterThan(10);
      expect(e.tasks.length).toBeGreaterThan(0);
      const p = e.build();
      // i controlli devono essere eseguibili sullo stato iniziale
      const ev = evaluate(e, ctxOf(p), {});
      expect(ev.total).toBeGreaterThan(0);
      for (const r of Object.values(ev.results)) expect(r.feedback).not.toMatch(/non eseguibile/);
    }
  });

  it('interpreta i numeri scritti all\'italiana', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('229,8')).toBe(229.8);
    expect(parseNumber('400')).toBe(400);
    expect(parseNumber('abc')).toBeNull();
  });

  it('le risposte numeriche esatte del modello e le scelte corrette danno il massimo sulle domande', () => {
    for (const e of EXERCISES) {
      const p = e.build();
      const ctx = ctxOf(p);
      const answers: Record<string, string> = {};
      for (const task of e.tasks) {
        if (task.kind === 'numeric') {
          const v = task.expected(ctx);
          if (v !== null) answers[task.id] = String(v);
        }
        if (task.kind === 'choice') answers[task.id] = String(task.correct);
      }
      const ev = evaluate(e, ctx, answers);
      for (const task of e.tasks) {
        if (task.kind === 'choice') expect(ev.results[task.id]!.ok, `${e.id}/${task.id}`).toBe(true);
        if (task.kind === 'numeric' && answers[task.id] !== undefined) expect(ev.results[task.id]!.ok, `${e.id}/${task.id}`).toBe(true);
      }
    }
  });
});

describe('Accademia: soluzioni di riferimento', () => {
  it('primo quadro: una soluzione corretta supera tutti i controlli', () => {
    const ex = exerciseById('l2-primo-quadro')!;
    const p = ex.build();
    const add = (id: string, row: number, slot: number) => {
      const c = createComponent(p, id, { rail: { row, slot } });
      c.closed = true;
      p.components.push(c);
      return c;
    };
    const cnt = p.components.find((c) => c.params.kind === 'supply')!;
    const earth = p.components.find((c) => c.params.kind === 'earth')!;
    const luci = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === 'Luci')!;
    const prese = p.components.find((c) => c.params.kind === 'load' && c.params.p.name === 'Prese')!;
    const q1 = add('mcb-2p', 0, 0);
    setMcb(q1, 25, 'C', 6);
    const d = add('rcd-2p', 0, 2);
    const ql = add('mcb-1pn', 0, 4);
    setMcb(ql, 10);
    const qp = add('mcb-1pn', 0, 5);
    setMcb(qp, 16);
    const xpe = add('bar-pe-8', 1, 0);
    const w = (a: string, b: string, s: 1.5 | 2.5 | 4 | 6 = 4) => p.wires.push(createWire(p, a, b, { section: s, length: 0.3 }));
    w(t(cnt, 'L'), t(q1, 'p0_in'), 6);
    w(t(cnt, 'N'), t(q1, 'p1_in'), 6);
    w(t(q1, 'p0_out'), t(d, 'p0_in'));
    w(t(q1, 'p1_out'), t(d, 'p1_in'));
    w(t(d, 'p0_out'), t(ql, 'p0_in'));
    w(t(d, 'p1_out'), t(ql, 'p1_in'));
    w(t(ql, 'p0_in'), t(qp, 'p0_in'));
    w(t(ql, 'p1_in'), t(qp, 'p1_in'));
    w(t(earth, 'PE'), t(xpe, 't0'), 6);
    const b = { project: p, wire: (a: string, c: string, s: 1.5 | 2.5 | 4 | 6, l: number) => (p.wires.push(createWire(p, a, c, { section: s, length: l })), b) };
    line(b as never, ql, luci, xpe, 1, 1.5);
    line(b as never, qp, prese, xpe, 2, 2.5);
    const ev = evaluate(ex, ctxOf(p), {});
    const failed = Object.entries(ev.results).filter(([, r]) => !r.ok).map(([id, r]) => `${id}: ${r.feedback}`);
    expect(failed).toEqual([]);
    expect(ev.score).toBe(100);
  });

  it('distribuzione trifase: lo stato iniziale non supera il controllo, il ricablaggio sì', () => {
    const ex = exerciseById('l5-distribuzione')!;
    const p = ex.build();
    expect(evaluate(ex, ctxOf(p), {}).results.bal!.ok).toBe(false);
    const q2 = p.components.find((c) => c.label === 'Q2')!;
    const [qa, qb, qc] = p.components.filter((c) => c.params.kind === 'mcb' && c.params.p.poles === '1P+N');
    // rimuove i ponticelli di fase e alimenta B da L2 e C da L3
    p.wires = p.wires.filter((w) => !(w.from === t(qa!, 'p0_in') && w.to === t(qb!, 'p0_in')) && !(w.from === t(qb!, 'p0_in') && w.to === t(qc!, 'p0_in')));
    p.wires.push(createWire(p, t(q2, 'p1_out'), t(qb!, 'p0_in'), { section: 4, length: 0.3 }));
    p.wires.push(createWire(p, t(q2, 'p2_out'), t(qc!, 'p0_in'), { section: 4, length: 0.3 }));
    const r = simulate(p, { closed: () => true });
    if (!r.ok) throw new Error(r.reason);
    // senza correggere l'identificazione dei conduttori il controllo segnala l'incoerenza
    expect(evaluate(ex, ctxOf(p), {}).results.erc!.ok).toBe(false);
    for (const w of p.wires) {
      if (w.conductor !== 'L1' && w.conductor !== 'L2' && w.conductor !== 'L3') continue;
      const ph = tracePhase(p, w.from);
      if (ph) w.conductor = `L${ph}` as 'L1' | 'L2' | 'L3';
    }
    const ev = evaluate(ex, ctxOf(p), {});
    expect(ev.results.bal!.ok).toBe(true);
    expect(ev.results.erc!.ok).toBe(true);
    expect(ev.results.pw!.ok).toBe(true);
  });

  it('ricerca guasti: il guasto nascosto c\'è ma il controllo di ripristino richiede l\'azione dell\'utente', () => {
    const ex = exerciseById('l4-cortocircuito')!;
    const p = ex.build();
    expect(p.faults?.every((f) => f.hidden)).toBe(true);
    expect(evaluate(ex, ctxOf(p), {}).results.restore!.ok).toBe(false);
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = c.label !== 'Q4';
    expect(evaluate(ex, ctxOf(p, { running: true }), {}).results.restore!.ok).toBe(true);
  });
});
