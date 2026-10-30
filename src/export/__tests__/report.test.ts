import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS, trifase } from '../../projects/demos';
import { isElvLoad } from '../../model/terminals';
import { buildReport, DISCLAIMER, pdfSafe } from '../reportData';

describe('relazione PDF: contenuti', () => {
  it('contiene dati generali, dispositivi, circuiti, verifiche e avvertenza per ogni progetto predefinito', () => {
    for (const d of DEMO_PROJECTS) {
      const p = d.build();
      const r = buildReport(p, new Date('2026-10-18'));
      expect(r.general.length).toBeGreaterThan(5);
      const titles = r.tables.map((t) => t.title);
      expect(titles).toEqual(expect.arrayContaining(['Elenco dei dispositivi', 'Circuiti utilizzatori', 'Verifiche normative', 'Verifiche di cablaggio']));
      const circuits = r.tables.find((t) => t.title === 'Circuiti utilizzatori')!;
      expect(circuits.body).toHaveLength(p.components.filter((c) => c.params.kind === 'load' && !isElvLoad(c)).length);
      for (const t of r.tables) for (const row of t.body) expect(row).toHaveLength(t.head.length);
      expect(r.disclaimer).toBe(DISCLAIMER);
      expect(r.normSummary).not.toMatch(/^Conforme/);
    }
  });

  it('nel trifase indica la fase di ogni circuito', () => {
    const r = buildReport(trifase());
    const fasi = r.tables.find((t) => t.title === 'Circuiti utilizzatori')!.body.map((row) => row[1]);
    expect(fasi).toEqual(['L1', 'L2', 'L3', '3F']);
  });

  it('caduta di tensione mai negativa: riferita alla fase del circuito', () => {
    for (const d of DEMO_PROJECTS) {
      const body = buildReport(d.build()).tables.find((t) => t.title === 'Circuiti utilizzatori')!.body;
      for (const row of body) expect(row[8]!.startsWith('-')).toBe(false);
    }
  });

  it('i guasti nascosti degli esercizi non compaiono nella relazione', () => {
    const p = trifase();
    p.faults = [{ id: 'h', type: 'open-wire', targetId: p.wires[0]!.id, resistance: 0, hidden: true }];
    expect(buildReport(p).tables.some((t) => t.title.startsWith('Guasti'))).toBe(false);
  });

  it('converte i simboli non disponibili nei font PDF standard', () => {
    expect(pdfSafe('RE × IΔn ≤ 50 V · 2,5 mm² · 30 °C — Ω')).toBe('RE × IDn <= 50 V · 2,5 mm² · 30 °C - ohm');
    expect([...pdfSafe('√3·230 → 400 ✓')].every((c) => c.charCodeAt(0) <= 255)).toBe(true);
  });
});
