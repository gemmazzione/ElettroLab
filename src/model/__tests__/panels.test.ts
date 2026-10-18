import { describe, expect, it } from 'vitest';
import { buildSingleLine } from '../../diagram/singleLine';
import { deviceShortCircuit } from '../../engine/measure';
import { validateProject } from '../../persistence/storage';
import { monolocale, villetta } from '../../projects/demos';
import { createComponent } from '../factory';
import { nextPanelOrigin, panelSize, positionToRail, railToPosition } from '../geometry';
import { canPlace, modulesUsed, nearestFreeSlot, panelOf } from '../placement';

describe('quadri multipli', () => {
  it('converte i progetti salvati con il vecchio formato a quadro singolo', () => {
    const p = JSON.parse(JSON.stringify(monolocale())) as Record<string, unknown>;
    p.panel = { modulesPerRow: 12, rows: 2 };
    delete p.panels;
    const migrated = validateProject(p);
    expect(migrated.panels).toHaveLength(1);
    expect(migrated.panels[0]).toMatchObject({ id: 'P1', modulesPerRow: 12, rows: 2, origin: { x: 0, y: 0 } });
    expect((migrated as unknown as { panel?: unknown }).panel).toBeUndefined();
  });

  it('un nuovo quadro viene affiancato a destra senza sovrapporsi', () => {
    const p = villetta();
    const [a, b] = p.panels;
    expect(b!.origin.x).toBeGreaterThan(a!.origin.x + panelSize(a!).w);
    expect(nextPanelOrigin(p.panels).x).toBeGreaterThan(b!.origin.x + panelSize(b!).w);
  });

  it('il trascinamento sceglie il quadro più vicino e i moduli sono indipendenti per quadro', () => {
    const p = villetta();
    const b = p.panels[1]!;
    const target = positionToRail({ x: b.origin.x + 60, y: b.origin.y + 80 }, p.panels);
    expect(target.panelId).toBe(b.id);
    // la stessa guida/modulo è occupata nel sottoquadro ma non per questo nel quadro generale
    expect(canPlace(p, 1, { panelId: b.id, row: 0, slot: 0 })).toBe(false);
    expect(canPlace(p, 1, { panelId: p.panels[0]!.id, row: 0, slot: 10 })).toBe(true);
    // la posizione grafica è relativa all'origine del quadro
    const c = createComponent(p, 'mcb-1pn', { rail: { panelId: b.id, row: 0, slot: 10 } });
    expect(c.position).toEqual(railToPosition({ row: 0, slot: 10 }, b));
    expect(modulesUsed(p, b.id)).toBe(10);
  });

  it('se un quadro è pieno il dispositivo va nel primo spazio libero di un altro quadro', () => {
    const p = villetta();
    const b = p.panels[1]!;
    b.modulesPerRow = 6; // moduli 1-6 tutti occupati (Q6, Q7, Q8, Q9): nessuno spazio libero
    const r = nearestFreeSlot(p, 1, { panelId: b.id, row: 0, slot: 0 });
    expect(r?.panelId).toBe(p.panels[0]!.id);
    expect(panelOf(p, r!.panelId).name).toBe('Quadro generale');
  });

  it('lo schema unifilare segna l\'inizio del sottoquadro dopo la linea di alimentazione', () => {
    const sl = buildSingleLine(villetta())!;
    const q5 = sl.nodes.find((n) => n.comp.label === 'Q5')!;
    const q6 = sl.nodes.find((n) => n.comp.label === 'Q6')!;
    expect(q5.panelStart).toBeUndefined();
    expect(q6.panelStart).toBe('Sottoquadro taverna');
    expect(q5.children.map((c) => c.comp.label)).toEqual(['Q6']);
  });

  it('a valle della linea di 25 m la corrente di cortocircuito presunta è minore', () => {
    const p = villetta();
    const q5 = p.components.find((c) => c.label === 'Q5')!;
    const q7 = p.components.find((c) => c.label === 'Q7')!;
    expect(deviceShortCircuit(p, q7)!).toBeLessThan(deviceShortCircuit(p, q5)! * 0.7);
  });
});
