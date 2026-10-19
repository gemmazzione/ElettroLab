import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Ruler, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_NORM } from '../rules/context';
import { runRules, type NormReport } from '../rules/engine';
import { AREAS, STATUS_LABEL, type RuleStatus } from '../rules/types';
import { useStore } from '../store/projectStore';
import { NumberInput, Section } from './fields';

const STATUS_STYLE: Record<RuleStatus, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  conforme: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  errore: { icon: AlertOctagon, color: 'text-red-400', bg: 'bg-red-500/10' },
  attenzione: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  'dati-insufficienti': { icon: CircleHelp, color: 'text-violet-300', bg: 'bg-violet-500/10' },
  'verifica-campo': { icon: Ruler, color: 'text-sky-300', bg: 'bg-sky-500/10' },
};

const ORDER: RuleStatus[] = ['errore', 'attenzione', 'dati-insufficienti', 'verifica-campo', 'conforme'];

function Outcome({ o }: { o: NormReport['outcomes'][number] }) {
  const [open, setOpen] = useState(false);
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setRightTab);
  const st = STATUS_STYLE[o.status];
  const Icon = st.icon;
  return (
    <div className={`rounded-md border border-slate-800 ${st.bg}`}>
      <button className="flex w-full items-start gap-2 p-2 text-left" onClick={() => setOpen(!open)}>
        <Icon size={14} className={`mt-0.5 shrink-0 ${st.color}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-slate-400">
            {o.rule.title} · <span className="text-slate-300">{o.subject}</span>
          </div>
          <div className="text-[12px] leading-snug text-slate-100">{o.message}</div>
        </div>
        {open ? <ChevronDown size={13} className="mt-0.5 shrink-0 text-slate-500" /> : <ChevronRight size={13} className="mt-0.5 shrink-0 text-slate-500" />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-800 px-3 py-2 text-[11.5px] leading-snug">
          <div className={`font-semibold ${st.color}`}>{STATUS_LABEL[o.status]}</div>
          {o.details && (
            <ul className="list-disc space-y-0.5 pl-4 font-mono text-[10.5px] text-slate-300">
              {o.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {o.missingData && o.missingData.length > 0 && (
            <div className="text-violet-200">Dati mancanti: {o.missingData.join(', ')}.</div>
          )}
          <p className="text-slate-400">{o.rule.explanation}</p>
          <div className="space-y-0.5">
            {o.rule.refs.map((r) => (
              <div key={`${r.edition}-${r.article}`} className="flex gap-1.5 text-[10.5px]">
                <span className={r.verified ? 'text-emerald-400' : 'text-amber-300'}>{r.verified ? '✓' : '?'}</span>
                <span className="text-slate-300">
                  {r.edition}, art. {r.article}
                  {r.note ? <span className="text-slate-500"> — {r.note}</span> : null}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500">
            Regola {o.rule.id} v{o.rule.version} · Campo di applicazione: {o.rule.scope}
          </div>
          {o.componentIds[0] && (
            <button
              className="text-[11px] text-sky-300 hover:underline"
              onClick={() => {
                select({ type: 'component', id: o.componentIds[0]! });
                setTab('props');
              }}
            >
              Vai al componente
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Scenario della verifica della caduta di tensione: fattore di contemporaneità e utilizzatori accesi insieme. */
function SimultaneitySection() {
  const project = useStore((s) => s.project);
  const setNorm = useStore((s) => s.setNorm);
  const update = useStore((s) => s.updateParams);
  const commit = useStore((s) => s.commit);
  const k = project.norm?.simultaneity ?? 1;
  const loads = project.components.filter((c) => c.params.kind === 'load');
  const included = loads.filter((c) => c.params.kind === 'load' && c.params.p.designOn !== false);
  const totalW = included.reduce((a, c) => a + (c.params.kind === 'load' ? c.params.p.powerW : 0), 0);
  const setAll = (on: boolean) =>
    commit((p) => {
      for (const c of p.components) if (c.params.kind === 'load') c.params.p.designOn = on;
    });
  return (
    <Section title="Caduta di tensione: contemporaneità">
      <p className="text-[11px] leading-snug text-slate-400">
        Ogni utilizzatore è verificato alla sua potenza nominale; gli altri selezionati qui sotto sono considerati accesi insieme, alla potenza nominale moltiplicata per il fattore di contemporaneità.
      </p>
      <label className="block" title="1 = tutti alla potenza piena (caso più gravoso). Valore di progetto, da scegliere in base all'uso reale dell'impianto.">
        <span className="mb-1 block text-[11px] text-slate-400">Fattore di contemporaneità degli altri utilizzatori</span>
        <NumberInput value={Math.round(k * 100)} min={10} max={100} step={5} suffix="%" onChange={(v) => setNorm({ simultaneity: Math.min(1, Math.max(0.1, v / 100)) })} />
      </label>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Utilizzatori accesi insieme ({included.length}/{loads.length})</span>
        <span className="flex gap-2">
          <button className="text-sky-300 hover:underline" onClick={() => setAll(true)}>tutti</button>
          <button className="text-sky-300 hover:underline" onClick={() => setAll(false)}>nessuno</button>
        </span>
      </div>
      <div className="space-y-0.5">
        {loads.map((c) =>
          c.params.kind === 'load' ? (
            <label key={c.id} className="flex items-center gap-2 text-[12px] text-slate-300">
              <input
                type="checkbox"
                checked={c.params.p.designOn !== false}
                onChange={(e) => c.params.kind === 'load' && update(c.id, { kind: 'load', p: { ...c.params.p, designOn: e.target.checked } })}
              />
              <span className="min-w-0 flex-1 truncate">
                {c.label} · {c.params.p.name}
              </span>
              <span className="font-mono text-[10.5px] text-slate-500">{c.params.p.powerW} W</span>
            </label>
          ) : null,
        )}
      </div>
      <p className="font-mono text-[10.5px] text-slate-400">
        Potenza contemporanea degli altri ≈ {Math.round(totalW * k).toLocaleString('it-IT')} W (somma {totalW.toLocaleString('it-IT')} W × {Math.round(k * 100)}%)
      </p>
      <p className="text-[10.5px] leading-snug text-slate-500">
        Fattore e scelta degli utilizzatori sono ipotesi di progetto: indicale nella relazione. Con tutti accesi e fattore 100% il risultato è il caso più gravoso.
      </p>
    </Section>
  );
}

export function NormPanel() {
  const project = useStore((s) => s.project);
  const setNorm = useStore((s) => s.setNorm);
  const report = useMemo(() => runRules(project), [project]);
  const settings = { ...DEFAULT_NORM, ...(project.norm ?? {}) };
  const [filter, setFilter] = useState<RuleStatus | 'tutti'>('tutti');

  return (
    <>
      <Section title="Verifica normativa">
        <div className="rounded-md border border-amber-700/60 bg-amber-950/30 p-2.5 text-[11.5px] leading-snug text-amber-100">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldAlert size={14} /> {report.ruleset.title} · set v{report.ruleset.version}
          </div>
          {report.ruleset.note}
        </div>
        <p className={`text-[12px] font-semibold ${report.counts.errore ? 'text-red-300' : 'text-slate-200'}`}>{report.summary}</p>
        <div className="grid grid-cols-5 gap-1">
          {ORDER.map((s) => {
            const st = STATUS_STYLE[s];
            const Icon = st.icon;
            return (
              <button
                key={s}
                title={STATUS_LABEL[s]}
                onClick={() => setFilter(filter === s ? 'tutti' : s)}
                className={`flex flex-col items-center rounded-md py-1.5 ${filter === s ? 'ring-1 ring-sky-400' : ''} ${st.bg}`}
              >
                <Icon size={13} className={st.color} />
                <span className={`font-mono text-[14px] ${st.color}`}>{report.counts[s]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
          {ORDER.map((s) => (
            <span key={s} className={STATUS_STYLE[s].color}>
              ● {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Contesto dell'impianto">
        <label className="flex items-center gap-2 text-[12px] text-slate-300">
          <input type="checkbox" checked={settings.residential} onChange={(e) => setNorm({ residential: e.target.checked })} />
          Locali ad uso abitativo
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block" title="50 V in c.a. in condizioni ordinarie; valori inferiori per luoghi speciali (Parte 7)">
            <span className="mb-1 block text-[11px] text-slate-400">Tensione limite UL</span>
            <NumberInput value={settings.ul} min={6} max={50} suffix="V" onChange={(v) => setNorm({ ul: v })} />
          </label>
          <label className="block" title="Valore comunicato dal distributore al punto di consegna (opzionale)">
            <span className="mb-1 block text-[11px] text-slate-400">Icc dichiarata</span>
            <NumberInput value={settings.declaredIccKA ?? 0} min={0} max={50} step={0.5} suffix="kA" onChange={(v) => setNorm({ declaredIccKA: v > 0 ? v : null })} />
          </label>
        </div>
        <p className="text-[10.5px] text-slate-500">I dati di posa delle condutture si inseriscono selezionando ciascun utilizzatore; RA misurata nel dispersore.</p>
      </Section>

      <SimultaneitySection />

      <div className="space-y-4 p-4">
        {AREAS.map((area, i) => {
          const items = report.outcomes.filter((o) => o.rule.area === area && (filter === 'tutti' || o.status === filter));
          if (!items.length) return null;
          return (
            <div key={area}>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {i + 1}. {area}
              </h4>
              <div className="space-y-1.5">
                {[...items]
                  .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
                  .map((o, k) => (
                    <Outcome key={`${o.ruleId}-${o.subject}-${k}`} o={o} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
