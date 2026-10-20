import type { Project } from '../model/types';

/**
 * Spazio di memoria locale.
 * Senza accesso i dati stanno nelle chiavi «base»; con un account collegato in chiavi separate
 * (`chiave@u<id>`), che si cancellano all'uscita: su un computer condiviso i dati dell'account
 * non restano a disposizione di chi lo usa dopo.
 */
let space = '';

export function storageKey(base: string): string {
  return space ? `${base}@${space}` : base;
}

export function currentSpace(): string {
  return space;
}

export function setStorageSpace(s: string): void {
  space = s;
}

/** Cancella dal browser tutte le chiavi di uno spazio. */
export function clearStorageSpace(s: string): void {
  if (!s) return;
  try {
    const suffix = `@${s}`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(suffix)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* memoria locale non disponibile */
  }
}

// ------------------------------------------------------------------ eventi di salvataggio (per la sincronizzazione)

export type PersistEvent =
  | { type: 'project-save'; project: Project }
  | { type: 'project-delete'; id: string }
  | { type: 'current'; project: Project }
  | { type: 'lessons'; data: unknown }
  | { type: 'exercises'; data: unknown };

type Listener = (e: PersistEvent) => void;
const listeners = new Set<Listener>();
/** Durante il caricamento dei dati dal server non si rimandano gli stessi dati indietro. */
let muted = 0;

export function onPersist(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function emitPersist(e: PersistEvent): void {
  if (muted) return;
  for (const l of listeners) l(e);
}

export function withoutSync<T>(fn: () => T): T {
  muted++;
  try {
    return fn();
  } finally {
    muted--;
  }
}
