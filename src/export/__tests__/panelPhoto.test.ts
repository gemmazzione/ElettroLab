import { describe, expect, it } from 'vitest';
import { examplePlants } from '../../impianto/model';
import { plantToProject } from '../../impianto/toLab';
import { DEMO_PROJECTS } from '../../projects/demos';
import { panelPhotoSvg } from '../panelPhoto';

describe('foto del quadro', () => {
  it('quadri delle demo: dispositivi, guide e conduttori nell\'SVG', () => {
    for (const d of DEMO_PROJECTS) {
      const p = d.build();
      for (const panel of p.panels) {
        const svg = panelPhotoSvg(p, panel, panel.name);
        expect(svg.markup.startsWith('<svg')).toBe(true);
        expect(svg.w).toBeGreaterThan(100);
        const devices = p.components.filter((c) => c.rail && (c.rail.panelId ?? p.panels[0]!.id) === panel.id);
        if (devices.length) expect((svg.markup.match(/<g transform="translate\(/g) ?? []).length, d.name).toBeGreaterThanOrEqual(devices.length);
      }
    }
  });
  it('quadro ricostruito da «Progetta impianto»: pettini e cavi verso gli utilizzatori', () => {
    const p = plantToProject(examplePlants()[0]!.make());
    const svg = panelPhotoSvg(p, p.panels[0]!, 'Quadro');
    expect(svg.markup).toContain('#d4824a');
    expect(svg.markup).toContain('stroke-dasharray="7 7"');
  });
});
