import { CheckCircle2, CircleHelp, XCircle, Zap } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { deviceShortCircuit, loadEndFaultCurrents } from '../engine/measure';
import { analyzeCircuits } from '../graph/netGraph';
import { FAULT_INFO, loadFaultsFor } from '../model/faults';
import { isThreePhaseLoad, loadHasNeutral } from '../model/terminals';
import type { ComponentInstance, Wire } from '../model/types';
import { H_TRIP, MAGNETIC_BAND, magneticZone, residualTripTime, residualZone, thermalTripTime } from '../protection/curves';
import { useStore } from '../store/projectStore';
import { NumberInput, Row, Section } from './fields';
import { fmt, fmtCurrent } from './format';

type Verdict = 'ok' | 'ko' | 'incerto';

function Outcome({ v, children }: { v: Verdict; children: ReactNode }) {
  const Icon = v === 'ok' ? CheckCircle2 : v === 'ko' ? XCircle : CircleHelp;
  const color = v === 'ok' ? 'text-emerald-400' : v === 'ko' ? 'text-red-400' : 'text-amber-300';
  return (
    <div className="flex gap-2 rounded-md bg-slate-950/60 p-2 text-[11.5px] leading-snug text-slate-300">
      <Icon size={14} className={`mt-0.5 shrink-0 ${color}`} />
      <div>{children}</div>
    </div>
  );
}

const fkA = (a: number) => (a >= 1000 ? `${fmt(a / 1000, 2)} kA` : `${fmt(a, 0)} A`);

const TRIP_TEXT = {
  termico: 'intervenuto per sovraccarico (termico)',
  magnetico: 'intervenuto per cortocircuito (magnetico)',
  differenziale: 'intervenuto per corrente differenziale',
  prova: 'aperto con il pulsante di prova',
} as const;

/** Stato e calcoli di protezione di un dispositivo. */
export function ProtectionSection({ comp }: { comp: ComponentInstance }) {
  const project = useStore((s) => s.project);
  const st = useStore((s) => s.prot[comp.id]);
  const running = useStore((s) => s.running);
  const pr = comp.params;
  const ik = useMemo(() => deviceShortCircuit(project, comp), [project, comp]);
  if (pr.kind !== 'mcb' && pr.kind !== 'rcbo' && pr.kind !== 'rcd' && pr.kind !== 'switch') return null;
  const overcurrent = pr.kind === 'mcb' || pr.kind === 'rcbo';

  return (
    <Section title="Protezione e cortocircuito">
      {st?.tripped && (
        <div className="rounded-md bg-amber-500/15 px-2 py-1.5 text-[12px] font-semibold text-amber-300 ring-1 ring-amber-500/40">
          Dispositivo {TRIP_TEXT[st.tripped]}. Elimina la causa e richiudi la leva.
        </div>
      )}
      {overcurrent && running && (
        <Row k="Stato termico" v={`${fmt(Math.min(999, ((st?.heat ?? 0) / H_TRIP) * 100), 0)} % della soglia`} />
      )}
      {overcurrent && (
        <Row
          k="Soglia magnetica (curva)"
          v={`${MAGNETIC_BAND[pr.p.curve][0]}–${MAGNETIC_BAND[pr.p.curve][1]}·In = ${MAGNETIC_BAND[pr.p.curve][0] * pr.p.in}–${MAGNETIC_BAND[pr.p.curve][1] * pr.p.in} A`}
        />
      )}
      {ik === null ? (
        <p className="text-[11.5px] text-slate-500">
          Icc presunta non calcolabile: il dispositivo non è collegato alla fornitura.
        </p>
      ) : (
        <>
          <Row k="Icc presunta massima ai morsetti di valle" v={fkA(ik)} />
          {overcurrent ? (
            ik <= pr.p.icn * 1000 ? (
              <Outcome v="ok">
                Icc {fkA(ik)} ≤ Icn {fmt(pr.p.icn, 1)} kA: il dispositivo può interrompere la corrente di cortocircuito massima calcolata in questo punto.
              </Outcome>
            ) : (
              <Outcome v="incerto">
                Icc {fkA(ik)} &gt; Icn {fmt(pr.p.icn, 1)} kA: non calcolabile senza dati del costruttore. Serve una protezione di back-up a monte dichiarata dal costruttore (tabelle di coordinamento), oppure un dispositivo con Icn maggiore.
              </Outcome>
            )
          ) : (
            <Outcome v="incerto">
              Questo dispositivo non ha sganciatori di sovracorrente: la sua tenuta al cortocircuito (Icw / Inc condizionale) va verificata con i dati del costruttore insieme alla protezione a monte.
            </Outcome>
          )}
        </>
      )}
    </Section>
  );
}

