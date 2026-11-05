import { create } from 'zustand';
import { emitPersist, storageKey } from '../persistence/space';
import { coherent, examplePlants, newId, normalizePlant, type Plant } from './model';

/** Progetti di «Progetta impianto» salvati nel browser (memoria locale dello spazio corrente). */
const KEY = 'electrolab.impianto.v1';

interface Saved {
  currentId: string;
  plants: Plant[];
  step: number;
}

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(KEY));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Saved>;
    const plants = Array.isArray(o.plants) ? o.plants.map((p) => normalizePlant(p)) : [];
    if (!plants.length) return null;
    const currentId = plants.some((p) => p.id === o.currentId) ? o.currentId! : plants[0]!.id;
    return { currentId, plants, step: typeof o.step === 'number' ? o.step : 0 };
  } catch {
    return null;
  }
}

function write(s: Saved, sync = true): void {
  try {
    localStorage.setItem(storageKey(KEY), JSON.stringify(s));
  } catch {
    /* memoria locale non disponibile o piena */
  }
  if (sync) emitPersist({ type: 'impianti', data: { currentId: s.currentId, plants: s.plants } });
}

/** Elenco valido letto dall'account o dalla memoria locale. */
export function validPlants(x: unknown): { currentId: string; plants: Plant[] } | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as { currentId?: unknown; plants?: unknown };
  if (!Array.isArray(o.plants)) return null;
  const plants: Plant[] = [];
  for (const raw of o.plants) {
    try {
      plants.push(normalizePlant(raw));
    } catch {
      /* progetto non leggibile: si salta */
    }
  }
  if (!plants.length) return null;
  return { currentId: typeof o.currentId === 'string' && plants.some((p) => p.id === o.currentId) ? o.currentId : plants[0]!.id, plants };
}

/** Unisce due elenchi tenendo per ogni progetto la versione modificata più di recente. */
export function mergePlants(a: { currentId: string; plants: Plant[] } | null, b: { currentId: string; plants: Plant[] } | null) {
  if (!a) return b;
  if (!b) return a;
  const map = new Map<string, Plant>();
  for (const x of [...a.plants, ...b.plants]) {
    const prev = map.get(x.id);
    if (!prev || x.updated > prev.updated) map.set(x.id, x);
  }
  return { currentId: a.currentId, plants: [...map.values()].sort((x, y) => (x.updated < y.updated ? 1 : -1)) };
}

interface ImpiantoStore {
  plants: Plant[];
  currentId: string;
  step: number;
  setStep: (n: number) => void;
  update: (fn: (p: Plant) => Plant) => void;
  /** Nuovo progetto da un esempio (o vuoto). */
  create: (exampleId: string) => void;
  duplicate: () => void;
  open: (id: string) => void;
  remove: (id: string) => void;
  reload: () => void;
  /** Sostituisce l'elenco (dati dell'account) senza rimandarlo al server. */
  replace: (lib: { currentId: string; plants: Plant[] }) => void;
}

function initial(): Saved {
  const saved = read();
  if (saved) return saved;
  const first = examplePlants()[0]!.make();
  return { currentId: first.id, plants: [first], step: 0 };
}

export const useImpianto = create<ImpiantoStore>((set, get) => {
  const persist = (patch: Partial<Saved>) => {
    const next = { plants: get().plants, currentId: get().currentId, step: get().step, ...patch };
    write(next);
    set(patch);
  };
  return {
    ...initial(),
    setStep: (n) => persist({ step: n }),
    update: (fn) => {
      const { plants, currentId } = get();
      persist({ plants: plants.map((p) => (p.id === currentId ? { ...coherent(fn(p)), updated: new Date().toISOString() } : p)) });
    },
    create: (exampleId) => {
      const ex = examplePlants().find((e) => e.id === exampleId) ?? examplePlants()[0]!;
      const p = ex.make();
      persist({ plants: [p, ...get().plants], currentId: p.id, step: 0 });
    },
    duplicate: () => {
      const cur = currentPlant(get());
      const copy: Plant = { ...structuredClone(cur), id: newId('imp'), name: `${cur.name} (copia)` };
      persist({ plants: [copy, ...get().plants], currentId: copy.id });
    },
    open: (id) => persist({ currentId: id }),
    remove: (id) => {
      const rest = get().plants.filter((p) => p.id !== id);
      const plants = rest.length ? rest : [examplePlants()[3]!.make()];
      persist({ plants, currentId: plants.some((p) => p.id === get().currentId) ? get().currentId : plants[0]!.id });
    },
    reload: () => set(initial()),
    replace: (lib) => {
      const next = { ...lib, step: get().step };
      write(next, false);
      set(next);
    },
  };
});

export const currentPlant = (s: { plants: Plant[]; currentId: string }): Plant => s.plants.find((p) => p.id === s.currentId) ?? s.plants[0]!;
