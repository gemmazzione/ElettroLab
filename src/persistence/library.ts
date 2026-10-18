import { catalogItem } from '../model/catalog';
import { newId } from '../model/factory';
import type { Project } from '../model/types';
import { deleteSaved, loadSaved, saveProject, validateProject } from './storage';

const INDEX_KEY = 'electrolab.projects.v1';

export interface ProjectSummary {
  phases: 1 | 3 | null;
  circuits: number;
  devices: number;
  modulesUsed: number;
  modulesTotal: number;
  contractKW: number | null;
}

/** Riepilogo mostrato nelle schede della libreria (funzione pura). */
export function summarizeProject(p: Project): ProjectSummary {
  const supply = p.components.find((c) => c.params.kind === 'supply');
  return {
    phases: supply && supply.params.kind === 'supply' ? (supply.params.p.phases === 3 ? 3 : 1) : null,
    circuits: p.components.filter((c) => c.params.kind === 'load').length,
    devices: p.components.filter((c) => c.rail && c.params.kind !== 'bar').length,
    modulesUsed: p.components.reduce((n, c) => n + (c.rail ? catalogItem(c.catalogId).modules : 0), 0),
    modulesTotal: p.panel.modulesPerRow * p.panel.rows,
    contractKW: supply && supply.params.kind === 'supply' ? supply.params.p.contractKW : null,
  };
}

/** Copia indipendente di un progetto: nuovo identificativo e nome. */
export function copyProject(p: Project, name?: string): Project {
  return { ...structuredClone(p), id: newId('prj'), name: name ?? `${p.name} (copia)`, updatedAt: new Date().toISOString() };
}

export interface LibraryEntry {
  project: Project;
  summary: ProjectSummary;
}

export function listLibrary(): LibraryEntry[] {
  let all: Record<string, Project> = {};
  try {
    all = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}') as Record<string, Project>;
  } catch {
    all = {};
  }
  const out: LibraryEntry[] = [];
  for (const raw of Object.values(all)) {
    try {
      const project = validateProject(raw);
      out.push({ project, summary: summarizeProject(project) });
    } catch {
      /* progetto non leggibile: ignorato */
    }
  }
  return out;
}

export function duplicateSaved(id: string): Project | null {
  const p = loadSaved(id);
  if (!p) return null;
  const c = copyProject(p);
  return saveProject(c) ? c : null;
}

export function renameSaved(id: string, name: string): boolean {
  const p = loadSaved(id);
  if (!p) return false;
  return saveProject({ ...p, name });
}

export function removeSaved(id: string): void {
  deleteSaved(id);
}

// ------------------------------------------------------------------ file

const LIBRARY_FORMAT = 'electrolab-library';

function download(name: string, content: unknown) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportLibraryFile(): number {
  const projects = listLibrary().map((e) => e.project);
  download(`electrolab-libreria-${new Date().toISOString().slice(0, 10)}.json`, { format: LIBRARY_FORMAT, version: 1, exportedAt: new Date().toISOString(), projects });
  return projects.length;
}

/**
 * Importa un file: un singolo progetto oppure un'intera libreria.
 * I progetti con un identificativo già presente vengono aggiunti come copia.
 */
export function importIntoLibrary(raw: unknown): { imported: Project[] } {
  const obj = raw as { format?: string; projects?: unknown[] };
  const list = obj && obj.format === LIBRARY_FORMAT && Array.isArray(obj.projects) ? obj.projects : [raw];
  const existing = new Set(listLibrary().map((e) => e.project.id));
  const imported: Project[] = [];
  for (const item of list) {
    const p = validateProject(item);
    const final = existing.has(p.id) ? copyProject(p, `${p.name} (importato)`) : p;
    if (saveProject(final)) {
      imported.push(final);
      existing.add(final.id);
    }
  }
  return { imported };
}
