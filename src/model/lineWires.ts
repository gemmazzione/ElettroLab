import type { ComponentInstance, Project, Wire } from './types';

/**
 * Conduttori collegati a un utilizzatore.
 *
 * La conduttura quadro → utilizzatore è descritta dai parametri dell'utilizzatore (lunghezza e sezione
 * della linea): è lì che il modello ne calcola resistenza, caduta, portata e cortocircuito a fondo linea.
 * Un conduttore disegnato fino a un morsetto dell'utilizzatore È quella stessa linea: ne eredita lunghezza
 * e sezione e nel circuito non aggiunge altra resistenza, così la linea è contata una sola volta.
 */

const ownerId = (tid: string) => tid.slice(0, tid.lastIndexOf(':'));

/** Utilizzatore di cui il conduttore fa parte (collegato a un suo morsetto), oppure null. */
export function lineLoadOf(project: Project, w: Wire): ComponentInstance | null {
  for (const tid of [w.to, w.from]) {
    const c = project.components.find((x) => x.id === ownerId(tid));
    if (c && c.params.kind === 'load') return c;
  }
  return null;
}

/** Identificativi dei conduttori che fanno parte della linea di un utilizzatore. */
export function lineWireIds(project: Project): Set<string> {
  const loads = new Set(project.components.filter((c) => c.params.kind === 'load').map((c) => c.id));
  return new Set(project.wires.filter((w) => loads.has(ownerId(w.from)) || loads.has(ownerId(w.to))).map((w) => w.id));
}

/** Allinea lunghezza e sezione dei conduttori di linea ai dati dell'utilizzatore (modifica il progetto). */
export function syncLineWires(project: Project): void {
  for (const w of project.wires) {
    const load = lineLoadOf(project, w);
    if (!load || load.params.kind !== 'load') continue;
    w.length = load.params.p.cableLength;
    w.section = load.params.p.cableSection;
  }
}
