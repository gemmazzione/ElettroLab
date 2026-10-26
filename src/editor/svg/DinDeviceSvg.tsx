import { BAR_H, DEVICE_H, TERMINAL_Y_BOTTOM, TERMINAL_Y_TOP } from '../../model/geometry';
import type { ComponentInstance, Terminal } from '../../model/types';

/**
 * Fronte di un dispositivo modulare DIN, disegnato in proporzione (1 modulo = 17,5 mm).
 * La leva è il controllo di manovra: alta = chiuso (I), bassa = aperto (O).
 */

interface Props {
  comp: ComponentInstance;
  width: number;
  terminals: Terminal[];
  showLabels: boolean;
  onToggle?: () => void;
  onTest?: () => void;
  tripped?: boolean;
  /** Solo misuratori: potenza attuale [W] ed energia nei due versi [Wh] */
  meter?: { p: number; fwd: number; rev: number } | null;
}

const BODY = '#dfe3e8';
const BODY_EDGE = '#8d96a0';
const TERM_ZONE = '#c9ced5';

function Screw({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6.2} fill="#5f6873" stroke="#3a4048" strokeWidth={0.8} />
      <line x1={x - 3.6} y1={y} x2={x + 3.6} y2={y} stroke="#2a2f35" strokeWidth={1.4} />
      <line x1={x} y1={y - 3.6} x2={x} y2={y + 3.6} stroke="#2a2f35" strokeWidth={1.4} />
    </g>
  );
}

function rating(comp: ComponentInstance): { main: string; sub: string; lever: string } {
  const pr = comp.params;
  switch (pr.kind) {
    case 'mcb':
      return { main: `${pr.p.curve}${pr.p.in}`, sub: `${pr.p.icn} kA`, lever: '#22272e' };
    case 'rcd':
      return { main: `${pr.p.in}A`, sub: `${pr.p.idn}mA ${pr.p.rcdType}${pr.p.selective ? ' S' : ''}`, lever: '#1f4fb8' };
    case 'rcbo':
      return { main: `${pr.p.curve}${pr.p.in}`, sub: `${pr.p.idn}mA ${pr.p.rcdType}`, lever: '#22272e' };
    case 'switch':
      return { main: `${pr.p.in}A`, sub: 'I-0', lever: '#b42318' };
    case 'relay':
      return { main: 'PP', sub: `${pr.p.in}A ${pr.p.coilV}V~`, lever: '#475569' };
    case 'dc-switch':
      return { main: 'DC', sub: `${pr.p.maxV}V ${pr.p.in}A`, lever: '#b42318' };
    default:
      return { main: '', sub: '', lever: '#22272e' };
  }
}