/** Guasti inseribili su una linea utilizzatrice. */
export function LoadFaultSection({ comp }: { comp: ComponentInstance }) {
  const faults = useStore((s) => s.project.faults);
  const toggle = useStore((s) => s.toggleFault);
  const setR = useStore((s) => s.setFaultResistance);
  const own = (faults ?? []).filter((f) => f.targetId === comp.id && !f.hidden);
  const types = loadFaultsFor(isThreePhaseLoad(comp), loadHasNeutral(comp));
  return (
    <Section title="Simulazione guasti sulla linea">
      <div className="space-y-1.5">
        {types.map((type) => {
          const f = own.find((x) => x.type === type);
          const info = FAULT_INFO[type];
          return (
            <div key={type} className={`rounded-md border p-2 ${f ? 'border-red-700 bg-red-950/40' : 'border-slate-800'}`}>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-200" title={info.description}>
                <input type="checkbox" checked={!!f} onChange={() => toggle(type, comp.id)} />
                {f && <Zap size={12} className="text-red-400" />}
                {info.label}
              </label>
              {f && (
                <>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">{info.description}</p>
                  {info.resistive && (
                    <div className="mt-1.5">
                      <span className="mb-1 block text-[11px] text-slate-400">Resistenza di guasto Rf</span>
                      <NumberInput value={f.resistance} min={0} max={1e6} step={1} suffix="Ω" onChange={(v) => setR(f.id, v)} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Correnti di guasto presunte a fondo linea e confronto con le protezioni a monte. */
export function LoadFaultCurrents({ comp }: { comp: ComponentInstance }) {
  const project = useStore((s) => s.project);
  const data = useMemo(() => {
    const currents = loadEndFaultCurrents(project, comp.id);
    const circuit = analyzeCircuits(project).find((c) => c.loadId === comp.id);
    const devs = (circuit?.lDevices ?? []).map((id) => project.components.find((c) => c.id === id)!);
    const ocp = [...devs].reverse().find((d) => d.params.kind === 'mcb' || d.params.kind === 'rcbo');
    const rcd = [...devs].reverse().find((d) => d.params.kind === 'rcd' || d.params.kind === 'rcbo');
    return { currents, ocp, rcd };
  }, [project, comp.id]);
  const { currents, ocp, rcd } = data;

  let shortVerdict: ReactNode = null;
  if (currents.ln !== null && ocp && (ocp.params.kind === 'mcb' || ocp.params.kind === 'rcbo')) {
    const p = ocp.params.p;
    const ratio = currents.ln / p.in;
    const zone = magneticZone(ratio, p.curve);
    const tt = thermalTripTime(0, ratio);
    shortVerdict =
      zone === 'certa' ? (
        <Outcome v="ok">
          {ocp.label} ({p.curve}
          {p.in}): {fkA(currents.ln)} = {fmt(ratio, 1)}·In ≥ {MAGNETIC_BAND[p.curve][1]}·In → intervento magnetico certo per cortocircuito a fondo linea.
        </Outcome>
      ) : zone === 'incerta' ? (
        <Outcome v="incerto">
          {ocp.label}: {fmt(ratio, 1)}·In cade nella fascia magnetica {MAGNETIC_BAND[p.curve][0]}–{MAGNETIC_BAND[p.curve][1]}·In: intervento istantaneo non garantito (dati del costruttore). Con il solo termico: circa {fmt(tt, 1)} s.
        </Outcome>
      ) : (
        <Outcome v="ko">
          {ocp.label}: {fmt(ratio, 1)}·In è sotto la soglia magnetica: il cortocircuito a fondo linea verrebbe eliminato solo dal termico{Number.isFinite(tt) ? ` in circa ${fmt(tt, 0)} s` : ''}. Linea troppo lunga o sezione troppo piccola per questa protezione.
        </Outcome>
      );
  } else if (currents.ln !== null) {
    shortVerdict = <Outcome v="ko">Nessun magnetotermico sulla fase a monte: il cortocircuito non verrebbe interrotto.</Outcome>;
  }

  let earthVerdict: ReactNode = null;
  if (currents.lpe !== null && rcd && (rcd.params.kind === 'rcd' || rcd.params.kind === 'rcbo')) {
    const idn = rcd.params.p.idn / 1000;
    const zone = residualZone(currents.lpe, idn);
    const sel = rcd.params.kind === 'rcd' && rcd.params.p.selective;
    earthVerdict =
      zone === 'certa' ? (
        <Outcome v="ok">
          {rcd.label} (IΔn {rcd.params.p.idn} mA): guasto franco a massa {fmtCurrent(currents.lpe)} = {fmt(currents.lpe / idn, 0)}·IΔn → intervento entro {fmt(residualTripTime(currents.lpe, idn, sel) * 1000, 0)} ms (tempo massimo di norma).
        </Outcome>
      ) : (
        <Outcome v="ko">
          {rcd.label}: la corrente di guasto a massa ({fmtCurrent(currents.lpe)}) non garantisce l'intervento (IΔn {rcd.params.p.idn} mA).
        </Outcome>
      );
  } else if (currents.lpe !== null) {
    earthVerdict = (
      <Outcome v="ko">Nessun differenziale a monte: in un sistema TT la corrente di guasto a terra ({fmtCurrent(currents.lpe)}) è in genere troppo bassa per far intervenire un magnetotermico.</Outcome>
    );
  } else {
    earthVerdict = <Outcome v="ko">Massa non collegata a terra: un guasto a massa non produrrebbe corrente di guasto e la massa resterebbe in tensione.</Outcome>;
  }

  return (
    <Section title="Correnti di guasto presunte">
      {currents.ln === null ? (
        <p className="text-[12px] text-slate-500">Linea non collegata alla fornitura: correnti di guasto non calcolabili.</p>
      ) : (
        <>
          <Row k="Icc L-N a fondo linea" v={fkA(currents.ln)} />
          <Row k="Guasto franco L-PE (TT)" v={currents.lpe === null ? '—' : fmtCurrent(currents.lpe)} />
          {shortVerdict}
          {earthVerdict}
          <p className="text-[10.5px] leading-snug text-slate-500">
            Calcolo con guasto franco, protezioni chiuse e utilizzatori spenti. Risultato di calcolo sul modello, non verifica di conformità.
          </p>
        </>
      )}
    </Section>
  );
}

/** Interruzione di un conduttore del quadro. */
export function WireFaultToggle({ wire }: { wire: Wire }) {
  const broken = useStore((s) => (s.project.faults ?? []).some((f) => f.type === 'open-wire' && f.targetId === wire.id && !f.hidden));
  const toggle = useStore((s) => s.toggleFault);
  return (
    <Section title="Simulazione guasti">
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-200" title={FAULT_INFO['open-wire'].description}>
        <input type="checkbox" checked={broken} onChange={() => toggle('open-wire', wire.id)} />
        Conduttore interrotto (morsetto allentato / filo tranciato)
      </label>
    </Section>
  );
}

/** Riepilogo dei guasti attivi nel progetto. */
export function ActiveFaults() {
  const project = useStore((s) => s.project);
  const toggle = useStore((s) => s.toggleFault);
  const clear = useStore((s) => s.clearFaults);
  const select = useStore((s) => s.select);
  const faults = (project.faults ?? []).filter((f) => !f.hidden);
  return (
    <Section title={`Guasti attivi (${faults.length})`}>
      {faults.length === 0 ? (
        <p className="text-[11.5px] leading-snug text-slate-500">
          Nessun guasto. Seleziona un utilizzatore per inserire cortocircuiti, guasti a massa, contatti fase-terra o interruzioni; seleziona un conduttore per interromperlo.
        </p>
      ) : (
        <>
          {faults.map((f) => {
            const c = project.components.find((x) => x.id === f.targetId);
            const target = c ? c.label : 'conduttore';
            return (
              <div key={f.id} className="flex items-center gap-2 text-[12px]">
                <Zap size={12} className="shrink-0 text-red-400" />
                <button
                  className="min-w-0 flex-1 truncate text-left text-slate-200 hover:underline"
                  onClick={() => select(c ? { type: 'component', id: c.id } : { type: 'wire', id: f.targetId })}
                >
                  {FAULT_INFO[f.type].label} — {target}
                  {FAULT_INFO[f.type].resistive ? ` (Rf ${fmt(f.resistance, f.resistance < 10 ? 2 : 0)} Ω)` : ''}
                </button>
                <button className="text-slate-500 hover:text-red-300" onClick={() => toggle(f.type, f.targetId)}>
                  rimuovi
                </button>
              </div>
            );
          })}
          <button onClick={clear} className="w-full rounded-md border border-slate-700 py-1 text-[12px] text-slate-300 hover:bg-slate-800">
            Rimuovi tutti i guasti
          </button>
        </>
      )}
    </Section>
  );
}
