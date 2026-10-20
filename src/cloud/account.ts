import { create } from 'zustand';
import { loadProgress, replaceProgress, type Progress } from '../academy/evaluate';
import { replaceLessonProgress, type LessonProgress } from '../academy/lessons';
import type { Project } from '../model/types';
import { clearStorageSpace, currentSpace, onPersist, setStorageSpace, withoutSync, type PersistEvent } from '../persistence/space';
import { loadCurrent, replaceLibrary, storeCurrentLocal, validateProject } from '../persistence/storage';
import { DEMO_PROJECTS } from '../projects/demos';
import { useStore } from '../store/projectStore';
import { api, ApiError, type AccountUser } from './api';

/**
 * Account utente: accesso, caricamento dei dati dal database e sincronizzazione.
 * Con l'accesso i dati locali passano in uno spazio separato del browser (vedi persistence/space)
 * e ogni salvataggio viene inviato anche al server.
 */

export type AccountPhase = 'checking' | 'unavailable' | 'setup' | 'signed-out' | 'signed-in';

interface AccountState {
  phase: AccountPhase;
  user: AccountUser | null;
  /** Configurazione iniziale possibile (codice impostato sul server) */
  setupAvailable: boolean;
  /** Motivo per cui il servizio non è disponibile */
  unavailableReason: string | null;
  sync: 'idle' | 'saving' | 'error';
  syncError: string | null;
  lastSyncAt: string | null;
  /** Cambia quando cambia lo spazio dei dati (per ricaricare le viste che leggono i progressi) */
  dataVersion: number;
  init: () => Promise<void>;
  setup: (token: string, username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const spaceOf = (u: AccountUser) => `u${u.id}`;

export const useAccount = create<AccountState>((set, get) => ({
  phase: 'checking',
  user: null,
  setupAvailable: false,
  unavailableReason: null,
  sync: 'idle',
  syncError: null,
  lastSyncAt: null,
  dataVersion: 0,

  init: async () => {
    try {
      const s = await api.status();
      if (s.setupNeeded) return set({ phase: 'setup', setupAvailable: s.setupAvailable });
      if (!s.user) return set({ phase: 'signed-out' });
      await enterAccount(s.user, false);
    } catch (e) {
      set({ phase: 'unavailable', unavailableReason: e instanceof Error ? e.message : String(e) });
    }
  },

  setup: async (token, username, password) => {
    const r = await api.setup(token, username, password);
    await enterAccount(r.user, true);
  },

  login: async (username, password) => {
    const r = await api.login(username, password);
    await enterAccount(r.user, true);
  },

  logout: async () => {
    await flushPending();
    try {
      await api.logout();
    } catch {
      /* la sessione verrà comunque rimossa dal browser */
    }
    const space = currentSpace();
    setStorageSpace('');
    clearStorageSpace(space);
    // Il progetto dell'account non resta aperto: si torna a quello locale.
    withoutSync(() => useStore.getState().openProject(loadCurrent() ?? DEMO_PROJECTS[0]!.build()));
    useStore.setState({ progress: loadProgress() });
    set({ phase: 'signed-out', user: null, sync: 'idle', syncError: null, dataVersion: get().dataVersion + 1 });
  },
}));

const newer = (a: Project | null, b: Project | null): Project | null => {
  if (!a) return b;
  if (!b) return a;
  return (a.updatedAt ?? '') >= (b.updatedAt ?? '') ? a : b;
};

/** Carica i dati dell'account e attiva la sincronizzazione. */
async function enterAccount(user: AccountUser, interactive: boolean): Promise<void> {
  const [lib, state] = await Promise.all([api.projects(), api.state()]);
  const before = useStore.getState().project;
  setStorageSpace(spaceOf(user));
  const cachedCurrent = loadCurrent();
  let cloudCurrent: Project | null = null;
  try {
    cloudCurrent = state.current ? validateProject(state.current) : null;
  } catch {
    cloudCurrent = null;
  }
  withoutSync(() => {
    replaceLibrary(lib.projects);
    replaceProgress((state.exercises ?? {}) as Record<string, Progress>);
    replaceLessonProgress((state.lessons ?? {}) as Record<string, LessonProgress>);
  });
  useStore.setState({ progress: loadProgress() });
  useAccount.setState((s) => ({ phase: 'signed-in', user, dataVersion: s.dataVersion + 1, sync: 'idle', syncError: null }));

  const accountCurrent = newer(cachedCurrent, cloudCurrent);
  if (!interactive) {
    // Sessione già aperta (ricarica della pagina): si riprende il lavoro dell'account.
    if (accountCurrent) withoutSync(() => useStore.getState().openProject(accountCurrent));
    else queue({ type: 'current', project: before });
    return;
  }
  if (accountCurrent && window.confirm(`Riprendere l'ultimo progetto del tuo account («${accountCurrent.name}»)?\n\nAnnulla per continuare con il progetto aperto ora: verrà salvato nel tuo account.`)) {
    withoutSync(() => useStore.getState().openProject(accountCurrent));
    storeCurrentLocal(accountCurrent);
  } else {
    storeCurrentLocal(before);
    queue({ type: 'current', project: before });
  }
}

// ------------------------------------------------------------------ sincronizzazione

const DEBOUNCE_MS = { current: 3000, lessons: 1000, exercises: 1000 } as const;
let pendingState: { current?: Project; lessons?: unknown; exercises?: unknown } = {};
let stateTimer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

function run(job: () => Promise<unknown>): Promise<void> {
  const st = useAccount.setState;
  st({ sync: 'saving' });
  chain = chain
    .then(job)
    .then(() => st({ sync: 'idle', syncError: null, lastSyncAt: new Date().toISOString() }))
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      st({ sync: 'error', syncError: msg });
      if (e instanceof ApiError && e.status === 401) st({ phase: 'signed-out', user: null });
    });
  return chain;
}

function flushState(): Promise<void> {
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = null;
  const patch = pendingState;
  pendingState = {};
  if (!Object.keys(patch).length) return chain;
  return run(() => api.saveState(patch));
}

export function flushPending(): Promise<void> {
  return flushState();
}

function queue(e: PersistEvent): void {
  if (useAccount.getState().phase !== 'signed-in') return;
  switch (e.type) {
    case 'project-save':
      void run(() => api.saveProject(e.project));
      return;
    case 'project-delete':
      void run(() => api.deleteProject(e.id));
      return;
    case 'current':
      pendingState.current = e.project;
      break;
    case 'lessons':
      pendingState.lessons = e.data;
      break;
    case 'exercises':
      pendingState.exercises = e.data;
      break;
  }
  const wait = DEBOUNCE_MS[e.type];
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = setTimeout(() => void flushState(), wait);
}

onPersist(queue);

// Uscendo dalla pagina si prova a inviare l'ultimo stato in sospeso.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!Object.keys(pendingState).length || useAccount.getState().phase !== 'signed-in') return;
    try {
      void fetch('./api/index.php?action=state_save', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-ElectroLab': '1' },
        body: JSON.stringify(pendingState),
      });
      pendingState = {};
    } catch {
      /* invio non riuscito: resta la copia locale */
    }
  });
}

