import { catalogItem } from './catalog';
import { BAR_H, DEVICE_H, MODULE_W } from './geometry';
import type { ComponentInstance, ComponentKind, Phase, PoleDef, Terminal, TerminalDef } from './types';

export const FREE_NODE_SIZE: Partial<Record<ComponentKind, { w: number; h: number }>> = {
  supply: { w: 180, h: 118 },
  earth: { w: 140, h: 110 },
  load: { w: 176, h: 128 },
};

export function terminalId(componentId: string, key: string): string {
  return `${componentId}:${key}`;
}

export function parseTerminalId(id: string): { componentId: string; key: string } {
  const i = id.lastIndexOf(':');
  return { componentId: id.slice(0, i), key: id.slice(i + 1) };
}

export function isSwitchingDevice(kind: ComponentKind): boolean {
  return kind === 'switch' || kind === 'mcb' || kind === 'rcd' || kind === 'rcbo';
}

export function isResidualDevice(kind: ComponentKind): boolean {
  return kind === 'rcd' || kind === 'rcbo';
}

export function componentWidth(c: ComponentInstance): number {
  const item = catalogItem(c.catalogId);
  if (item.mount === 'din') return item.modules * MODULE_W;
  return FREE_NODE_SIZE[c.params.kind]?.w ?? 160;
}

export function componentHeight(c: ComponentInstance): number {
  const item = catalogItem(c.catalogId);
  if (c.params.kind === 'bar') return BAR_H;
  if (c.params.kind === 'supply' && c.params.p.phases === 3) return 150;
  if (c.params.kind === 'load' && c.params.p.phases === 3) return 150;
  if (item.mount === 'din') return DEVICE_H;
  return FREE_NODE_SIZE[c.params.kind]?.h ?? 120;
}

/** Scostamento verticale per centrare sulla guida i componenti più bassi di un dispositivo modulare. */
export function railYOffset(c: ComponentInstance): number {
  return c.rail ? (DEVICE_H - componentHeight(c)) / 2 : 0;
}

/** Poli di manovra di un dispositivo (vuoto per componenti senza contatti). */
export function getPoles(c: ComponentInstance): PoleDef[] {
  const pr = c.params;
  if (pr.kind !== 'switch' && pr.kind !== 'mcb' && pr.kind !== 'rcd' && pr.kind !== 'rcbo') return [];
  const overcurrent = pr.kind === 'mcb' || pr.kind === 'rcbo';
  const pole = (index: number, fn: 'L' | 'N', prot: boolean): PoleDef => ({
    index,
    fn,
    inKey: `p${index}_in`,
    outKey: `p${index}_out`,
    protected: prot,
  });
  switch (pr.p.poles) {
    case '1P':
      return [pole(0, 'L', overcurrent)];
    case '1P+N':
      return [pole(0, 'L', overcurrent), pole(1, 'N', false)];
    case '2P':
      // In un 2P magnetotermico entrambi i poli sono protetti; in uso monofase il secondo è il neutro.
      return [pole(0, 'L', overcurrent), pole(1, 'N', pr.kind === 'mcb')];
    case '3P':
      return [pole(0, 'L', overcurrent), pole(1, 'L', overcurrent), pole(2, 'L', overcurrent)];
    case '3P+N':
      return [pole(0, 'L', overcurrent), pole(1, 'L', overcurrent), pole(2, 'L', overcurrent), pole(3, 'N', false)];
    case '4P':
      // 4P magnetotermico: anche il neutro è protetto; differenziale/sezionatore: nessuna protezione di sovracorrente.
      return [pole(0, 'L', overcurrent), pole(1, 'L', overcurrent), pole(2, 'L', overcurrent), pole(3, 'N', pr.kind === 'mcb')];
  }
}

export const isThreePhaseSupply = (c: ComponentInstance) => c.params.kind === 'supply' && c.params.p.phases === 3;
export const isThreePhaseLoad = (c: ComponentInstance) => c.params.kind === 'load' && c.params.p.phases === 3;

/** Morsetti di fase del punto di fornitura, con la fase corrispondente. */
export function supplyPhaseKeys(c: ComponentInstance): { key: string; phase: Phase }[] {
  return isThreePhaseSupply(c)
    ? [
        { key: 'L1', phase: 1 },
        { key: 'L2', phase: 2 },
        { key: 'L3', phase: 3 },
      ]
    : [{ key: 'L', phase: 1 }];
}

/** Morsetti di fase di un utilizzatore: "L" (monofase) oppure "L1", "L2", "L3". */
export function loadPhaseKeys(c: ComponentInstance): ('L' | 'L1' | 'L2' | 'L3')[] {
  return isThreePhaseLoad(c) ? ['L1', 'L2', 'L3'] : ['L'];
}

