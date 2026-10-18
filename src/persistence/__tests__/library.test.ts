import { beforeEach, describe, expect, it } from 'vitest';
import { appartamento, trifase } from '../../projects/demos';
import { copyProject, duplicateSaved, importIntoLibrary, listLibrary, removeSaved, renameSaved, summarizeProject } from '../library';
import { saveProject } from '../storage';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe('libreria progetti', () => {
  it('riepilogo di un progetto', () => {
    const s = summarizeProject(trifase());
    expect(s.phases).toBe(3);
    expect(s.circuits).toBe(4);
    expect(s.contractKW).toBe(10);
    expect(s.modulesUsed).toBeGreaterThan(0);
  });

  it('salva, duplica, rinomina ed elimina', () => {
    const p = appartamento();
    saveProject(p);
    expect(listLibrary()).toHaveLength(1);
    const dup = duplicateSaved(p.id)!;
    expect(dup.id).not.toBe(p.id);
    expect(dup.name).toBe('Appartamento 4,5 kW (copia)');
    expect(listLibrary()).toHaveLength(2);
    renameSaved(p.id, 'Casa Rossi');
    expect(listLibrary().some((e) => e.project.name === 'Casa Rossi')).toBe(true);
    removeSaved(dup.id);
    expect(listLibrary()).toHaveLength(1);
  });

  it('la copia è indipendente dall\'originale', () => {
    const p = appartamento();
    const c = copyProject(p);
    c.components[0]!.label = 'ZZ';
    expect(p.components[0]!.label).not.toBe('ZZ');
  });

  it('importa un singolo progetto e un\'intera libreria, senza sovrascrivere', () => {
    const a = appartamento();
    const b = trifase();
    expect(importIntoLibrary(JSON.parse(JSON.stringify(a))).imported).toHaveLength(1);
    const bundle = { format: 'electrolab-library', version: 1, projects: [a, b] };
    const { imported } = importIntoLibrary(JSON.parse(JSON.stringify(bundle)));
    expect(imported).toHaveLength(2);
    // "a" esisteva già: viene aggiunto come copia con un nuovo identificativo
    expect(imported[0]!.id).not.toBe(a.id);
    expect(imported[0]!.name).toContain('(importato)');
    expect(listLibrary()).toHaveLength(3);
  });

  it('rifiuta un file che non è un progetto', () => {
    expect(() => importIntoLibrary({ foo: 1 })).toThrow();
  });
});
