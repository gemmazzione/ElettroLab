import { create } from 'zustand';
import { storageKey } from '../persistence/space';
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

function write(s: Saved): void {
  try {
    localStorage.setItem(storageKey(KEY), JSON.stringify(s));
  } catch {
    /* memoria locale non disponibile o piena */
  }
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
      persist({ plants: plants.map((p) => (p.id === currentId ? coherent(fn(p)) : p)) });
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
  };
});

export const currentPlant = (s: { plants: Plant[]; currentId: string }): Plant => s.plants.find((p) => p.id === s.currentId) ?? s.plants[0]!;