/** L'utilizzatore ha il morsetto di neutro (sempre per i monofase). */
export function loadHasNeutral(c: ComponentInstance): boolean {
  return c.params.kind === 'load' && (c.params.p.phases !== 3 || !!c.params.p.withNeutral);
}

/** Morsetto di fase "principale" di un utilizzatore (per tracciamenti e guasti L-N/L-PE). */
export const loadMainPhaseKey = (c: ComponentInstance) => loadPhaseKeys(c)[0]!;

function terminalDefs(c: ComponentInstance): TerminalDef[] {
  const pr = c.params;
  const w = componentWidth(c);
  switch (pr.kind) {
    case 'supply':
      if (pr.p.phases === 3) {
        return [
          { key: 'L1', label: 'L1', fn: 'L', role: 'out', side: 'bottom', x: 30, phase: 1 },
          { key: 'L2', label: 'L2', fn: 'L', role: 'out', side: 'bottom', x: 70, phase: 2 },
          { key: 'L3', label: 'L3', fn: 'L', role: 'out', side: 'bottom', x: 110, phase: 3 },
          { key: 'N', label: 'N', fn: 'N', role: 'out', side: 'bottom', x: 150 },
        ];
      }
      return [
        { key: 'L', label: 'L', fn: 'L', role: 'out', side: 'bottom', x: 64, phase: 1 },
        { key: 'N', label: 'N', fn: 'N', role: 'out', side: 'bottom', x: 116 },
      ];
    case 'earth':
      return [{ key: 'PE', label: 'PE', fn: 'PE', role: 'bus', side: 'top', x: w / 2 }];
    case 'load':
      if (pr.p.phases === 3) {
        const defs: TerminalDef[] = [
          { key: 'L1', label: 'L1', fn: 'L', role: 'in', side: 'top', x: 22 },
          { key: 'L2', label: 'L2', fn: 'L', role: 'in', side: 'top', x: 54 },
          { key: 'L3', label: 'L3', fn: 'L', role: 'in', side: 'top', x: 86 },
        ];
        if (pr.p.withNeutral) defs.push({ key: 'N', label: 'N', fn: 'N', role: 'in', side: 'top', x: 118 });
        defs.push({ key: 'PE', label: 'PE', fn: 'PE', role: 'in', side: 'top', x: 152 });
        return defs;
      }
      return [
        { key: 'L', label: 'L', fn: 'L', role: 'in', side: 'top', x: 44 },
        { key: 'N', label: 'N', fn: 'N', role: 'in', side: 'top', x: 88 },
        { key: 'PE', label: 'PE', fn: 'PE', role: 'in', side: 'top', x: 132 },
      ];
    case 'spd': {
      const keys = pr.p.poles === '3P+N' ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
      const pitch = w / keys.length;
      const defs: TerminalDef[] = keys.map((k, i) => ({
        key: k,
        label: k,
        fn: k === 'N' ? 'N' : 'L',
        role: 'bus',
        side: 'top',
        x: (i + 0.5) * pitch,
      }));
      defs.push({ key: 'PE', label: 'PE', fn: 'PE', role: 'bus', side: 'bottom', x: w / 2 });
      return defs;
    }
    case 'bar': {
      const defs: TerminalDef[] = [];
      const pitch = w / pr.p.ways;
      for (let i = 0; i < pr.p.ways; i++) {
        defs.push({
          key: `t${i}`,
          label: `${i + 1}`,
          fn: pr.p.barFn,
          role: 'bus',
          side: 'top',
          x: (i + 0.5) * pitch,
        });
      }
      return defs;
    }
    default: {
      const poles = getPoles(c);
      const pitch = w / poles.length;
      const defs: TerminalDef[] = [];
      poles.forEach((p, i) => {
        const x = (i + 0.5) * pitch;
        const inLabel = p.fn === 'N' ? 'N' : `${2 * i + 1}`;
        const outLabel = p.fn === 'N' ? 'N' : `${2 * i + 2}`;
        defs.push({ key: p.inKey, label: inLabel, fn: p.fn, role: 'in', side: 'top', pole: p.index, x });
        defs.push({ key: p.outKey, label: outLabel, fn: p.fn, role: 'out', side: 'bottom', pole: p.index, x });
      });
      return defs;
    }
  }
}

export function getTerminals(c: ComponentInstance): Terminal[] {
  return terminalDefs(c).map((d) => ({ ...d, id: terminalId(c.id, d.key), componentId: c.id }));
}

export function describeTerminal(t: Terminal): string {
  const role = t.role === 'in' ? 'ingresso' : t.role === 'out' ? 'uscita' : 'morsetto';
  return `morsetto ${t.label} (${t.fn}, ${role})`;
}
