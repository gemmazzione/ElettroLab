import { describe, expect, it } from 'vitest';
import { dcVoltageBetween } from '../../engine/measure';
import { contattore } from '../../projects/demos';
import { useStore } from '../projectStore';

const st = () => useStore.getState();
const comp = (label: string) => st().project.components.find((c) => c.label === label)!;
const energized = (name: string) => {
  const s = st();
  const l = s.project.components.find((c) => c.params.kind === 'load' && c.params.p.name === name)!;
  return !!(s.result && s.result.ok && s.result.loads.get(l.id)!.energized);
};

function start() {
  st().openProject(contattore());
  st().startSimulation();
  st().toggleComponent(comp('Q1').id);
}

describe('contattore', () => {
  it('lo scaldabagno si accende solo con la bobina alimentata dall\'interruttore di comando', () => {
    start();
    expect(comp('KM1').closed).toBe(false);
    expect(energized('Scaldabagno')).toBe(false);
    st().toggleComponent(comp('S1').id);
    expect(comp('KM1').closed).toBe(true);
    expect(energized('Scaldabagno')).toBe(true);
    st().toggleComponent(comp('S1').id);
    expect(comp('KM1').closed).toBe(false);
    expect(energized('Scaldabagno')).toBe(false);
  });
});

describe('relè di controllo tensione', () => {
  it('apre la fase con la sovratensione e la richiude quando la tensione rientra', () => {
    start();
    expect(energized('Apparecchi elettronici')).toBe(true);
    const cnt = st().project.components.find((c) => c.params.kind === 'supply')!;
    st().commit((p) => {
      const s = p.components.find((c) => c.id === cnt.id)!;
      if (s.params.kind === 'supply') s.params.p.voltage = 275;
    });
    expect(comp('KV1').closed).toBe(false);
    expect(energized('Apparecchi elettronici')).toBe(false);
    st().commit((p) => {
      const s = p.components.find((c) => c.id === cnt.id)!;
      if (s.params.kind === 'supply') s.params.p.voltage = 230;
    });
    expect(comp('KV1').closed).toBe(true);
    expect(energized('Apparecchi elettronici')).toBe(true);
  });
});

describe('alimentatore', () => {
  it('con l\'ingresso alimentato il multimetro in continua legge 12 V in uscita', () => {
    start();
    const g = comp('G1');
    expect(dcVoltageBetween(st().project, `${g.id}:V+`, `${g.id}:V-`, st().result)).toBeCloseTo(12, 6);
    st().toggleComponent(comp('Q1').id);
    expect(dcVoltageBetween(st().project, `${g.id}:V+`, `${g.id}:V-`, st().result)).toBeNull();
  });
});
