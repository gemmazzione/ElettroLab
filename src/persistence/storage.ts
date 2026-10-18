import { CATALOG_BY_ID } from '../model/catalog';
import type { Project } from '../model/types';

const INDEX_KEY = 'electrolab.projects.v1';
const CURRENT_KEY = 'electrolab.current.v1';

export interface SavedEntry {
  id: string;
  name: string;
  updatedAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listSaved(): SavedEntry[] {
  const all = read<Record<string, Project>>(INDEX_KEY, {});
  return Object.values(all)
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveProject(p: Project): boolean {
  const all = read<Record<string, Project>>(INDEX_KEY, {});
  all[p.id] = { ...p, updatedAt: new Date().toISOString() };
  return write(INDEX_KEY, all);
}

export function loadSaved(id: string): Project | null {
  const p = read<Record<string, Project>>(INDEX_KEY, {})[id];
  return p ? validateProject(p) : null;
}

export function deleteSaved(id: string): void {
  const all = read<Record<string, Project>>(INDEX_KEY, {});
  delete all[id];
  write(INDEX_KEY, all);
}

export function saveCurrent(p: Project): void {
  write(CURRENT_KEY, p);
}

export function loadCurrent(): Project | null {
  const p = read<unknown>(CURRENT_KEY, null);
  if (!p) return null;
  try {
    return validateProject(p);
  } catch {
    return null;
  }
}

/** Controllo strutturale di un progetto importato. Lancia un errore leggibile se non valido. */
export function validateProject(raw: unknown): Project {
  const p = raw as Partial<Project>;
  if (!p || typeof p !== 'object') throw new Error('Il file non contiene un progetto.');
  if (p.schemaVersion !== 1) throw new Error('Versione del formato non supportata.');
  // Formato precedente con un solo quadro ("panel"): conversione automatica a "panels".
  const legacy = p as Partial<Project> & { panel?: { modulesPerRow: number; rows: number } };
  if (!Array.isArray(legacy.panels) && legacy.panel) {
    legacy.panels = [{ id: 'P1', name: 'Quadro generale', origin: { x: 0, y: 0 }, ...legacy.panel }];
    delete legacy.panel;
  }
  if (!Array.isArray(p.components) || !Array.isArray(p.wires) || !Array.isArray(p.panels) || !p.panels.length)
    throw new Error('Struttura del progetto incompleta.');
  for (const c of p.components) {
    if (!CATALOG_BY_ID[c.catalogId]?.defaults) throw new Error(`Componente sconosciuto o non supportato: ${c.catalogId}`);
  }
  return p as Project;
}

export function exportProjectFile(p: Project): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'progetto'}.electrolab.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  return validateProject(JSON.parse(text));
}
