import type { Project } from '../model/types';

/** Chiamate all'API account (api/index.php sullo stesso sito dell'app). */

export interface AccountUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

export interface AdminUserRow {
  id: number;
  username: string;
  role: 'admin' | 'user';
  disabled: boolean;
  createdAt: string;
  lastLogin: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const BASE = './api/index.php';

async function call<T>(action: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}?action=${encodeURIComponent(action)}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-ElectroLab': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Server degli account non raggiungibile.', 0);
  }
  let data: { ok?: boolean; error?: string } & Record<string, unknown>;
  try {
    data = await r.json();
  } catch {
    // Nessun JSON: il sito non ha l'API (es. sviluppo locale senza PHP) o il server ha risposto con una pagina di errore.
    throw new ApiError('Servizio account non disponibile su questo sito.', r.status || 0);
  }
  if (!r.ok || !data.ok) throw new ApiError(data.error ?? `Errore ${r.status}`, r.status);
  return data as T;
}

export const api = {
  status: () => call<{ setupNeeded: boolean; setupAvailable: boolean; user: AccountUser | null }>('status'),
  setup: (token: string, username: string, password: string) => call<{ user: AccountUser }>('setup', { token, username, password }),
  login: (username: string, password: string) => call<{ user: AccountUser }>('login', { username, password }),
  logout: () => call<object>('logout', {}),
  changePassword: (old: string, next: string) => call<object>('password', { old, new: next }),
  projects: () => call<{ projects: Project[] }>('projects'),
  saveProject: (project: Project) => call<object>('project_save', { project }),
  deleteProject: (id: string) => call<object>('project_delete', { id }),
  state: () => call<{ current: Project | null; lessons: Record<string, unknown> | null; exercises: Record<string, unknown> | null; updatedAt: string | null }>('state'),
  saveState: (patch: { current?: Project | null; lessons?: unknown; exercises?: unknown }) => call<object>('state_save', patch),
  users: () => call<{ users: AdminUserRow[] }>('users'),
  createUser: (username: string, password: string, role: 'admin' | 'user') => call<{ id: number }>('user_create', { username, password, role }),
  setUserPassword: (id: number, password: string) => call<object>('user_password', { id, password }),
  setUserDisabled: (id: number, disabled: boolean) => call<object>('user_disable', { id, disabled }),
  deleteUser: (id: number) => call<object>('user_delete', { id }),
};
