import { create } from 'zustand';

/*
 * Dimensione dell'interfaccia: si cambia la dimensione del carattere della pagina, da cui dipendono testi,
 * spaziature e pannelli (tutti in rem). Mappa, vista 3D e schema non usano uno zoom CSS, quindi i clic restano precisi.
 * La scelta vale per questo dispositivo (memoria del browser), non per l'account.
 */

export const UI_SCALES = [1, 1.125, 1.25, 1.375] as const;
const KEY = 'electrolab.uiScale';

/** Valore iniziale: più grande sugli schermi ampi, dove l'interfaccia altrimenti risulta minuta. */
function autoScale(): number {
  const w = typeof window === 'undefined' ? 0 : window.innerWidth;
  return w >= 1440 ? 1.25 : w >= 1280 ? 1.125 : 1;
}

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if ((UI_SCALES as readonly number[]).includes(v)) return v;
  } catch {
    /* memoria locale non disponibile */
  }
  return autoScale();
}

export function applyScale(s: number): void {
  document.documentElement.style.fontSize = `${s * 100}%`;
}

export const useUiScale = create<{ scale: number; setScale: (s: number) => void }>((set) => ({
  scale: load(),
  setScale: (scale) => {
    try {
      localStorage.setItem(KEY, String(scale));
    } catch {
      /* memoria locale non disponibile */
    }
    applyScale(scale);
    set({ scale });
  },
}));

applyScale(useUiScale.getState().scale);
