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
