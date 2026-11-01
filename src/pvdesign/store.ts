import { create } from 'zustand';
import { emitPersist, storageKey } from '../persistence/space';
import { defaultDesign, normalizeDesign, type PvDesign } from './design';
import { syncRoof } from './roof';

const KEY = 'electrolab.pvdesign.v1';
/** Elenco dei progetti FV salvati (senza i dati meteo, che si riscaricano). */
const LIB_KEY = 'electrolab.pvdesign.library';
/** Preferenze della guida: passo corrente, benvenuto già visto, modalità esperto. */
const UI_KEY = 'electrolab.pvdesign.ui';

export interface PvEntry {
  id: string;
  updated: string;
  design: PvDesign;
}

export interface PvLibrary {
  currentId: string;
  projects: PvEntry[];
}

const newId = () => `pv${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Copia da salvare: l'anno tipo PVGIS (oltre 100 kB) resta solo nella copia di lavoro. */
export const stripWeather = (d: PvDesign): PvDesign => ({ ...d, site: { ...d.site, weather: null } });

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(v));
  } catch {
    /* memoria locale non disponibile o piena */
  }
}

function load(): PvDesign {
  const raw = read<unknown>(KEY);
  try {
    return raw ? normalizeDesign(raw) : defaultDesign();
  } catch {
    return defaultDesign();
  }
}

/** Valida un elenco letto dalla memoria locale o dal server. */
export function validLibrary(x: unknown): PvLibrary | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Partial<PvLibrary>;
  if (!Array.isArray(o.projects)) return null;
  const projects: PvEntry[] = [];
  for (const p of o.projects) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string') continue;
    try {
      projects.push({ id: p.id, updated: typeof p.updated === 'string' ? p.updated : '', design: stripWeather(normalizeDesign(p.design)) });
    } catch {
      /* progetto non leggibile: si salta */
    }
  }
  if (!projects.length) return null;
  const currentId = typeof o.currentId === 'string' && projects.some((p) => p.id === o.currentId) ? o.currentId : projects[0]!.id;
  return { currentId, projects };
}

function loadLibrary(current: PvDesign): PvLibrary {
  const lib = validLibrary(read<unknown>(LIB_KEY));
  if (lib) return lib;
  // Prima apertura con la libreria: il progetto in corso diventa il primo della lista.
  const id = newId();
  return { currentId: id, projects: [{ id, updated: new Date().toISOString(), design: stripWeather(current) }] };
}

/** Unisce due elenchi tenendo per ogni progetto la versione modificata più di recente. */
export function mergeLibraries(a: PvLibrary | null, b: PvLibrary | null): PvLibrary | null {
  if (!a) return b;
  if (!b) return a;
  const map = new Map<string, PvEntry>();
  for (const p of [...a.projects, ...b.projects]) {
    const prev = map.get(p.id);
    if (!prev || p.updated > prev.updated) map.set(p.id, p);
  }
  const projects = [...map.values()].sort((x, y) => (x.updated < y.updated ? 1 : -1));
  const newest = (b.projects.find((p) => p.id === b.currentId)?.updated ?? '') > (a.projects.find((p) => p.id === a.currentId)?.updated ?? '') ? b : a;
  return { currentId: newest.currentId, projects };
}

interface UiPrefs {
  step: number;
  welcomed: boolean;
  expert: boolean;
}

function loadUi(): UiPrefs {
  return { step: 0, welcomed: false, expert: false, ...(read<Partial<UiPrefs>>(UI_KEY) ?? {}) };
}

interface PvDesignStore extends UiPrefs {
  design: PvDesign;
  library: PvLibrary;
  /** Mese mostrato nel grafico del giorno medio (0 = gennaio) */
  month: number;
  /** Verso dell'ultimo cambio di passo (per l'animazione): 1 avanti, −1 indietro */
  direction: 1 | -1;
  setStep: (n: number) => void;
  setWelcomed: (v: boolean) => void;
  setExpert: (v: boolean) => void;
  /** Ultima vista 3D scelta per la relazione (immagine JPEG, non salvata) */
  snapshot: string | null;
  setSnapshot: (s: string | null) => void;
  update: (fn: (d: PvDesign) => PvDesign) => void;
  setMonth: (m: number) => void;
  /** Ricomincia il progetto aperto da zero. */
  reset: () => void;
  /** Nuovo progetto vuoto nella libreria. */
  create: () => void;
  /** Copia del progetto aperto, per provare una variante. */
  duplicate: () => void;
  open: (id: string) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  /** Ricarica dalla memoria locale (dopo l'accesso o l'uscita da un account). */
  reload: () => void;
  /** Sostituisce la libreria (dati dell'account) e apre il suo progetto corrente. */
  replaceLibrary: (lib: PvLibrary) => void;
}

export const usePvDesign = create<PvDesignStore>((set, get) => {
  const persistUi = (patch: Partial<UiPrefs>) => {
    const { step, welcomed, expert } = { ...get(), ...patch };
    write(UI_KEY, { step, welcomed, expert });
    set(patch);
  };
  const saveLibrary = (library: PvLibrary) => {
    write(LIB_KEY, library);
    set({ library });
    emitPersist({ type: 'pv', data: library });
  };
  /** Salva la copia di lavoro e aggiorna la sua voce nella libreria. */
  const commit = (d: PvDesign, library = get().library) => {
    write(KEY, d);
    const entry: PvEntry = { id: library.currentId, updated: new Date().toISOString(), design: stripWeather(d) };
    const projects = library.projects.some((p) => p.id === entry.id) ? library.projects.map((p) => (p.id === entry.id ? entry : p)) : [entry, ...library.projects];
    set({ design: d });
    saveLibrary({ ...library, projects });
  };
  const openDesign = (id: string, d: PvDesign, library: PvLibrary) => {
    write(KEY, d);
    set({ design: d, snapshot: null });
    saveLibrary({ ...library, currentId: id });
  };
  const fresh = (name: string) => ({ ...defaultDesign(), name });
  const design = load();
  return {
    design,
    library: loadLibrary(design),
    ...loadUi(),
    month: 6,
    direction: 1,
    setStep: (step) => {
      set({ direction: step >= get().step ? 1 : -1 });
      persistUi({ step });
    },
    setWelcomed: (welcomed) => persistUi({ welcomed }),
    setExpert: (expert) => persistUi({ expert }),
    snapshot: null,
    setSnapshot: (snapshot) => set({ snapshot }),
    update: (fn) => commit(syncRoof(fn(get().design))),
    setMonth: (m) => set({ month: m }),
    reset: () => {
      set({ snapshot: null });
      commit(fresh(get().design.name));
      persistUi({ step: 0, welcomed: false });
    },
    create: () => {
      const lib = get().library;
      const id = newId();
      const d = fresh(`Progetto ${lib.projects.length + 1}`);
      openDesign(id, d, { currentId: id, projects: [{ id, updated: new Date().toISOString(), design: d }, ...lib.projects] });
      persistUi({ step: 0 });
    },
    duplicate: () => {
      const lib = get().library;
      const id = newId();
      const d = { ...get().design, name: `${get().design.name} (variante)` };
      openDesign(id, d, { currentId: id, projects: [{ id, updated: new Date().toISOString(), design: stripWeather(d) }, ...lib.projects] });
    },
    open: (id) => {
      const lib = get().library;
      const p = lib.projects.find((x) => x.id === id);
      if (!p || id === lib.currentId) return;
      // Se il sito è lo stesso si tiene l'anno tipo già scaricato.
      const w = get().design.site.weather;
      const same = w && p.design.location.lat !== null && Math.abs(w.lat - p.design.location.lat) < 0.02 && Math.abs(w.lon - (p.design.location.lon ?? 0)) < 0.02;
      openDesign(id, syncRoof(same ? { ...p.design, site: { ...p.design.site, weather: w } } : p.design), lib);
    },
    remove: (id) => {
      const lib = get().library;
      const projects = lib.projects.filter((p) => p.id !== id);
      if (!projects.length) {
        const nid = newId();
        const d = fresh('Progetto 1');
        return openDesign(nid, d, { currentId: nid, projects: [{ id: nid, updated: new Date().toISOString(), design: d }] });
      }
      if (id !== lib.currentId) return saveLibrary({ ...lib, projects });
      const next = projects[0]!;
      openDesign(next.id, syncRoof(next.design), { currentId: next.id, projects });
    },
    rename: (id, name) => {
      const lib = get().library;
      if (id === lib.currentId) return commit({ ...get().design, name });
      saveLibrary({ ...lib, projects: lib.projects.map((p) => (p.id === id ? { ...p, updated: new Date().toISOString(), design: { ...p.design, name } } : p)) });
    },
    reload: () => {
      const d = load();
      set({ design: d, library: loadLibrary(d), ...loadUi() });
    },
    replaceLibrary: (lib) => {
      const cur = lib.projects.find((p) => p.id === lib.currentId)!;
      write(LIB_KEY, lib);
      // L'anno tipo della copia locale si tiene se il sito è lo stesso.
      const w = get().design.site.weather;
      const d = syncRoof(w ? { ...cur.design, site: { ...cur.design.site, weather: w } } : cur.design);
      write(KEY, d);
      set({ library: lib, design: d });
    },
  };
});
