import { transformerModel } from '../engine/netlist';
import type { ComponentInstance } from '../model/types';
import { useStore } from '../store/projectStore';
import { Field, NumberInput, Row, Section, Select } from './fields';
import { fmt } from './format';

/** Dati di targa del trasformatore e grandezze ricavate. */
export function TransformerEditor({ comp }: { comp: ComponentInstance }) {
  const update = useStore((s) => s.updateParams);
  if (comp.params.kind !== 'transformer') return null;
  const p = comp.params.p;
  const set = (patch: Partial<typeof p>) => update(comp.id, { kind: 'transformer', p: { ...p, ...patch } });
  const m = transformerModel(p);
  const i2n = p.sn / p.u2;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Potenza nominale">
          <NumberInput value={p.sn} min={4} max={2000} step={1} suffix="VA" onChange={(v) => set({ sn: v })} />
        </Field>
        <Field label="Tensione secondaria">
          <Select value={p.u2} options={[8, 12, 24, 48]} format={(v) => `${v} V~`} onChange={(v) => set({ u2: v })} />
        </Field>
        <Field label="Tensione di cortocircuito uk" hint="Percentuale della tensione nominale che fa circolare la corrente nominale con il secondario in corto">
          <NumberInput value={p.ukPct} min={2} max={60} step={0.5} suffix="%" onChange={(v) => set({ ukPct: v, ukrPct: Math.min(p.ukrPct, v) })} />
        </Field>
        <Field label="di cui resistiva ukr" hint="Perdite nel rame a pieno carico in percentuale della potenza nominale">
          <NumberInput value={p.ukrPct} min={0.5} max={p.ukPct} step={0.5} suffix="%" onChange={(v) => set({ ukrPct: v })} />
        </Field>
        <Field label="Assorbimento a vuoto">
          <NumberInput value={p.noLoadW} min={0} max={100} step={0.1} suffix="W" onChange={(v) => set({ noLoadW: v })} />
        </Field>
      </div>
      <Row k="Corrente nominale secondaria" v={`${fmt(i2n, 2)} A`} />
      <Row k="Corrente nominale primaria" v={`${fmt(p.sn / p.u1, 3)} A`} />
      <Row k="Tensione a vuoto" v={`${fmt(m.u20, 1)} V`} />
      <Row k="Corrente di cortocircuito al secondario" v={`circa ${fmt((i2n * 100) / p.ukPct, 1)} A`} />
      <p className="text-[10.5px] leading-snug text-slate-500">
        La tensione di targa è quella a pieno carico: a vuoto il secondario dà qualche volt in più. Con un uk alto il trasformatore sopporta il cortocircuito del secondario,
        ma la tensione cala di più quando il carico aumenta.
      </p>
    </>
  );
}

/** Punto di lavoro durante la simulazione. */
export function TransformerLive({ comp }: { comp: ComponentInstance }) {
  const t = useStore((s) => (s.result && s.result.ok ? s.result.transformers.get(comp.id) : undefined));
  if (comp.params.kind !== 'transformer') return null;
  return (
    <Section title="Funzionamento">
      {!t || t.v1 < 1 ? (
        <p className="text-[11.5px] text-slate-400">Primario non alimentato: il secondario è senza tensione.</p>
      ) : (
        <>
          <Row k="Tensione primaria" v={`${fmt(t.v1, 1)} V`} />
          <Row k="Tensione secondaria" v={`${fmt(t.v2, 2)} V`} />
          <Row k="Corrente secondaria" v={`${fmt(t.i2, 2)} A`} />
          <Row k="Corrente primaria (carico)" v={`${fmt(t.i1, 3)} A`} />
          <Row k="Potenza erogata" v={`${fmt(t.s2, 1)} VA`} />
          <div className="mt-1 h-2 rounded bg-slate-800" title="Carico rispetto alla potenza nominale">
            <div className={`h-full rounded ${t.loadingPct > 100 ? 'bg-red-500' : t.loadingPct > 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, t.loadingPct)}%` }} />
          </div>
          <Row k="Carico" v={`${fmt(t.loadingPct, 0)} %`} />
        </>
      )}
    </Section>
  );
}
