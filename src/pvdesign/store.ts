import { create } from 'zustand';
import { storageKey } from '../persistence/space';
import { defaultDesign, normalizeDesign, type PvDesign } from './design';
import { syncRoof } from './roof';

const KEY = 'electrolab.pvdesign.v1';

function load(): PvDesign {
  try {
    const raw = localStorage.getItem(storageKey(KEY));
    return raw ? normalizeDesign(JSON.parse(raw)) : defaultDesign();
  } catch {
    return defaultDesign();
  }
}

function save(d: PvDesign): void {
  try {
    localStorage.setItem(storageKey(KEY), JSON.stringify(d));
  } catch {
    /* memoria locale non disponibile */
  }
}

interface PvDesignStore {
  design: PvDesign;
  /** Mese mostrato nel grafico del giorno medio (0 = gennaio) */
  month: number;
  /** Passo del percorso guidato (0 = la casa) */
  step: number;
  setStep: (n: number) => void;
  /** Ultima vista 3D scelta per la relazione (immagine JPEG, non salvata) */
  snapshot: string | null;
  setSnapshot: (s: string | null) => void;
  update: (fn: (d: PvDesign) => PvDesign) => void;
  setMonth: (m: number) => void;
  reset: () => void;
  /** Ricarica dalla memoria locale (dopo l'accesso o l'uscita da un account). */
  reload: () => void;
}

export const usePvDesign = create<PvDesignStore>((set, get) => ({
  design: load(),
  month: 6,
  step: 0,
  setStep: (step) => set({ step }),
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  update: (fn) => {
    const d = syncRoof(fn(get().design));
    save(d);
    set({ design: d });
  },
  setMonth: (m) => set({ month: m }),
  reset: () => {
    const d = defaultDesign();
    save(d);
    set({ design: d });
  },
  reload: () => set({ design: load() }),
}));
