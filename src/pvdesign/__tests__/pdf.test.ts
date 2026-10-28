import { describe, expect, it } from 'vitest';
import { computeDesign } from '../calc';
import { INVERTERS } from '../data';
import { defaultDesign } from '../design';
import { buildPvDesignPdf, pdfFileName } from '../pdf';

describe('relazione PDF del progetto fotovoltaico', () => {
  it('genera un documento di più pagine', () => {
    const d = { ...defaultDesign(), batteryKWh: 5, inverter: { ...INVERTERS.find((i) => i.hybrid)! } };
    const doc = buildPvDesignPdf(d, computeDesign(d));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    expect(pdfFileName(d)).toBe('Impianto_fotovoltaico_domestico_fotovoltaico.pdf');
  });
});
