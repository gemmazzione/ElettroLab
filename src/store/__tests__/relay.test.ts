import { describe, expect, it, vi } from 'vitest';
import { abs } from '../../engine/complex';
import { simulate } from '../../engine/simulate';
import { luceScale } from '../../projects/demos';
import { useStore } from '../projectStore';

const st = () => useStore.getState();
const lampOn = () => {
  const s = st();
  const lamp = s.project.components.find((c) => c.params.kind === 'load')!;
  return !!(s.result && s.result.ok && (s.result.loads.get(lamp.id)?.i ?? 0) > 0.1);
};
const comp = (label: string) => st().project.components.find((c) => c.label === label)!;

function start() {
  vi.useFakeTimers();
  const p = luceScale();
  st().openProject(p);
  st().startSimulation();
  st().toggleComponent(comp('Q1').id); // chiude il magnetotermico differenziale
}

describe('relè passo-passo', () => {
  it('ogni pressione di un pulsante cambia lo stato della luce, da qualunque punto', () => {
    start();
    expect(lampOn()).toBe(false);
    const [b1, b2, b3] = st().project.components.filter((c) => c.params.kind === 'button');
    st().pressButton(b1!.id);
    expect(lampOn()).toBe(true);
    vi.advanceTimersByTime(400); // rilascio
    expect(comp('KA1').closed).toBe(true);
    st().pressButton(b2!.id);
    vi.advanceTimersByTime(400);
    expect(lampOn()).toBe(false);
    st().pressButton(b3!.id);
    vi.advanceTimersByTime(400);
    expect(lampOn()).toBe(true);
    vi.useRealTimers();
  });

  it('un impulso lungo cambia lo stato una sola volta (conta il fronte)', () => {
    start();
    const b1 = st().project.components.find((c) => c.params.kind === 'button')!;
    st().pressButton(b1.id);
    // mentre il pulsante resta premuto, altre modifiche all'impianto non generano nuovi impulsi
    st().toggleLoad(st().project.components.find((c) => c.params.kind === 'load')!.id);
    st().toggleLoad(st().project.components.find((c) => c.params.kind === 'load')!.id);
    expect(comp('KA1').closed).toBe(true);
    vi.advanceTimersByTime(400);
    expect(comp('KA1').closed).toBe(true);
    vi.useRealTimers();
  });

  it('senza simulazione il pulsante non invia impulsi', () => {
    vi.useFakeTimers();
    st().openProject(luceScale());
    const b1 = st().project.components.find((c) => c.params.kind === 'button')!;
    st().pressButton(b1.id);
    expect(comp('KA1').closed).toBe(false);
    vi.useRealTimers();
  });

  it('la bobina assorbe una corrente piccola, il contatto porta la corrente della lampada', () => {
    const p = luceScale();
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = true; // pulsanti premuti, relè chiuso
    const r = simulate(p);
    if (!r.ok) throw new Error(r.reason);
    const ka = p.components.find((c) => c.label === 'KA1')!;
    const iContact = abs(r.poleI.get(ka.id)![0]!);
    expect(iContact).toBeGreaterThan(0.4); // 100 W a 230 V
    const supplyI = r.supply.i;
    // corrente totale = lampada + bobina (pochi mA)
    expect(supplyI - iContact).toBeGreaterThan(0.01);
    expect(supplyI - iContact).toBeLessThan(0.05);
  });
});
