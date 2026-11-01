import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../design';
import { mergeLibraries, stripWeather, validLibrary } from '../store';

describe('libreria dei progetti FV', () => {
  const entry = (id: string, updated: string, name = id) => ({ id, updated, design: { ...defaultDesign(), name } });

  it('valida e scarta le voci non leggibili', () => {
    const lib = validLibrary({ currentId: 'x', projects: [entry('a', '1'), { nope: true }, entry('b', '2')] })!;
    expect(lib.projects.map((p) => p.id)).toEqual(['a', 'b']);
    expect(lib.currentId).toBe('a');
    expect(validLibrary({ projects: [] })).toBeNull();
    expect(validLibrary('ciao')).toBeNull();
  });

  it('unisce tenendo la versione più recente di ogni progetto', () => {
    const local = { currentId: 'a', projects: [entry('a', '2026-10-01', 'vecchio'), entry('c', '2026-10-05')] };
    const cloud = { currentId: 'b', projects: [entry('a', '2026-10-03', 'nuovo'), entry('b', '2026-10-04')] };
    const m = mergeLibraries(local, cloud)!;
    expect(m.projects.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
    expect(m.projects.find((p) => p.id === 'a')!.design.name).toBe('nuovo');
    expect(m.currentId).toBe('b');
  });

  it('non salva i dati meteo nella libreria', () => {
    const d = { ...defaultDesign() };
    d.site = { ...d.site, weather: { source: 'x', period: '', lat: 0, lon: 0, g: [], b: [], d: [], t: [], horizon: [] } };
    expect(stripWeather(d).site.weather).toBeNull();
  });
});
