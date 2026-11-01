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

describe('relazione PDF con due falde, ombre, fasce e CER', () => {
  it('genera il documento con tutte le sezioni nuove', () => {
    const base = defaultDesign();
    const k = Math.cos((41.9 * Math.PI) / 180) * 111_320;
    const pt = (x: number, y: number): [number, number] => [41.9 + y / 110_540, 12.5 + x / k];
    const d = syncRoof({
      ...base,
      location: { lat: 41.9, lon: 12.5, address: 'Roma', zoom: 20 },
      roof: { ...base.roof, type: 'due-falde', footprint: [pt(-5, -6), pt(5, -6), pt(5, 6), pt(-5, 6)], slope: -1 },
      field2: { ...base.field2, enabled: true },
      obstacles: [{ id: 't', kind: 'albero', x: 0, y: -12, height: 9, size: 5, depth: 5, z0: 0 }],
      optimizers: true,
      consumption: { ...base.consumption, heatPumpKWh: 2500, evKm: 10000 },
      economics: { ...base.economics, tariff: 'fasce', cer: true },
      batteryKWh: 5,
      inverter: { ...INVERTERS.find((i) => i.hybrid && i.mppt >= 2)! },
    });
    const r = computeDesign(d);
    expect(r.economics.firstYearCer).toBeGreaterThan(0);
    const doc = buildPvDesignPdf(d, r);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(5);
  });
});
