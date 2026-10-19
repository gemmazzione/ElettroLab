import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { checkWiring } from '../../graph/erc';
import { monolocale } from '../../projects/demos';
import { useStore } from '../../store/projectStore';
import { buildComb, combDevices } from '../comb';

const label = (p: ReturnType<typeof monolocale>, l: string) => p.components.find((c) => c.label === l)!;

describe('pettine di collegamento', () => {
  it('1P+N: collega fase e neutro degli ingressi dei magnetotermici affiancati', () => {
    const p = monolocale();
    const q3 = label(p, 'Q3');
    const r = buildComb(p, '1P+N', { ...q3.rail! });
    if (!r.ok) throw new Error(r.reason);
    expect(r.devices.map((d) => d.label)).toEqual(['Q3', 'Q4', 'Q5']);
    // due tratti (Q3-Q4, Q4-Q5) per due conduttori
    expect(r.wires).toHaveLength(4);
    expect(r.wires.filter((w) => w.conductor === 'N')).toHaveLength(2);
    expect(r.wires.every((w) => w.from.endsWith('_in') && w.to.endsWith('_in'))).toBe(true);
    expect(r.wires[0]!.length).toBeCloseTo(0.0175, 6);
  });

  it('non si aggancia a dispositivi con moduli liberi in mezzo o incompatibili', () => {
    const p = monolocale();
    const q1 = label(p, 'Q1'); // 2P, poi 1 modulo libero prima del differenziale
    const r = buildComb(p, '1P+N', { ...q1.rail! });
    expect(r.ok).toBe(false);
    const r3 = buildComb(p, '3P+N', { ...label(p, 'Q3').rail! });
    expect(r3.ok).toBe(false);
  });

  it('sostituisce i ponticelli in cavo: il circuito resta alimentato', () => {
    const p = monolocale();
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
    const ids = ['Q4', 'Q5'].map((l) => label(p, l).id);
    // toglie i ponticelli che alimentano Q4 e Q5 dall'uscita del differenziale
    p.wires = p.wires.filter((w) => !ids.some((id) => w.to.startsWith(`${id}:`) && w.to.endsWith('_in')) && !ids.some((id) => w.from.startsWith(`${id}:`) && w.from.endsWith('_in')));
    const before = simulate(p);
    if (!before.ok) throw new Error(before.reason);
    expect(before.loads.get(label(p, 'U2').id)!.energized).toBe(false);
    const r = buildComb(p, '1P+N', { ...label(p, 'Q3').rail! });
    if (!r.ok) throw new Error(r.reason);
    p.wires.push(...r.wires);
    const after = simulate(p);
    if (!after.ok) throw new Error(after.reason);
    expect(after.loads.get(label(p, 'U2').id)!.energized).toBe(true);
    // nessun avviso di colore sui tratti di barra
    const issues = checkWiring(p);
    expect(issues.some((i) => i.wireIds.some((id) => r.wires.some((w) => w.id === id)))).toBe(false);
  });

  it('nello store: si inserisce trascinandolo e si rimuove per intero', () => {
    const s = useStore.getState();
    s.openProject(monolocale());
    const q3 = label(useStore.getState().project, 'Q3');
    expect(useStore.getState().addComb('comb-1pn', { ...q3.rail! })).toBe(true);
    const combWires = useStore.getState().project.wires.filter((w) => w.comb);
    expect(combWires).toHaveLength(4);
    expect(combDevices(useStore.getState().project, combWires[0]!.comb!.id).map((d) => d.label)).toEqual(['Q3', 'Q4', 'Q5']);
    // un secondo pettine sugli stessi morsetti viene rifiutato
    expect(useStore.getState().addComb('comb-1pn', { ...q3.rail! })).toBe(false);
    useStore.getState().removeWire(combWires[2]!.id);
    expect(useStore.getState().project.wires.some((w) => w.comb)).toBe(false);
  });
});