export function DinDeviceSvg({ comp, width: w, terminals, showLabels, onToggle, onTest, tripped, meter }: Props) {
  if (comp.params.kind === 'bar') return <BarSvg comp={comp} width={w} terminals={terminals} showLabels={showLabels} />;
  if (comp.params.kind === 'meter') return <MeterSvg comp={comp} width={w} terminals={terminals} showLabels={showLabels} meter={meter} />;
  if (comp.params.kind === 'fuse') return <FuseSvg comp={comp} width={w} terminals={terminals} showLabels={showLabels} onToggle={onToggle} />;
  if (comp.params.kind === 'spd') return <SpdSvg comp={comp} width={w} terminals={terminals} showLabels={showLabels} tripped={tripped} />;
  const r = rating(comp);
  const residual = comp.params.kind === 'rcd' || comp.params.kind === 'rcbo';
  const leverW = Math.min(w - 12, 22 + (w > 40 ? 14 : 0));
  const leverX = (w - leverW) / 2;
  const slotTop = 70;
  const slotH = 46;
  const knobH = 18;
  const knobY = comp.closed ? slotTop + 3 : slotTop + slotH - knobH - 3;
  const narrow = w < 50;

  return (
    <svg width={w} height={DEVICE_H} viewBox={`0 0 ${w} ${DEVICE_H}`} className="block">
      <defs>
        <linearGradient id={`g-${comp.id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#eef0f3" />
          <stop offset="0.5" stopColor={BODY} />
          <stop offset="1" stopColor="#c8cdd4" />
        </linearGradient>
      </defs>
      <rect x={0.5} y={0.5} width={w - 1} height={DEVICE_H - 1} rx={3} fill={`url(#g-${comp.id})`} stroke={BODY_EDGE} />
      <rect x={1} y={1} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      <rect x={1} y={DEVICE_H - 28} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      {terminals.map((t) => (
        <Screw key={t.key} x={t.x} y={t.side === 'top' ? TERMINAL_Y_TOP : TERMINAL_Y_BOTTOM} />
      ))}
      {showLabels &&
        terminals.map((t) => (
          <text
            key={`l-${t.key}`}
            x={t.x}
            y={t.side === 'top' ? 37 : DEVICE_H - 33}
            textAnchor="middle"
            fontSize={8.5}
            fontWeight={600}
            fill="#39414b"
            fontFamily="ui-monospace, monospace"
          >
            {t.label}
          </text>
        ))}
      {/* targa */}
      <text x={w / 2} y={54} textAnchor="middle" fontSize={narrow ? 10 : 12} fontWeight={700} fill="#1f2630" fontFamily="ui-sans-serif, system-ui">
        {r.main}
      </text>
      <text x={w / 2} y={64} textAnchor="middle" fontSize={narrow ? 6.5 : 7.5} fill="#4a525c" fontFamily="ui-sans-serif, system-ui">
        {r.sub}
      </text>
      {/* sede della leva */}
      <rect x={leverX - 2} y={slotTop} width={leverW + 4} height={slotH} rx={2} fill="#9aa2ac" />
      <rect
        x={leverX}
        y={knobY}
        width={leverW}
        height={knobH}
        rx={2}
        fill={r.lever}
        stroke="#0b0d10"
        strokeWidth={0.6}
        className="lever-knob"
      />
      <text x={leverX + leverW / 2} y={knobY + 12.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#f3f4f6">
        {comp.closed ? 'I' : 'O'}
      </text>
      {/* finestrella di stato: rosso = contatti chiusi, verde = aperti */}
      <rect x={w / 2 - 7} y={122} width={14} height={6} rx={1} fill={comp.closed ? '#dc2626' : tripped ? '#f59e0b' : '#16a34a'} stroke="#3a4048" strokeWidth={0.5} />
      {residual && (
        <g
          className={onTest ? 'nodrag nopan cursor-pointer' : undefined}
          onClick={(e) => {
            if (!onTest) return;
            e.stopPropagation();
            onTest();
          }}
        >
          <title>Pulsante di prova T</title>
          <circle cx={w - (narrow ? 8 : 11)} cy={53} r={narrow ? 4.5 : 5.5} fill="#e9c46a" stroke="#6b5a1e" strokeWidth={0.6} />
          <text x={w - (narrow ? 8 : 11)} y={55.8} textAnchor="middle" fontSize={6.5} fontWeight={700} fill="#3d3206">
            T
          </text>
        </g>
      )}
      {onToggle && (
        <rect
          x={leverX - 2}
          y={slotTop}
          width={leverW + 4}
          height={slotH}
          fill="transparent"
          className="nodrag nopan cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <title>{comp.closed ? 'Clicca per aprire' : 'Clicca per chiudere'}</title>
        </rect>
      )}
      <text x={w / 2} y={141} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1f2630" fontFamily="ui-monospace, monospace">
        {comp.label}
      </text>
    </svg>
  );
}

const BAR_FILL: Record<string, string> = { N: '#1d4ed8', PE: '#15803d', L: '#7c4a1e' };

function BarSvg({ comp, width: w, terminals, showLabels }: Omit<Props, 'onToggle'>) {
  const fn = comp.params.kind === 'bar' ? comp.params.p.barFn : 'N';
  return (
    <svg width={w} height={BAR_H} viewBox={`0 0 ${w} ${BAR_H}`} className="block">
      <rect x={0.5} y={0.5} width={w - 1} height={BAR_H - 1} rx={3} fill="#2c323a" stroke="#535b66" />
      <rect x={3} y={4} width={w - 6} height={18} rx={2} fill={BAR_FILL[fn]} opacity={0.9} />
      {terminals.map((t) => (
        <Screw key={t.key} x={t.x} y={TERMINAL_Y_TOP} />
      ))}
      {showLabels &&
        terminals.map((t) => (
          <text key={`l-${t.key}`} x={t.x} y={34} textAnchor="middle" fontSize={7.5} fill="#cbd5e1" fontFamily="ui-monospace, monospace">
            {t.label}
          </text>
        ))}
      <text x={w / 2} y={49} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#e2e8f0" fontFamily="ui-monospace, monospace">
        {comp.label} · {fn}
      </text>
    </svg>
  );
}

/** Scaricatore di sovratensione: finestra verde = efficiente, rossa = sovratensione oltre Uc. */
function SpdSvg({ comp, width: w, terminals, showLabels, tripped }: Omit<Props, 'onToggle' | 'onTest'>) {
  if (comp.params.kind !== 'spd') return null;
  const p = comp.params.p;
  return (
    <svg width={w} height={DEVICE_H} viewBox={`0 0 ${w} ${DEVICE_H}`} className="block">
      <rect x={0.5} y={0.5} width={w - 1} height={DEVICE_H - 1} rx={3} fill="#e8e6dc" stroke={BODY_EDGE} />
      <rect x={1} y={1} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      <rect x={1} y={DEVICE_H - 28} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      {terminals.map((t) => (
        <Screw key={t.key} x={t.x} y={t.side === 'top' ? TERMINAL_Y_TOP : TERMINAL_Y_BOTTOM} />
      ))}
      {showLabels &&
        terminals.map((t) => (
          <text key={`l-${t.key}`} x={t.x} y={t.side === 'top' ? 37 : DEVICE_H - 33} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#39414b" fontFamily="ui-monospace, monospace">
            {t.label}
          </text>
        ))}
      <text x={w / 2} y={54} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1f2630" fontFamily="ui-sans-serif, system-ui">
        SPD
      </text>
      <text x={w / 2} y={65} textAnchor="middle" fontSize={7.5} fill="#4a525c" fontFamily="ui-sans-serif, system-ui">
        Tipo {p.spdType}
      </text>
      {/* simbolo del varistore */}
      <rect x={w / 2 - 7} y={70} width={14} height={24} fill="none" stroke="#1f2630" strokeWidth={1.4} />
      <line x1={w / 2 - 11} y1={96} x2={w / 2 + 11} y2={68} stroke="#1f2630" strokeWidth={1.2} />
      <text x={w / 2} y={106} textAnchor="middle" fontSize={7} fill="#4a525c" fontFamily="ui-sans-serif, system-ui">
        Uc {p.uc} V
      </text>
      <rect x={w / 2 - 8} y={110} width={16} height={6} rx={1} fill={tripped ? '#dc2626' : '#16a34a'} stroke="#3a4048" strokeWidth={0.5}>
        <title>{tripped ? 'Sovratensione oltre Uc' : 'Efficiente'}</title>
      </rect>
      <text x={w / 2} y={127} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1f2630" fontFamily="ui-monospace, monospace">
        {comp.label}
      </text>
    </svg>
  );
}

/**
 * Sezionatore portafusibili: ogni polo ha un cassetto apribile con la cartuccia 10,3×38.
 * Cassetto alto = chiuso; abbassato = aperto (sezionato, cartuccia sostituibile).
 * Spia rossa sul cassetto = cartuccia fusa.
 */
function FuseSvg({ comp, width: w, terminals, showLabels, onToggle }: Omit<Props, 'onTest' | 'tripped'>) {
  if (comp.params.kind !== 'fuse') return null;
  const p = comp.params.p;
  const poles = terminals.filter((t) => t.side === 'top');
  const pitch = w / Math.max(1, poles.length);
  const drop = comp.closed ? 0 : 12;
  return (
    <svg width={w} height={DEVICE_H} viewBox={`0 0 ${w} ${DEVICE_H}`} className="block">
      <rect x={0.5} y={0.5} width={w - 1} height={DEVICE_H - 1} rx={3} fill="#d9dce1" stroke={BODY_EDGE} />
      <rect x={1} y={1} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      <rect x={1} y={DEVICE_H - 28} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      {terminals.map((t) => (
        <Screw key={t.key} x={t.x} y={t.side === 'top' ? TERMINAL_Y_TOP : TERMINAL_Y_BOTTOM} />
      ))}
      {showLabels &&
        terminals.map((t) => (
          <text key={`l-${t.key}`} x={t.x} y={t.side === 'top' ? 37 : DEVICE_H - 33} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#39414b" fontFamily="ui-monospace, monospace">
            {t.label}
          </text>
        ))}
      {poles.map((t) => {
        const isN = t.fn === 'N';
        const blown = t.pole !== undefined && !!comp.blown?.includes(t.pole);
        const cx = t.x;
        const cw = pitch - 5;
        const y0 = 42 + drop;
        return (
          <g key={`c-${t.key}`} opacity={comp.closed ? 1 : 0.92}>
            {/* cassetto */}
            <rect x={cx - cw / 2} y={y0} width={cw} height={70} rx={2.5} fill={isN ? '#3f5b8f' : '#3a414b'} stroke="#15181c" strokeWidth={0.7} />
            <rect x={cx - cw / 2 + 2} y={y0 + 2} width={cw - 4} height={5} rx={1} fill="#59616c" />
            {isN ? (
              <text x={cx} y={y0 + 36} textAnchor="middle" fontSize={10} fontWeight={700} fill="#e2e8f0" fontFamily="ui-sans-serif, system-ui">
                N
              </text>
            ) : (
              <>
                {/* finestra con la cartuccia */}
                <rect x={cx - 4.5} y={y0 + 13} width={9} height={30} rx={2} fill={blown ? '#7f1d1d' : '#e5e7eb'} stroke="#111" strokeWidth={0.5} />
                <rect x={cx - 4.5} y={y0 + 13} width={9} height={4} fill="#9ca3af" />
                <rect x={cx - 4.5} y={y0 + 39} width={9} height={4} fill="#9ca3af" />
                <text x={cx} y={y0 + 54} textAnchor="middle" fontSize={cw < 14 ? 6 : 7} fontWeight={700} fill="#f1f5f9" fontFamily="ui-sans-serif, system-ui">
                  gG{p.in}
                </text>
                <circle cx={cx} cy={y0 + 63} r={2.6} fill={blown ? '#ef4444' : '#1f2937'} stroke="#000" strokeWidth={0.4}>
                  <title>{blown ? 'Cartuccia fusa' : 'Spia di fusione spenta'}</title>
                </circle>
              </>
            )}
          </g>
        );
      })}
      {onToggle && (
        <rect
          x={1}
          y={40}
          width={w - 2}
          height={86}
          fill="transparent"
          className="nodrag nopan cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <title>{comp.closed ? 'Clicca per aprire il portafusibili (sezionamento)' : 'Clicca per chiudere il portafusibili'}</title>
        </rect>
      )}
      <text x={w / 2} y={142} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1f2630" fontFamily="ui-monospace, monospace">
        {comp.label}
      </text>
    </svg>
  );
}

const fmtW = (w: number) => (Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2).replace('.', ',')} kW` : `${Math.round(w)} W`);
const fmtWh = (wh: number) => (wh >= 1000 ? `${(wh / 1000).toFixed(2).replace('.', ',')} kWh` : `${wh.toFixed(1).replace('.', ',')} Wh`);

/** Misuratore di energia: display con potenza istantanea ed energia nei due versi. */
function MeterSvg({ comp, width: w, terminals, showLabels, meter }: Omit<Props, 'onToggle' | 'onTest' | 'tripped'>) {
  if (comp.params.kind !== 'meter') return null;
  const p = meter?.p ?? 0;
  return (
    <svg width={w} height={DEVICE_H} viewBox={`0 0 ${w} ${DEVICE_H}`} className="block">
      <rect x={0.5} y={0.5} width={w - 1} height={DEVICE_H - 1} rx={3} fill="#e5e7eb" stroke={BODY_EDGE} />
      <rect x={1} y={1} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      <rect x={1} y={DEVICE_H - 28} width={w - 2} height={27} rx={2} fill={TERM_ZONE} />
      {terminals.map((t) => (
        <Screw key={t.key} x={t.x} y={t.side === 'top' ? TERMINAL_Y_TOP : TERMINAL_Y_BOTTOM} />
      ))}
      {showLabels &&
        terminals.map((t) => (
          <text key={`l-${t.key}`} x={t.x} y={t.side === 'top' ? 37 : DEVICE_H - 33} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#39414b" fontFamily="ui-monospace, monospace">
            {t.label}
          </text>
        ))}
      <text x={w / 2} y={50} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1f2630" fontFamily="ui-sans-serif, system-ui">
        kWh
      </text>
      <rect x={5} y={56} width={w - 10} height={46} rx={2} fill="#0d1a12" stroke="#334155" strokeWidth={0.6} />
      <text x={w / 2} y={70} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={p < -0.5 ? '#fbbf24' : '#6ee7b7'} fontFamily="ui-monospace, monospace">
        {meter ? (p < -0.5 ? '◄ ' : '► ') + fmtW(Math.abs(p)) : '—'}
      </text>
      <text x={w / 2} y={83} textAnchor="middle" fontSize={7} fill="#6ee7b7" fontFamily="ui-monospace, monospace">
        ► {fmtWh(meter?.fwd ?? 0)}
      </text>
      <text x={w / 2} y={95} textAnchor="middle" fontSize={7} fill="#fbbf24" fontFamily="ui-monospace, monospace">
        ◄ {fmtWh(meter?.rev ?? 0)}
      </text>
      <circle cx={w / 2} cy={112} r={3} fill={Math.abs(p) > 0.5 ? '#ef4444' : '#7f1d1d'}>
        <title>LED impulsi</title>
      </circle>
      <text x={w / 2} y={DEVICE_H - 42} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1f2630" fontFamily="ui-monospace, monospace">
        {comp.label}
      </text>
    </svg>
  );
}
