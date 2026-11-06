import { create } from 'zustand';
import { loadProgress, replaceProgress, type Progress } from '../academy/evaluate';
import { replaceLessonProgress, type LessonProgress } from '../academy/lessons';
import type { Project } from '../model/types';
import { clearStorageSpace, currentSpace, onPersist, setStorageSpace, withoutSync, type PersistEvent } from '../persistence/space';
import { loadCurrent, replaceLibrary, storeCurrentLocal, validateProject } from '../persistence/storage';
import { mergeLibraries, usePvDesign, validLibrary } from '../pvdesign/store';
import { mergePlants, useImpianto, validPlants } from '../impianto/store';
import { loadCeiProgress, mergeCeiProgress, replaceCeiProgress, type CeiProgress } from '../academy/cei';
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
    usePvDesign.getState().reload();
    useImpianto.getState().reload();
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
  // I progetti FV si leggono a parte: un server non ancora aggiornato non ha questa azione.
  const [lib, state, pv, imp, cei] = await Promise.all([api.projects(), api.state(), api.pv().catch(() => null), api.impianti().catch(() => null), api.cei().catch(() => null)]);
  const beforeCei = loadCeiProgress();
  const beforeImp = { currentId: useImpianto.getState().currentId, plants: useImpianto.getState().plants };
  const before = useStore.getState().project;
  const beforePv = usePvDesign.getState().library;
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
  usePvDesign.getState().reload();
  const cloudPv = validLibrary(pv?.pv);
  const pvLib = mergeLibraries(cloudPv, interactive ? beforePv : validLibrary(localPvLibrary()));
  if (pvLib) withoutSync(() => usePvDesign.getState().replaceLibrary(pvLib));
  // Progetti di «Progetta impianto»: si uniscono quelli dell'account e quelli del browser.
  useImpianto.getState().reload();
  const cloudImp = validPlants(imp?.impianti);
  const localImp = validPlants({ currentId: useImpianto.getState().currentId, plants: useImpianto.getState().plants });
  const impLib = mergePlants(cloudImp, interactive ? beforeImp : localImp);
  if (impLib) withoutSync(() => useImpianto.getState().replace(impLib));
  // Ripasso del percorso CEI 64-8
  const cloudCei = cei?.cei && typeof cei.cei === 'object' ? (cei.cei as CeiProgress) : null;
  const ceiAll = mergeCeiProgress(cloudCei, interactive ? beforeCei : loadCeiProgress());
  replaceCeiProgress(ceiAll);
  useAccount.setState((s) => ({ phase: 'signed-in', user, dataVersion: s.dataVersion + 1, sync: 'idle', syncError: null }));

  if (pvLib && pv && JSON.stringify(pvLib) !== JSON.stringify(cloudPv)) queue({ type: 'pv', data: pvLib });
  if (impLib && imp && JSON.stringify(impLib) !== JSON.stringify(cloudImp)) queue({ type: 'impianti', data: impLib });
  if (cei && JSON.stringify(ceiAll) !== JSON.stringify(cloudCei ?? {})) queue({ type: 'cei', data: ceiAll });
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
let pvTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPv: unknown = undefined;
let ceiTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCei: unknown = undefined;

function flushCei(): Promise<void> {
  if (ceiTimer) clearTimeout(ceiTimer);
  ceiTimer = null;
  if (pendingCei === undefined) return chain;
  const data = pendingCei;
  pendingCei = undefined;
  return run(() => api.saveCei(data));
}
let impTimer: ReturnType<typeof setTimeout> | null = null;
let pendingImp: unknown = undefined;

function flushImp(): Promise<void> {
  if (impTimer) clearTimeout(impTimer);
  impTimer = null;
  if (pendingImp === undefined) return chain;
  const data = pendingImp;
  pendingImp = undefined;
  return run(() => api.saveImpianti(data));
}

function flushPv(): Promise<void> {
  if (pvTimer) clearTimeout(pvTimer);
  pvTimer = null;
  if (pendingPv === undefined) return chain;
  const data = pendingPv;
  pendingPv = undefined;
  return run(() => api.savePv(data));
}

/** Libreria FV già presente nello spazio locale dell'account (sessione riaperta). */
function localPvLibrary(): unknown {
  try {
    return JSON.parse(localStorage.getItem(`electrolab.pvdesign.library@${currentSpace()}`) ?? 'null');
  } catch {
    return null;
  }
}
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
  return flushPv().then(flushImp).then(flushCei).then(flushState);
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
    case 'pv':
      pendingPv = e.data;
      if (pvTimer) clearTimeout(pvTimer);
      pvTimer = setTimeout(() => void flushPv(), 4000);
      return;
    case 'cei':
      pendingCei = e.data;
      if (ceiTimer) clearTimeout(ceiTimer);
      ceiTimer = setTimeout(() => void flushCei(), 3000);
      return;
    case 'impianti':
      pendingImp = e.data;
      if (impTimer) clearTimeout(impTimer);
      impTimer = setTimeout(() => void flushImp(), 4000);
      return;
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

