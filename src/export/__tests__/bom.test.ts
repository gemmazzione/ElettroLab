import { describe, expect, it } from 'vitest';
import { fotovoltaico, monolocale } from '../../projects/demos';
import { bomCsv, buildBom } from '../bom';

describe('elenco materiali', () => {
  it('raggruppa i dispositivi uguali e conta i cavi delle linee (fase, neutro, PE)', () => {
    const p = monolocale();
    const bom = buildBom(p);
    const din = bom.find((s) => s.title === 'Dispositivi modulari')!;
    const c16 = din.rows.find((r) => r.details.startsWith('1P+N curva C 16 A'))!;
    expect(c16.qty).toBe(2);
    expect(c16.details).toContain('Q4');
    const lines = bom.find((s) => s.title === 'Cavi: linee verso gli utilizzatori')!;
    const u1 = p.components.find((c) => c.label === 'U1')!;
    const len15 = u1.params.kind === 'load' ? u1.params.p.cableLength : 0;
    // 1,5 mm²: solo le luci (U1) → un metro di linea per ciascun colore
    const blu15 = lines.rows.find((r) => r.item.includes('1,5 mm²') && r.details === 'Blu chiaro')!;
    expect(blu15.qty).toBeCloseTo(len15, 6);
  });

  it('include moduli fotovoltaici e CSV con separatore italiano', () => {
    const p = fotovoltaico();
    const pv = buildBom(p).find((s) => s.title === 'Moduli fotovoltaici')!;
    expect(pv.rows[0]!.qty).toBe(8);
    const csv = bomCsv(p);
    expect(csv.split('\r\n')[0]).toContain('Sezione;Quantità;Unità;Articolo');
    expect(csv).toContain('Modulo fotovoltaico 400 Wp');
  });
});
