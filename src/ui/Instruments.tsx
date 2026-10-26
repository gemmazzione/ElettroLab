import { Panel } from '@xyflow/react';
import { Volume2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { insulationResistance, loopImpedance, rcdTest } from '../engine/verify';
import { clampReading, dcVoltageBetween, resistanceBetween, voltageBetween } from '../engine/measure';
import { getTerminals, parseTerminalId } from '../model/terminals';
import type { Project } from '../model/types';
import { useStore, type MeterMode } from '../store/projectStore';
import { fmt } from './format';

/** Soglia di continuità (cicalino) del multimetro [Ω] */
const CONTINUITY_OHM = 2;

function terminalName(project: Project, tid: string | undefined): string {
  if (!tid) return '— (clic su un morsetto)';
  const { componentId, key } = parseTerminalId(tid);
  const c = project.components.find((x) => x.id === componentId);
  const t = c ? getTerminals(c).find((x) => x.key === key) : undefined;
  return c && t ? `${c.label} · ${t.label} (${t.fn})` : tid;
}

function Lcd({ value, unit, note, beep }: { value: string; unit: string; note?: ReactNode; beep?: boolean }) {
  return (
    <div className="rounded-md border-4 border-slate-800 bg-[#b9c7a5] px-3 py-2 shadow-inner">
      <div className="flex items-baseline justify-end gap-1.5 font-mono text-[#1d2618]">
        {beep && <Volume2 size={14} className="mr-auto self-center" />}
        <span className="text-[28px] font-bold leading-8 tracking-wider">{value}</span>
        <span className="text-[13px] font-semibold">{unit}</span>
      </div>
      {note && <div className="mt-0.5 text-right text-[9.5px] leading-tight text-[#3b4a32]">{note}</div>}
    </div>
  );
}

function formatOhm(r: number): { value: string; unit: string } {
  if (!Number.isFinite(r)) return { value: 'OL', unit: 'Ω' };
  if (r >= 1e6) return { value: fmt(r / 1e6, 2), unit: 'MΩ' };
  if (r >= 1e3) return { value: fmt(r / 1e3, 2), unit: 'kΩ' };
  if (r < 1) return { value: fmt(r * 1000, 1), unit: 'mΩ' };
  return { value: fmt(r, 2), unit: 'Ω' };
}

function Multimeter() {
  const project = useStore((s) => s.project);
  const result = useStore((s) => s.result);
  const running = useStore((s) => s.running);
  const mode = useStore((s) => s.meterMode);
  const setMode = useStore((s) => s.setMeterMode);
  const probes = useStore((s) => s.probes);
  const clear = useStore((s) => s.clearProbes);
  const both = !!probes.red && !!probes.black;

  const resistance = useMemo(
    () => (both && !running && (mode === 'R' || mode === 'continuity') ? resistanceBetween(project, probes.red!, probes.black!) : null),
    [both, running, mode, project, probes.red, probes.black],
  );

  let display: ReactNode;
  if (!both) display = <Lcd value="----" unit={mode === 'V' ? 'V~' : mode === 'Vdc' ? 'V⎓' : 'Ω'} note="Appoggia i due puntali su due morsetti" />;
  else if (mode === 'Vdc') {
    const v = dcVoltageBetween(project, probes.red!, probes.black!, running ? result : null);
    display =
      v === null ? (
        <Lcd value="---" unit="V⎓" note="I puntali non sono ai capi di un generatore fotovoltaico" />
      ) : (
        <Lcd value={fmt(v, 1)} unit="V⎓" note={v < -0.5 ? 'Valore negativo: il puntale rosso è sul negativo (polarità invertita)' : 'Con la luce i moduli sono in tensione anche a impianto spento'} />
      );
  } else if (mode === 'V') {
    if (!running) display = <Lcd value={fmt(0, 1)} unit="V~" note="Impianto disalimentato" />;
    else if (!result || !result.ok) display = <Lcd value="Err" unit="V~" note="Circuito non risolvibile" />;
    else {
      const v = voltageBetween(result, probes.red!, probes.black!);
      display =
        v === null ? (
          <Lcd value="---" unit="V~" note="Un puntale tocca un punto isolato: potenziale non definito dal modello" />
        ) : (
          <Lcd value={fmt(v, 1)} unit="V~" />
        );
    }
  } else if (running) {
    display = <Lcd value="Err" unit="Ω" note="Misura vietata su circuito in tensione: interrompi la simulazione (disalimenta)" />;
  } else {
    const r = resistance ?? Infinity;
    const f = formatOhm(r);
    display = (
      <Lcd
        value={f.value}
        unit={f.unit}
        beep={mode === 'continuity' && r < CONTINUITY_OHM}
        note={mode === 'continuity' ? (r < CONTINUITY_OHM ? 'Continuità' : 'Nessuna continuità') : 'Impianto disalimentato e scollegato dalla rete'}
      />
    );
  }

  const modes: { m: MeterMode; label: string; title: string }[] = [
    { m: 'V', label: 'V~', title: 'Tensione alternata' },
    { m: 'Vdc', label: 'V⎓', title: 'Tensione continua (lato DC del fotovoltaico)' },
    { m: 'R', label: 'Ω', title: 'Resistenza (solo a impianto disalimentato)' },
    { m: 'continuity', label: '·)))', title: 'Continuità (solo a impianto disalimentato)' },
  ];

  return (
    <div className="w-[270px] rounded-xl border-2 border-amber-500/80 bg-[#2b2f36] p-3 shadow-2xl">
      <div className="mb-2 flex items-center text-[11px] font-bold uppercase tracking-wider text-amber-300">
        Multimetro digitale
        <button className="ml-auto text-slate-400 hover:text-white" title="Togli i puntali" onClick={clear}>
          <X size={14} />
        </button>
      </div>
      {display}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {modes.map((x) => (
          <button
            key={x.m}
            title={x.title}
            onClick={() => setMode(x.m)}
            className={`rounded py-1 font-mono text-[12px] font-bold ${mode === x.m ? 'bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="text-slate-300">{terminalName(project, probes.red)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-950 ring-1 ring-slate-400" />
          <span className="text-slate-300">{terminalName(project, probes.black)}</span>
        </div>
      </div>
    </div>
  );
}

function Clamp() {
  const project = useStore((s) => s.project);
  const result = useStore((s) => s.result);
  const running = useStore((s) => s.running);
  const target = useStore((s) => s.clampTarget);
  let label = 'Clic su un conduttore, oppure su un utilizzatore per abbracciare L+N della linea';
  if (target?.kind === 'wire') {
    const w = project.wires.find((x) => x.id === target.id);
    if (w) label = `Conduttore ${w.conductor}: ${terminalName(project, w.from)} → ${terminalName(project, w.to)}`;
  } else if (target?.kind === 'line') {
    const c = project.components.find((x) => x.id === target.id);
    if (c && c.params.kind === 'load') label = `Linea ${c.label} (${c.params.p.name}): L + N insieme`;
  }
  let display: ReactNode;
  if (!target) display = <Lcd value="----" unit="A~" />;
  else if (!running || !result || !result.ok) display = <Lcd value={fmt(0, 2)} unit="A~" note="Impianto disalimentato" />;
  else {
    const i = clampReading(result, target);
    display =
      i < 1 ? (
        <Lcd value={fmt(i * 1000, 1)} unit="mA~" note={target.kind === 'line' ? 'Somma vettoriale L+N = corrente di dispersione' : undefined} />
      ) : (
        <Lcd value={fmt(i, 2)} unit="A~" note={target.kind === 'line' ? 'Somma vettoriale L+N = corrente di dispersione' : undefined} />
      );
  }
  return (
    <div className="w-[270px] rounded-xl border-2 border-yellow-400/80 bg-[#2b2f36] p-3 shadow-2xl">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-yellow-300">Pinza amperometrica</div>
      {display}
      <div className="mt-2 text-[11px] leading-snug text-slate-300">{label}</div>
      <div className="mt-1 text-[10px] leading-snug text-slate-500">
        Su un solo conduttore la pinza legge la corrente di esercizio; su fase e neutro insieme le correnti si compensano e resta solo la dispersione verso terra.
      </div>
    </div>
  );
}

export function Instruments() {
  const tool = useStore((s) => s.tool);
  if (tool === 'select') return null;
  return <Panel position="top-left">{tool === 'multimeter' ? <Multimeter /> : tool === 'tester' ? <Tester /> : <Clamp />}</Panel>;
}

/** Verificatore multifunzione per le verifiche iniziali, sulla linea dell'utilizzatore scelto. */
function Tester() {
  const project = useStore((s) => s.project);
  const running = useStore((s) => s.running);
  const target = useStore((s) => s.testerTarget);
  const runTest = useStore((s) => s.instrumentRcdTest);
  const [mode, setMode] = useState<'iso' | 'loop' | 'rcd'>('iso');
  const load = target ? project.components.find((c) => c.id === target) : undefined;
  const iso = useMemo(() => (load && mode === 'iso' && !running ? insulationResistance(project, load.id) : null), [project, load, mode, running]);
  const loop = useMemo(() => (load && mode === 'loop' ? loopImpedance(project, load.id) : null), [project, load, mode]);
  const rcd = useMemo(() => (load && mode === 'rcd' ? rcdTest(project, load.id) : null), [project, load, mode]);
  const fmtR = (r: number) => (!Number.isFinite(r) || r > 999e6 ? { value: '>999', unit: 'MΩ' } : r >= 1e6 ? { value: fmt(r / 1e6, 2), unit: 'MΩ' } : r >= 1e3 ? { value: fmt(r / 1e3, 1), unit: 'kΩ' } : { value: fmt(r, 1), unit: 'Ω' });

  let display: ReactNode;
  if (!load || load.params.kind !== 'load') display = <Lcd value="----" unit="" note="Clic su un utilizzatore: le prove si fanno sulla sua linea" />;
  else if (mode === 'iso') {
    if (running) display = <Lcd value="Err" unit="MΩ" note="Misura d'isolamento solo a impianto disalimentato: interrompi la simulazione" />;
    else {
      const f = fmtR(iso ?? Infinity);
      display = <Lcd value={f.value} unit={f.unit} note="500 V⎓ tra conduttori attivi e PE, apparecchi scollegati" />;
    }
  } else if (mode === 'loop') {
    display = loop?.zLpe ? (
      <Lcd value={fmt(loop.zLpe, loop.zLpe < 10 ? 2 : 1)} unit="Ω" note={`Anello di guasto L-PE · Ik ≈ ${fmt(loop.ikLpe ?? 0, 2)} A`} />
    ) : (
      <Lcd value="---" unit="Ω" note="Linea non collegata alla fornitura o massa senza PE" />
    );
  } else {
    display = rcd?.rcd ? (
      <Lcd value={`${rcd.idnMa}`} unit="mA" note={`${rcd.rcd.label}${rcd.selective ? ' (selettivo)' : ''} · Ut = RA·IΔn ≈ ${rcd.ut !== null ? fmt(rcd.ut, 1) : '—'} V`} />
    ) : (
      <Lcd value="---" unit="mA" note="Nessun differenziale a monte di questa linea" />
    );
  }

  const modes: { m: typeof mode; label: string; title: string }[] = [
    { m: 'iso', label: 'RISO', title: "Resistenza d'isolamento (impianto disalimentato)" },
    { m: 'loop', label: 'ZS', title: "Impedenza dell'anello di guasto" },
    { m: 'rcd', label: 'RCD', title: 'Prova del differenziale' },
  ];
  return (
    <div className="w-[300px] rounded-xl border-2 border-sky-500/70 bg-[#2b2f36] p-3 shadow-2xl">
      <div className="mb-2 flex items-center text-[11px] font-bold uppercase tracking-wider text-sky-300">
        Verificatore multifunzione
      </div>
      {load && <div className="mb-1 truncate text-[11px] text-slate-300">Linea di {load.label}{load.params.kind === 'load' ? ` · ${load.params.p.name}` : ''}</div>}
      {display}
      <div className="mt-2 grid grid-cols-3 gap-1">
        {modes.map((x) => (
          <button
            key={x.m}
            title={x.title}
            onClick={() => setMode(x.m)}
            className={`rounded py-1 font-mono text-[12px] font-bold ${mode === x.m ? 'bg-sky-400 text-slate-900' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {mode === 'loop' && loop && (
        <div className="mt-2 space-y-0.5 font-mono text-[10.5px] text-slate-300">
          <div>Anello L-N: {loop.zLn ? `${fmt(loop.zLn, 3)} Ω · Icc min ≈ ${loop.ikLn! >= 1000 ? `${fmt(loop.ikLn! / 1000, 2)} kA` : `${fmt(loop.ikLn!, 0)} A`}` : '—'}</div>
          <div className="text-slate-400">Nel sistema TT l'anello L-PE comprende le resistenze di terra (RA e RB): la corrente di guasto è di pochi ampere, per questo serve il differenziale.</div>
        </div>
      )}
      {mode === 'rcd' && rcd?.rcd && (
        <div className="mt-2 space-y-1">
          <table className="w-full font-mono text-[10.5px] text-slate-300">
            <tbody>
              {rcd.rows.map((r) => (
                <tr key={r.mult}>
                  <td className="pr-2">{fmt(r.mult, r.mult < 1 ? 1 : 0)}·IΔn</td>
                  <td className="pr-2">{fmt(r.currentMa, 0)} mA</td>
                  <td className={r.outcome === 'interviene' ? 'text-emerald-300' : r.outcome === 'incerto' ? 'text-amber-300' : 'text-slate-400'}>
                    {r.outcome}
                    {r.timeS !== null ? ` ≤ ${fmt(r.timeS * 1000, 0)} ms` : ''}
                  </td>
                  <td>
                    <button
                      className="rounded bg-slate-700 px-1.5 text-[10px] text-slate-100 hover:bg-slate-600 disabled:opacity-40"
                      disabled={!running}
                      title={running ? 'Esegue la prova sull\'impianto simulato' : 'Avvia la simulazione per eseguire la prova'}
                      onClick={() => runTest(load!.id, r.mult)}
                    >
                      prova
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] leading-snug text-slate-400">Tempi: massimi della norma di prodotto usati dal modello. La prova verifica l'intervento; l'efficacia della protezione richiede anche la misura del dispersore.</p>
        </div>
      )}
    </div>
  );
}
