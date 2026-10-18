import { Handle, Position } from '@xyflow/react';
import { abs } from '../../engine/complex';
import { isLiveVoltage } from '../../engine/simulate';
import { FN_COLOR_HEX } from '../../model/constants';
import { describeTerminal } from '../../model/terminals';
import type { Terminal } from '../../model/types';
import { useStore } from '../../store/projectStore';
import { fmt } from '../../ui/format';

/** Morsetto collegabile: è il punto di aggancio dei conduttori nel grafo e dei puntali del multimetro. */
export function TerminalHandle({ t, y, ownerLabel }: { t: Terminal; y: number; ownerLabel: string }) {
  const v = useStore((s) => (s.result && s.result.ok ? s.result.terminalV.get(t.id) : undefined));
  const running = useStore((s) => s.running);
  const wiringMode = useStore((s) => s.wiringMode);
  const tool = useStore((s) => s.tool);
  const probe = useStore((s) => (s.probes.red === t.id ? 'red' : s.probes.black === t.id ? 'black' : null));
  const setProbe = useStore((s) => s.probe);
  const live = running && isLiveVoltage(v);
  const reading = !running
    ? 'impianto non alimentato'
    : v === null
      ? 'potenziale indeterminato (isolato)'
      : v
        ? `${fmt(abs(v), 1)} V verso terra`
        : '—';
  const metering = tool === 'multimeter';
  return (
    <Handle
      id={t.key}
      type="source"
      position={t.side === 'top' ? Position.Top : Position.Bottom}
      isConnectable={tool === 'select'}
      className={`terminal ${live ? 'terminal-live' : ''} ${wiringMode || metering ? 'terminal-wiring' : ''} ${probe ? `probe-${probe}` : ''} ${metering ? 'nodrag cursor-crosshair' : ''}`}
      style={{ left: t.x, top: y, borderColor: FN_COLOR_HEX[t.fn] }}
      title={`${ownerLabel} · ${describeTerminal(t)} — ${reading}${metering ? '\nClic: appoggia un puntale' : ''}`}
      onClick={(e) => {
        if (!metering) return;
        e.stopPropagation();
        setProbe(t.id);
      }}
    />
  );
}
