import { ampacity, AMPACITY_SOURCE, INSTALL_METHODS, type InstallMethod } from '../rules/ampacity';
import type { CableInstall, ComponentInstance } from '../model/types';
import { useStore } from '../store/projectStore';
import { Field, NumberInput, Row, Section, Select } from './fields';
import { fmt } from './format';

const DEFAULT_INSTALL: CableInstall = { method: 'B1', insulation: 'PVC', ambientC: 30, grouped: 1 };

/** Dati della conduttura richiesti dalla verifica di dimensionamento. */
export function InstallSection({ comp }: { comp: ComponentInstance }) {
  const update = useStore((s) => s.updateParams);
  if (comp.params.kind !== 'load') return null;
  const p = comp.params.p;
  const inst = p.install;
  const set = (patch: Partial<CableInstall> | null) =>
    update(comp.id, { kind: 'load', p: { ...p, install: patch === null ? undefined : { ...(inst ?? DEFAULT_INSTALL), ...patch } } });
  const calc = inst ? ampacity(p.cableSection, inst.method, inst.insulation, inst.ambientC, inst.grouped) : null;
  const hasSockets = p.hasSockets ?? p.category === 'prese';

  return (
    <Section title="Conduttura: dati per le verifiche">
      {!inst ? (
        <div className="space-y-2">
          <p className="text-[11.5px] leading-snug text-violet-200">
            Dati di posa non inseriti: la verifica Ib ≤ In ≤ Iz risulta «dati insufficienti». La portata non dipende solo dalla sezione.
          </p>
          <button onClick={() => set({})} className="w-full rounded-md border border-slate-700 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800">
            Inserisci i dati di posa
          </button>
        </div>
      ) : (
        <>
          <Field label="Metodo di installazione">
            <Select
              value={inst.method}
              options={INSTALL_METHODS.map((m) => m.id)}
              format={(m: InstallMethod) => INSTALL_METHODS.find((x) => x.id === m)!.label}
              onChange={(m) => set({ method: m })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Isolante">
              <Select value={inst.insulation} options={['PVC', 'EPR'] as const} format={(v) => (v === 'PVC' ? 'PVC (70 °C)' : 'EPR/XLPE (90 °C)')} onChange={(v) => set({ insulation: v })} />
            </Field>
            <Field label="Temperatura ambiente">
              <NumberInput value={inst.ambientC} min={10} max={60} step={5} suffix="°C" onChange={(v) => set({ ambientC: v })} />
            </Field>
            <Field label="Circuiti raggruppati">
              <NumberInput value={inst.grouped} min={1} max={20} onChange={(v) => set({ grouped: Math.round(v) })} />
            </Field>
            <Field label="Iz da tabella/costruttore" hint="Se inserita, sostituisce il calcolo">
              <NumberInput value={inst.izOverride ?? 0} min={0} max={500} step={0.5} suffix="A" onChange={(v) => set({ izOverride: v > 0 ? v : null })} />
            </Field>
          </div>
          {inst.izOverride ? (
            <Row k="Portata Iz (utente)" v={`${fmt(inst.izOverride, 1)} A`} />
          ) : calc ? (
            <>
              <Row k="I0 (tabella)" v={`${fmt(calc.i0, 1)} A`} />
              <Row k="k1 temperatura · k2 raggruppamento" v={`${fmt(calc.k1, 2)} · ${fmt(calc.k2, 2)}`} />
              <Row k="Portata Iz" v={`${fmt(calc.iz, 1)} A`} />
              <p className="text-[10.5px] leading-snug text-slate-500">{AMPACITY_SOURCE}</p>
            </>
          ) : (
            <p className="text-[11px] text-amber-300">Temperatura fuori dai valori tabellati.</p>
          )}
          <button onClick={() => set(null)} className="text-[11px] text-slate-500 hover:text-slate-300">
            Rimuovi i dati di posa
          </button>
        </>
      )}
      <Row
        k={`Corrente d'impiego IB = P / (${p.phases === 3 ? '3 × ' : ''}230 V${(p.cosPhi ?? 1) < 1 ? ' × cos φ' : ''})`}
        v={`${fmt(p.powerW / (230 * (p.phases === 3 ? 3 : 1) * (p.cosPhi ?? 1)), 2)} A`}
      />
      <label className="flex items-center gap-2 text-[12px] text-slate-300">
        <input type="checkbox" checked={hasSockets} onChange={(e) => update(comp.id, { kind: 'load', p: { ...p, hasSockets: e.target.checked } })} />
        Il circuito alimenta prese a spina
      </label>
      {hasSockets && (
        <Field label="Corrente nominale delle prese">
          <Select value={p.socketRating ?? 16} options={[10, 16, 20, 32]} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'load', p: { ...p, socketRating: v } })} />
        </Field>
      )}
    </Section>
  );
}
