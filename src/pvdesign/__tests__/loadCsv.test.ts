import { describe, expect, it } from 'vitest';
import { parseLoadCsv } from '../loadCsv';

describe('lettura curve di carico', () => {
  it('formato largo con 96 quarti d\'ora in kWh e virgola decimale', () => {
    const head = 'POD;Data;' + Array.from({ length: 96 }, (_, i) => `Q${i + 1}`).join(';');
    const rows = Array.from({ length: 10 }, (_, d) => `IT001E;${String(d + 1).padStart(2, '0')}/03/2025;` + Array.from({ length: 96 }, (_, i) => (i >= 72 && i < 88 ? '0,250' : '0,050')).join(';'));
    const r = parseLoadCsv([head, ...rows].join('\n'))!;
    expect(r).not.toBeNull();
    expect(r.days).toBe(10);
    expect(r.months).toBe(1);
    // 18-22: 4 quarti × 0,25 kWh = 1 kW medio; le altre ore 0,2 kW
    expect(r.measured[2]![19]).toBeCloseTo(1, 3);
    expect(r.measured[2]![3]).toBeCloseTo(0.2, 3);
    // mesi mancanti ricavati dai presenti
    expect(r.measured[6]![19]).toBeGreaterThan(0);
    expect(r.annualKWh).toBeGreaterThan(2700);
    expect(r.annualKWh).toBeLessThan(3200);
  });

  it('formato lungo con ora di fine intervallo', () => {
    const lines = ['Data;Ora;Consumo (kWh)'];
    for (let d = 1; d <= 8; d++)
      for (let h = 1; h <= 24; h++) lines.push(`2025-01-0${Math.min(d, 9)};${String(h).padStart(2, '0')}:00;${h === 13 ? '2' : '0.5'}`);
    const r = parseLoadCsv(lines.join('\n'))!;
    expect(r.days).toBe(8);
    // "13:00" è la fine dell'ora 12-13
    expect(r.measured[0]![12]).toBeCloseTo(2, 3);
    expect(r.measured[0]![13]).toBeCloseTo(0.5, 3);
  });

  it('rifiuta file senza dati sufficienti', () => {
    expect(parseLoadCsv('ciao;mondo\n1;2')).toBeNull();
  });
});
