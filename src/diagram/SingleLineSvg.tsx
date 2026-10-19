import type { ReactNode } from 'react';
import { deviceCurrent, type SimResult } from '../engine/simulate';
import type { ComponentInstance, Project } from '../model/types';
import { SL, type SingleLine, type SLNode } from './singleLine';

export interface DiagramPalette {
  bg: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  live: string;
  select: string;
  frame: string;
}

export const PALETTES: Record<'dark' | 'print', DiagramPalette> = {
  dark: { bg: '#0b1120', line: '#cbd5e1', text: '#e2e8f0', muted: '#94a3b8', accent: '#fbbf24', live: '#fcd34d', select: '#38bdf8', frame: '#334155' },
  print: { bg: '#ffffff', line: '#111111', text: '#111111', muted: '#444444', accent: '#000000', live: '#b45309', select: '#0369a1', frame: '#111111' },
};

const n1 = (v: number, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const amp = (a: number) => (a < 1 ? `${n1(a * 1000, 0)} mA` : `${n1(a, a < 10 ? 2 : 1)} A`);
const kw = (w: number) => (w >= 1000 ? `${n1(w / 1000, w % 1000 ? 1 : 0)} kW` : `${n1(w, 0)} W`);

const SUPPLY_H = 52;

/** Righe di targa mostrate accanto al simbolo di un dispositivo. */
function ratingLines(c: ComponentInstance): string[] {
  const pr = c.params;
  switch (pr.kind) {
    case 'mcb':
      return [`${pr.p.poles} ${pr.p.curve}${pr.p.in}`, `Icn ${n1(pr.p.icn, pr.p.icn % 1 ? 1 : 0)} kA`];
    case 'rcbo':
      return [`${pr.p.poles} ${pr.p.curve}${pr.p.in}`, `IΔn ${pr.p.idn} mA ${pr.p.rcdType}`, `Icn ${n1(pr.p.icn, pr.p.icn % 1 ? 1 : 0)} kA`];
    case 'rcd':
      return [`${pr.p.poles} ${pr.p.in} A`, `IΔn ${pr.p.idn} mA ${pr.p.rcdType}${pr.p.selective ? ' S' : ''}`];
    case 'switch':
      return [`${pr.p.poles} ${pr.p.in} A`, 'Sezionatore'];
    case 'relay':
      return ['Relè passo-passo', `${pr.p.in} A`];
    case 'fuse':
      return [`${pr.p.poles} gG ${pr.p.in} A`, `10×38 · ${pr.p.icn} kA`];
    default:
      return [];
  }
}

function DeviceSymbol({ node, p }: { node: SLNode; p: DiagramPalette }) {
  const k = node.comp.params.kind;
  const breaker = k === 'mcb' || k === 'rcbo';
  const residual = k === 'rcd' || k === 'rcbo';
  const H = SL.symbolH;
  if (k === 'fuse') {
    // sezionatore con fusibile: rettangolo del fusibile sulla lama
    return (
      <g>
        <line x1={0} y1={0} x2={0} y2={20} stroke={p.line} strokeWidth={1.6} />
        <line x1={-5} y1={20} x2={5} y2={20} stroke={p.line} strokeWidth={1.6} />
        <line x1={0} y1={46} x2={-12} y2={18} stroke={p.line} strokeWidth={1.6} />
        <rect x={-10.5} y={23} width={7} height={16} transform="rotate(-23 -7 31)" fill="none" stroke={p.line} strokeWidth={1.4} />
        <line x1={0} y1={46} x2={0} y2={H} stroke={p.line} strokeWidth={1.6} />
      </g>
    );
  }
  // contatto fisso a y=20, lama da (0,44) a (-12,18)
  return (
    <g>
      <line x1={0} y1={0} x2={0} y2={20} stroke={p.line} strokeWidth={1.6} />
      <line x1={0} y1={44} x2={-12} y2={18} stroke={p.line} strokeWidth={1.6} />
      <line x1={0} y1={44} x2={0} y2={H} stroke={p.line} strokeWidth={1.6} />
      {breaker && (
        <g stroke={p.line} strokeWidth={1.6}>
          <line x1={-4} y1={16} x2={4} y2={24} />
          <line x1={4} y1={16} x2={-4} y2={24} />
        </g>
      )}
      {k === 'switch' && <line x1={-5} y1={20} x2={5} y2={20} stroke={p.line} strokeWidth={1.6} />}
      {residual && (
        <g>
          <ellipse cx={0} cy={53} rx={9} ry={4} fill="none" stroke={p.line} strokeWidth={1.3} />
          <line x1={-9} y1={53} x2={-16} y2={53} stroke={p.line} strokeWidth={1} strokeDasharray="2 2" />
          <line x1={-16} y1={53} x2={-16} y2={33} stroke={p.line} strokeWidth={1} strokeDasharray="2 2" />
          <line x1={-16} y1={33} x2={-7} y2={31} stroke={p.line} strokeWidth={1} strokeDasharray="2 2" />
        </g>
      )}
    </g>
  );
}

function LoadSymbol({ node, p }: { node: SLNode; p: DiagramPalette }) {
  const pr = node.comp.params;
  if (pr.kind !== 'load') return null;
  if (pr.p.phases === 3) {
    return (
      <g>
        <rect x={-14} y={0} width={28} height={22} fill="none" stroke={p.line} strokeWidth={1.5} />
        <text x={0} y={15} textAnchor="middle" fontSize={9} fill={p.text} fontFamily="Arial, sans-serif">
          3~R
        </text>
      </g>
    );
  }
  if ((pr.p.cosPhi ?? 1) < 1) {
    // carico a motore/compressore
    return (
      <g>
        <circle cx={0} cy={11} r={11} fill="none" stroke={p.line} strokeWidth={1.5} />
        <text x={0} y={15} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={p.text} fontFamily="Arial, sans-serif">
          M~
        </text>
      </g>
    );
  }
  if (pr.p.category === 'illuminazione') {
    return (
      <g stroke={p.line} strokeWidth={1.5} fill="none">
        <circle cx={0} cy={11} r={11} />
        <line x1={-7.8} y1={3.2} x2={7.8} y2={18.8} />
        <line x1={7.8} y1={3.2} x2={-7.8} y2={18.8} />
      </g>
    );
  }
  if (pr.p.category === 'prese' || pr.p.hasSockets) {
    return (
      <g stroke={p.line} strokeWidth={1.5} fill="none">
        <path d="M -12 4 A 12 12 0 0 0 12 4" />
        <line x1={-12} y1={4} x2={12} y2={4} />
        <line x1={0} y1={0} x2={0} y2={4} />
      </g>
    );
  }
  return (
    <g>
      <rect x={-12} y={0} width={24} height={22} fill="none" stroke={p.line} strokeWidth={1.5} />
      <text x={0} y={15} textAnchor="middle" fontSize={9} fill={p.text} fontFamily="Arial, sans-serif">
        R
      </text>
    </g>
  );
}

/** Trattini obliqui che indicano il numero di conduttori attivi della linea. */
function Slashes({ x, y, n, p }: { x: number; y: number; n: number; p: DiagramPalette }) {
  const items: ReactNode[] = [];
  const shown = Math.min(n, 4);
  for (let i = 0; i < shown; i++) {
    const yy = y + (i - (shown - 1) / 2) * 4;
    items.push(<line key={i} x1={x - 5} y1={yy + 3} x2={x + 5} y2={yy - 3} stroke={p.line} strokeWidth={1.1} />);
  }
  return <g>{items}</g>;
}

const bottomOf = (n: SLNode) => n.y + (n.kind === 'supply' ? SUPPLY_H : n.kind === 'device' ? SL.symbolH : n.kind === 'spd' ? 36 : 22);

export interface SingleLineSvgProps {
  sl: SingleLine;
  project: Project;
  palette: DiagramPalette;
  live?: SimResult | null;
  selectedId?: string | null;
  onSelect?: (componentId: string) => void;
  /** Data mostrata nel cartiglio */
  date?: string;
}

export function SingleLineSvg({ sl, project, palette: p, live, selectedId, onSelect, date }: SingleLineSvgProps) {
  const edges: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const font = 'Arial, Helvetica, sans-serif';

  for (const n of sl.nodes) {
    if (!n.children.length) continue;
    const pb = bottomOf(n);
    const busY = pb + 16;
    edges.push(<line key={`v-${n.id}`} x1={n.x} y1={pb} x2={n.x} y2={busY} stroke={p.line} strokeWidth={1.6} />);
    if (n.children.length > 1) {
      const xs = n.children.map((c) => c.x);
      edges.push(<line key={`b-${n.id}`} x1={Math.min(...xs)} y1={busY} x2={Math.max(...xs)} y2={busY} stroke={p.line} strokeWidth={2.4} />);
    }
    for (const c of n.children) {
      edges.push(<line key={`c-${c.id}`} x1={c.x} y1={busY} x2={c.x} y2={c.y} stroke={p.line} strokeWidth={1.6} />);
      const midY = (busY + c.y) / 2;
      edges.push(<Slashes key={`s-${c.id}`} x={c.x} y={midY} n={c.conductors} p={p} />);
      edges.push(
        <text key={`n-${c.id}`} x={c.x - 8} y={midY + 3} textAnchor="end" fontSize={8.5} fill={p.muted} fontFamily={font}>
          {c.conductors}
          {c.phase ? ` ${c.phase}` : ''}
        </text>,
      );
      if (live && live.ok) {
        const i = c.kind === 'device' ? deviceCurrent(live, c.id) : (live.loads.get(c.id)?.i ?? 0);
        if (i > 0.0005) {
          edges.push(
            <text key={`i-${c.id}`} x={c.x + 7} y={midY + 3} fontSize={9} fontWeight={700} fill={p.live} fontFamily={font}>
              {amp(i)}
            </text>,
          );
        }
      }
    }
  }

  for (const n of sl.nodes) {
    const sel = selectedId === n.id;
    const click = onSelect ? { onClick: () => onSelect(n.id), style: { cursor: 'pointer' } } : {};
    if (n.kind === 'supply' && n.comp.params.kind === 'supply') {
      const sp = n.comp.params.p;
      labels.push(
        <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...click}>
          {sel && <rect x={-26} y={-6} width={52} height={SUPPLY_H + 8} rx={4} fill="none" stroke={p.select} strokeWidth={2} />}
          <circle cx={0} cy={18} r={17} fill={p.bg} stroke={p.line} strokeWidth={1.6} />
          <text x={0} y={22} textAnchor="middle" fontSize={10} fontWeight={700} fill={p.text} fontFamily={font}>
            kWh
          </text>
          <line x1={0} y1={35} x2={0} y2={SUPPLY_H} stroke={p.line} strokeWidth={1.6} />
          <text x={26} y={10} fontSize={11} fontWeight={700} fill={p.text} fontFamily={font}>
            {n.comp.label} · Fornitura
          </text>
          <text x={26} y={23} fontSize={9.5} fill={p.muted} fontFamily={font}>
            {sp.phases === 3 ? `3F+N 400/${sp.voltage} V` : `1F+N ${sp.voltage} V`} · {sp.frequency} Hz · TT
          </text>
          <text x={26} y={35} fontSize={9.5} fill={p.muted} fontFamily={font}>
            Potenza impegnata {n1(sp.contractKW, sp.contractKW % 1 ? 1 : 0)} kW
          </text>
        </g>,
      );
    } else if (n.kind === 'device') {
      const lines = ratingLines(n.comp);
      labels.push(
        <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...click}>
          {sel && <rect x={-24} y={-4} width={48} height={SL.symbolH + 8} rx={4} fill="none" stroke={p.select} strokeWidth={2} />}
          <rect x={-22} y={0} width={44} height={SL.symbolH} fill="transparent" />
          {n.panelStart && (
            <g>
              <rect x={-58} y={-2} width={44} height={14} rx={3} fill="none" stroke={p.accent} strokeDasharray="3 2" />
              <text x={-36} y={8} textAnchor="middle" fontSize={8} fontWeight={700} fill={p.accent} fontFamily={font}>
                {n.panelStart.length > 9 ? `${n.panelStart.slice(0, 8)}…` : n.panelStart}
              </text>
            </g>
          )}
          <DeviceSymbol node={n} p={p} />
          <text x={12} y={14} fontSize={11} fontWeight={700} fill={p.accent} fontFamily={font}>
            {n.comp.label}
            {!n.comp.closed && live ? ' (aperto)' : ''}
          </text>
          {lines.map((l, i) => (
            <text key={i} x={12} y={27 + i * 11} fontSize={9} fill={p.text} fontFamily={font}>
              {l}
            </text>
          ))}
        </g>,
      );
    } else if (n.kind === 'spd' && n.comp.params.kind === 'spd') {
      const sp = n.comp.params.p;
      labels.push(
        <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...click}>
          {sel && <rect x={-60} y={-6} width={120} height={SL.loadH} rx={4} fill="none" stroke={p.select} strokeWidth={2} />}
          <rect x={-60} y={-4} width={120} height={SL.loadH - 4} fill="transparent" />
          <rect x={-8} y={0} width={16} height={24} fill="none" stroke={p.line} strokeWidth={1.5} />
          <line x1={-11} y1={26} x2={11} y2={-2} stroke={p.line} strokeWidth={1.2} />
          <line x1={0} y1={24} x2={0} y2={30} stroke={p.line} strokeWidth={1.5} />
          <line x1={-8} y1={30} x2={8} y2={30} stroke={p.line} strokeWidth={1.5} />
          <line x1={-5} y1={33} x2={5} y2={33} stroke={p.line} strokeWidth={1.5} />
          <line x1={-2} y1={36} x2={2} y2={36} stroke={p.line} strokeWidth={1.5} />
          <text x={0} y={50} textAnchor="middle" fontSize={10} fontWeight={700} fill={p.text} fontFamily={font}>
            {n.comp.label} SPD tipo {sp.spdType}
          </text>
          <text x={0} y={62} textAnchor="middle" fontSize={9} fill={p.muted} fontFamily={font}>
            Uc {sp.uc} V · Up {n1(sp.up, 1)} kV
          </text>
        </g>,
      );
    } else if (n.kind === 'load' && n.comp.params.kind === 'load') {
      const lp = n.comp.params.p;
      const posa = lp.install ? ` · ${lp.install.method}` : '';
      const name = lp.name.length > 22 ? `${lp.name.slice(0, 21)}…` : lp.name;
      labels.push(
        <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...click}>
          {sel && <rect x={-60} y={-6} width={120} height={SL.loadH} rx={4} fill="none" stroke={p.select} strokeWidth={2} />}
          <rect x={-60} y={-4} width={120} height={SL.loadH - 4} fill="transparent" />
          <LoadSymbol node={n} p={p} />
          <text x={0} y={38} textAnchor="middle" fontSize={10} fontWeight={700} fill={p.text} fontFamily={font}>
            {n.comp.label} {name}
          </text>
          <text x={0} y={50} textAnchor="middle" fontSize={9} fill={p.muted} fontFamily={font}>
            {kw(lp.powerW)}
            {lp.phases === 3 ? ' trifase' : ''}
          </text>
          <text x={0} y={62} textAnchor="middle" fontSize={9} fill={p.muted} fontFamily={font}>
            {n1(lp.cableSection, lp.cableSection % 1 ? 1 : 0)} mm² · {n1(lp.cableLength, 0)} m{posa}
          </text>
        </g>,
      );
    }
  }

  // Cartiglio
  const tbW = 300;
  const tbH = 62;
  const W = Math.max(sl.width, tbW + 40);
  const tbX = W - tbW - 16;
  const tbY = sl.height - tbH - 12;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={sl.height} viewBox={`0 0 ${W} ${sl.height}`} style={{ background: p.bg }}>
      <rect x={0} y={0} width={W} height={sl.height} fill={p.bg} />
      <rect x={6} y={6} width={W - 12} height={sl.height - 12} fill="none" stroke={p.frame} strokeWidth={1} />
      {edges}
      {labels}
      {sl.orphans.length > 0 && (
        <text x={16} y={sl.height - 20} fontSize={9.5} fill={p.muted} fontFamily={font}>
          Non collegati alla fornitura (non rappresentati): {sl.orphans.map((o) => o.label).join(', ')}
        </text>
      )}
      <g transform={`translate(${tbX} ${tbY})`}>
        <rect width={tbW} height={tbH} fill={p.bg} stroke={p.frame} />
        <line x1={0} y1={22} x2={tbW} y2={22} stroke={p.frame} />
        <text x={8} y={15} fontSize={11} fontWeight={700} fill={p.text} fontFamily={font}>
          {project.name.length > 40 ? `${project.name.slice(0, 39)}…` : project.name}
        </text>
        <text x={8} y={36} fontSize={9.5} fill={p.text} fontFamily={font}>
          Schema unifilare · {date ?? new Date().toLocaleDateString('it-IT')}
        </text>
        <text x={8} y={49} fontSize={8.5} fill={p.muted} fontFamily={font}>
          Generato da ElectroLab dai collegamenti del progetto.
        </text>
        <text x={8} y={58} fontSize={8} fill={p.muted} fontFamily={font}>
          Documento didattico: non costituisce progetto esecutivo.
        </text>
      </g>
    </svg>
  );
}
