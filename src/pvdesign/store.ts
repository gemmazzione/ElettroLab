import { create } from 'zustand';
import { storageKey } from '../persistence/space';
import { defaultDesign, normalizeDesign, type PvDesign } from './design';
import { syncRoof } from './roof';

const KEY = 'electrolab.pvdesign.v1';
/** Preferenze della guida: passo corrente, benvenuto già visto, modalità esperto. */
const UI_KEY = 'electrolab.pvdesign.ui';

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

interface UiPrefs {
  step: number;
  welcomed: boolean;
  expert: boolean;
}

function loadUi(): UiPrefs {
  const base: UiPrefs = { step: 0, welcomed: false, expert: false };
  try {
    const raw = localStorage.getItem(storageKey(UI_KEY));
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<UiPrefs>) } : base;
  } catch {
    return base;
  }
}

function saveUi(p: UiPrefs): void {
  try {
    localStorage.setItem(storageKey(UI_KEY), JSON.stringify(p));
  } catch {
    /* memoria locale non disponibile */
  }
}

interface PvDesignStore extends UiPrefs {
  design: PvDesign;
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
  reset: () => void;
  /** Ricarica dalla memoria locale (dopo l'accesso o l'uscita da un account). */
  reload: () => void;
}

export const usePvDesign = create<PvDesignStore>((set, get) => {
  const persistUi = (patch: Partial<UiPrefs>) => {
    const { step, welcomed, expert } = { ...get(), ...patch };
    saveUi({ step, welcomed, expert });
    set(patch);
  };
  return {
    design: load(),
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
    update: (fn) => {
      const d = syncRoof(fn(get().design));
      save(d);
      set({ design: d });
    },
    setMonth: (m) => set({ month: m }),
    reset: () => {
      const d = defaultDesign();
      save(d);
      set({ design: d, snapshot: null });
      persistUi({ step: 0, welcomed: false });
    },
    reload: () => set({ design: load(), ...loadUi() }),
  };
});
