import { describe, expect, it } from 'vitest';
import { computeDesign } from '../calc';
import { INVERTERS } from '../data';
import { defaultDesign } from '../design';
import { buildPvDesignPdf, pdfFileName } from '../pdf';
import { syncRoof } from '../roof';

describe('relazione PDF del progetto fotovoltaico', () => {
  it('genera un documento di più pagine', () => {
    const d = { ...defaultDesign(), batteryKWh: 5, inverter: { ...INVERTERS.find((i) => i.hybrid)! } };
    const doc = buildPvDesignPdf(d, computeDesign(d));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    expect(pdfFileName(d)).toBe('Impianto_fotovoltaico_domestico_fotovoltaico.pdf');
  });
});

describe('relazione PDF con il tetto disegnato', () => {
  it('include posizione e tetto', () => {
    const base = defaultDesign();
    const k = Math.cos((41.9 * Math.PI) / 180) * 111_320;
    const pt = (x: number, y: number): [number, number] => [41.9 + y / 110_540, 12.5 + x / k];
    const d = syncRoof({ ...base, location: { lat: 41.9, lon: 12.5, address: 'Roma', zoom: 20 }, roof: { ...base.roof, footprint: [pt(-6, -4), pt(6, -4), pt(6, 4), pt(-6, 4)], slope: -1 } });
    const doc = buildPvDesignPdf(d, computeDesign(d));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    expect(d.site.azimuth).toBe(0);
  });
});
