import { describe, expect, it } from 'vitest';
import { buildNormContext } from '../../rules/context';
import { monolocale } from '../../projects/demos';
import { useStore } from '../projectStore';

const st = () => useStore.getState();
const byLabel = (l: string) => st().project.components.find((c) => c.label === l)!;

describe('conduttori collegati agli utilizzatori', () => {
  it('ereditano lunghezza e sezione della linea dell\'utilizzatore', () => {
    st().openProject(monolocale());
    const u1 = byLabel('U1');
    if (u1.params.kind !== 'load') throw new Error('kind');
    const toU1 = st().project.wires.filter((w) => w.to.startsWith(`${u1.id}:`) || w.from.startsWith(`${u1.id}:`));
    expect(toU1.length).toBeGreaterThan(0);
    for (const w of toU1) {
      expect(w.length).toBe(u1.params.p.cableLength);
      expect(w.section).toBe(u1.params.p.cableSection);
    }
  });

  it('un nuovo collegamento all\'utilizzatore prende i dati della linea, non quelli del cavo predefinito', () => {
    st().openProject(monolocale());
    const u2 = byLabel('U2');
    const xpe = byLabel('XPE1');
    st().removeWire(st().project.wires.find((w) => w.to === `${u2.id}:PE` || w.from === `${u2.id}:PE`)!.id);
    st().setWirePreset({ section: 1.5, length: 0.3 });
    expect(st().connect(`${xpe.id}:t7`, `${u2.id}:PE`)).toBe(true);
    const w = st().project.wires.find((x) => x.to === `${u2.id}:PE`)!;
    if (u2.params.kind !== 'load') throw new Error('kind');
    expect(w.length).toBe(u2.params.p.cableLength);
    expect(w.section).toBe(u2.params.p.cableSection);
  });

  it('cambiare lunghezza o sezione sul conduttore cambia la linea (e gli altri suoi conduttori)', () => {
    st().openProject(monolocale());
    const u3 = byLabel('U3');
    const w = st().project.wires.find((x) => x.to === `${u3.id}:L`)!;
    st().updateWire(w.id, { length: 33, section: 4 });
    const load = byLabel('U3');
    if (load.params.kind !== 'load') throw new Error('kind');
    expect(load.params.p.cableLength).toBe(33);
    expect(load.params.p.cableSection).toBe(4);
    const n = st().project.wires.find((x) => x.to === `${u3.id}:N`)!;
    expect(n.length).toBe(33);
    expect(n.section).toBe(4);
  });

  it('la linea è contata una sola volta: la caduta non dipende dalla lunghezza disegnata del cavo', () => {
    const p = monolocale();
    const u1 = p.components.find((c) => c.label === 'U1')!;
    const before = buildNormContext(p).circuits.find((c) => c.load.id === u1.id)!.dropPct!;
    for (const w of p.wires) if (w.to.startsWith(`${u1.id}:`)) w.length = 50; // valori disegnati diversi
    const after = buildNormContext(p).circuits.find((c) => c.load.id === u1.id)!.dropPct!;
    expect(after).toBeCloseTo(before, 6);
  });
});
