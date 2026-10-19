import { createWire, inferConductor, newId } from './factory';
import { panelOf } from './placement';
import { catalogItem } from './catalog';
import { getPoles } from './terminals';
import type { CombType, ComponentInstance, Conductor, Project, RailPlacement, Wire } from './types';

/**
 * Pettine di collegamento: barra in rame isolata che collega i morsetti d'ingresso
 * di dispositivi modulari adiacenti sulla stessa guida, al posto dei ponticelli in cavo.
 * È rappresentato come una catena di tratti di barra (conduttori con `comb`) tra un dispositivo
 * e il successivo: simulazione, misure, guasti e schema unifilare lo trattano come un conduttore reale.
 */

/** Modulo DIN [m] */
export const MODULE_M = 0.0175;
/** Sezione equivalente della barra [mm²] e corrente nominale tipica [A] (valori indicativi) */
export const COMB_SECTION = 10;
export const COMB_RATED_A = 63;

/** Conduttori portati dal pettine, nell'ordine dei denti. */
export const COMB_PINS: Record<CombType, ('L' | 'N')[]> = {
  '1P': ['L'],
  '1P+N': ['L', 'N'],
  '3P': ['L', 'L', 'L'],
  '3P+N': ['L', 'L', 'L', 'N'],
};

export const COMB_LABEL: Record<CombType, string> = {
  '1P': 'Pettine 1P (fase)',
  '1P+N': 'Pettine 1P+N (fase e neutro)',
  '3P': 'Pettine 3P (L1, L2, L3)',
  '3P+N': 'Pettine 3P+N (L1, L2, L3, N)',
};

const COMB_DEVICES = new Set(['switch', 'mcb', 'rcd', 'rcbo', 'fuse']);

/** Morsetti d'ingresso del dispositivo agganciati ai denti del pettine; null se il dispositivo non è compatibile. */
export function combTerminals(c: ComponentInstance, type: CombType): string[] | null {
  if (!COMB_DEVICES.has(c.params.kind)) return null;
  const poles = getPoles(c);
  const ls = poles.filter((p) => p.fn === 'L');
  const n = poles.find((p) => p.fn === 'N');
  const pins = COMB_PINS[type];
  const needL = pins.filter((x) => x === 'L').length;
  if (ls.length < needL) return null;
  // Un pettine monofase su un dispositivo trifase: si agganciano solo i poli previsti.
  if (needL === 1 && ls.length > 1) return null;
  if (needL === 3 && ls.length !== 3) return null;
  const out: string[] = [];
  let li = 0;
  for (const pin of pins) {
    if (pin === 'N') {
      // In un 2P magnetotermico il secondo polo è il neutro in uso monofase.
      const np = n ?? (poles.length === 2 && type === '1P+N' ? poles[1] : undefined);
      if (!np) return null;
      out.push(`${c.id}:${np.inKey}`);
    } else {
      out.push(`${c.id}:${ls[li++]!.inKey}`);
    }
  }
  return out;
}

export type CombResult = { ok: true; devices: ComponentInstance[]; wires: Wire[] } | { ok: false; reason: string };

/**
 * Costruisce un pettine sulla guida indicata: parte dal dispositivo che occupa (o segue) la posizione
 * e prosegue sui dispositivi adiacenti compatibili, senza moduli liberi in mezzo.
 */
export function buildComb(project: Project, type: CombType, at: RailPlacement, maxDevices = 24): CombResult {
  const panel = panelOf(project, at.panelId);
  const row = project.components
    .filter((c) => c.rail && panelOf(project, c.rail.panelId).id === panel.id && c.rail.row === at.row)
    .sort((a, b) => a.rail!.slot - b.rail!.slot);
  const width = (c: ComponentInstance) => catalogItem(c.catalogId).modules;
  let i = row.findIndex((c) => c.rail!.slot + width(c) > at.slot);
  if (i < 0) return { ok: false, reason: 'nessun dispositivo in questo punto della guida.' };
  // Si parte dal primo dispositivo compatibile a partire dalla posizione indicata.
  while (i < row.length && !combTerminals(row[i]!, type)) i++;
  if (i >= row.length) return { ok: false, reason: `nessun dispositivo compatibile con il ${COMB_LABEL[type].toLowerCase()} da questa posizione.` };
  const devices: ComponentInstance[] = [row[i]!];
  for (let k = i + 1; k < row.length && devices.length < maxDevices; k++) {
    const prev = devices[devices.length - 1]!;
    const c = row[k]!;
    if (c.rail!.slot !== prev.rail!.slot + width(prev)) break;
    if (!combTerminals(c, type)) break;
    devices.push(c);
  }
  if (devices.length < 2) return { ok: false, reason: 'servono almeno due dispositivi compatibili affiancati, senza moduli liberi in mezzo.' };

  const id = newId('comb');
  const wires: Wire[] = [];
  const pins = COMB_PINS[type];
  for (let k = 0; k + 1 < devices.length; k++) {
    const a = combTerminals(devices[k]!, type)!;
    const b = combTerminals(devices[k + 1]!, type)!;
    const length = (devices[k + 1]!.rail!.slot - devices[k]!.rail!.slot) * MODULE_M;
    let phase = 0;
    pins.forEach((fn, pin) => {
      const conductor: Conductor =
        fn === 'N' ? 'N' : type.startsWith('3P') ? (['L1', 'L2', 'L3'] as const)[phase++]! : inferConductor(project, a[pin]!, b[pin]!);
      const w = createWire(project, a[pin]!, b[pin]!, { conductor, section: COMB_SECTION, length });
      w.comb = { id, type, pin };
      wires.push(w);
    });
  }
  return { ok: true, devices, wires };
}

/** Dispositivi collegati da un pettine (in ordine sulla guida). */
export function combDevices(project: Project, combId: string): ComponentInstance[] {
  const ids = new Set<string>();
  for (const w of project.wires) {
    if (w.comb?.id !== combId) continue;
    ids.add(w.from.slice(0, w.from.lastIndexOf(':')));
    ids.add(w.to.slice(0, w.to.lastIndexOf(':')));
  }
  return project.components.filter((c) => ids.has(c.id)).sort((a, b) => (a.rail?.slot ?? 0) - (b.rail?.slot ?? 0));
}
