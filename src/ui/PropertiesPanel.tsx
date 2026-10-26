import { AlertOctagon, AlertTriangle, Info, Minus, Plus, Trash2 } from 'lucide-react';
import { abs, sub } from '../engine/complex';
import { loadBranchImpedance, wireResistance } from '../engine/netlist';
import { deviceCurrent } from '../engine/simulate';
import { issuesFor, type Issue } from '../graph/erc';
import { analyzeCircuits } from '../graph/netGraph';
import {
  catalogItem,
  CONTRACT_KW,
  CURVES,
  ICN_VALUES,
  IDN_VALUES,
  IN_VALUES_FUSE,
  IN_VALUES_MCB,
  IN_VALUES_RCBO,
  IN_VALUES_RCD,
  IN_VALUES_SWITCH,
  KIND_LABEL,
  RCD_TYPES,
} from '../model/catalog';
import { CONDUCTOR_LABEL, WIRE_COLOR_HEX, WIRE_COLOR_LABEL } from '../model/constants';
import { PANEL_SIZES } from '../model/geometry';
import { getPoles, getTerminals, isResidualDevice, isSwitchingDevice, parseTerminalId } from '../model/terminals';
import { modulesUsed } from '../model/placement';
import { lineLoadOf } from '../model/lineWires';
import { COMB_LABEL, COMB_RATED_A, COMB_SECTION, combDevices } from '../model/comb';
import { WIRE_SECTIONS, type PanelDef, type ComponentInstance, type Conductor, type LoadCategory, type Wire, type WireColor } from '../model/types';
import { useStore } from '../store/projectStore';
import { InstallSection } from './InstallSection';
import { DayProfileSection, InverterEditor, InverterLive, MeterSection, PvArrayEditor, PvArrayLive, PvEnvironmentSection, StringChecksSection } from './PvPanels';
import { TripCurveSection } from './TripCurveSection';
import { InfoTab } from './InfoPanel';
import { ExercisePanel } from './Academy';
import { NormPanel } from './NormPanel';
import { ActiveFaults, LoadFaultCurrents, LoadFaultSection, ProtectionSection, WireFaultToggle } from './FaultPanels';
import { Field, NumberInput, Row, Section, Select, TextInput } from './fields';
import { fmt, fmtCurrent, fmtPower } from './format';

const CONDUCTORS: Conductor[] = ['L1', 'L2', 'L3', 'N', 'PE'];
const COLORS: WireColor[] = ['marrone', 'nero', 'grigio', 'blu', 'giallo-verde'];
const LOAD_CATS: LoadCategory[] = ['illuminazione', 'prese', 'cucina', 'scaldabagno', 'climatizzazione', 'lavaggio', 'ricarica', 'refrigerazione', 'riscaldamento', 'generico'];

export function SeverityIcon({ s, size = 14 }: { s: Issue['severity']; size?: number }) {
  if (s === 'errore') return <AlertOctagon size={size} className="shrink-0 text-red-400" />;
  if (s === 'attenzione') return <AlertTriangle size={size} className="shrink-0 text-amber-400" />;
  return <Info size={size} className="shrink-0 text-sky-400" />;
}

export function IssueCard({ issue, onClick }: { issue: Issue; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-md border border-slate-800 bg-slate-950/60 p-2.5 text-left hover:border-slate-600"
    >
      <div className="flex items-start gap-2">
        <SeverityIcon s={issue.severity} />
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-100">{issue.title}</div>
          <div className="mt-0.5 text-[11.5px] text-slate-300">{issue.message}</div>
          <div className="mt-1 text-[11px] leading-snug text-slate-500">{issue.explanation}</div>
        </div>
      </div>
    </button>
  );
}

// ------------------------------------------------------------------ progetto e quadro

function PanelEditor({ panel, main, canRemove }: { panel: PanelDef; main: boolean; canRemove: boolean }) {
  const project = useStore((s) => s.project);
  const setPanel = useStore((s) => s.setPanel);
  const renamePanel = useStore((s) => s.renamePanel);
  const removePanel = useStore((s) => s.removePanel);
  const total = panel.modulesPerRow * panel.rows;
  const used = modulesUsed(project, panel.id);
  const sizes = PANEL_SIZES.map((s) => s.modules);
  return (
    <div className="space-y-2 rounded-md border border-slate-800 p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TextInput value={panel.name} onChange={(v) => renamePanel(panel.id, v)} />
        </div>
        {main ? (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">generale</span>
        ) : (
          <button
            className="rounded p-1 text-slate-500 hover:bg-red-950 hover:text-red-300 disabled:opacity-30"
            disabled={!canRemove}
            title={canRemove ? 'Rimuovi il quadro' : 'Svuota il quadro prima di rimuoverlo'}
            onClick={() => removePanel(panel.id)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <Field label="Formato standard">
        <Select
          value={sizes.includes(total) ? total : sizes[0]!}
          options={sizes}
          format={(m) => {
            const c = PANEL_SIZES.find((s) => s.modules === m)!.config;
            return `${m} moduli (${c.rows} × ${c.modulesPerRow})`;
          }}
          onChange={(m) => setPanel(panel.id, PANEL_SIZES.find((s) => s.modules === m)!.config)}
        />
      </Field>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-slate-400">Guide DIN</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-slate-700 p-1 hover:bg-slate-800 disabled:opacity-40"
            disabled={panel.rows <= 1}
            onClick={() => setPanel(panel.id, { modulesPerRow: panel.modulesPerRow, rows: panel.rows - 1 })}
            title="Rimuovi l'ultima guida"
          >
            <Minus size={12} />
          </button>
          <span className="w-4 text-center font-mono">{panel.rows}</span>
          <button
            className="rounded border border-slate-700 p-1 hover:bg-slate-800 disabled:opacity-40"
            disabled={panel.rows >= 6}
            onClick={() => setPanel(panel.id, { modulesPerRow: panel.modulesPerRow, rows: panel.rows + 1 })}
            title="Aggiungi una guida"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      <Field label="Moduli per guida">
        <Select value={panel.modulesPerRow} options={[4, 6, 8, 12, 18, 24]} onChange={(m) => setPanel(panel.id, { modulesPerRow: m, rows: panel.rows })} />
      </Field>
      <Row k="Moduli occupati" v={`${used} / ${total}`} />
    </div>
  );
}

function ProjectProps() {
  const project = useStore((s) => s.project);
  const rename = useStore((s) => s.renameProject);
  const addPanel = useStore((s) => s.addPanel);
  const preset = useStore((s) => s.wirePreset);
  const setPreset = useStore((s) => s.setWirePreset);
  return (
    <>
      <Section title="Progetto">
        <Field label="Nome">
          <TextInput value={project.name} onChange={rename} />
        </Field>
        {project.description && <p className="text-[11.5px] leading-snug text-slate-400">{project.description}</p>}
      </Section>
      <Section title={project.panels.length > 1 ? `Quadri elettrici (${project.panels.length})` : 'Quadro elettrico'}>
        {project.panels.map((p, i) => (
          <PanelEditor key={p.id} panel={p} main={i === 0} canRemove={modulesUsed(project, p.id) === 0} />
        ))}
        <button onClick={addPanel} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-600 py-1.5 text-[12px] text-slate-300 hover:bg-slate-800">
          <Plus size={13} /> Aggiungi quadro (sottoquadro)
        </button>
        {project.panels.length > 1 && (
          <p className="text-[11px] leading-snug text-slate-500">
            I quadri si collegano con normali conduttori: imposta la lunghezza reale della linea di alimentazione del sottoquadro nelle proprietà del conduttore.
          </p>
        )}
      </Section>
      <ActiveFaults />
      <Section title="Nuovi conduttori">
        <Field label="Identificazione" hint="Automatica: dedotta dalla funzione dei morsetti collegati">
          <Select
            value={preset.conductor}
            options={['auto', ...CONDUCTORS] as const}
            format={(c) => (c === 'auto' ? 'Automatica (dai morsetti)' : CONDUCTOR_LABEL[c])}
            onChange={(c) => setPreset({ conductor: c })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sezione">
            <Select value={preset.section} options={WIRE_SECTIONS} format={(s) => `${fmt(s, s % 1 ? 1 : 0)} mm²`} onChange={(s) => setPreset({ section: s })} />
          </Field>
          <Field label="Lunghezza">
            <NumberInput value={preset.length} min={0.01} max={200} step={0.05} suffix="m" onChange={(l) => setPreset({ length: l })} />
          </Field>
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          Per collegare: trascina da un morsetto a un altro, oppure clicca un morsetto e poi il secondo. Seleziona un componente o un conduttore per modificarlo; <kbd className="rounded bg-slate-800 px-1">Canc</kbd> lo elimina.
        </p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ componente

function ComponentProps({ comp }: { comp: ComponentInstance }) {
  const update = useStore((s) => s.updateParams);
  const rename = useStore((s) => s.renameComponent);
  const toggle = useStore((s) => s.toggleComponent);
  const remove = useStore((s) => s.removeComponent);
  const select = useStore((s) => s.select);
  const setLoadNeutral = useStore((s) => s.setLoadNeutral);
  const project = useStore((s) => s.project);
  const issues = useStore((s) => s.issues);
  const result = useStore((s) => s.result);
  const running = useStore((s) => s.running);
  const item = catalogItem(comp.catalogId);
  const pr = comp.params;
  const own = issuesFor(issues, comp.id);

  const circuits = analyzeCircuits(project);
  const fed = circuits.filter((c) => c.lDevices.includes(comp.id) || c.nDevices.includes(comp.id));
  const loadName = (id: string) => {
    const c = project.components.find((x) => x.id === id);
    return c && c.params.kind === 'load' ? `${c.label} ${c.params.p.name}` : id;
  };

  return (
    <>
      <Section title={KIND_LABEL[pr.kind]}>
        <div className="text-[12px] text-slate-300">{item.name}</div>
        <Field label="Sigla">
          <TextInput value={comp.label} onChange={(v) => rename(comp.id, v)} />
        </Field>
        {item.mount === 'din' && <Row k="Ingombro" v={`${item.modules} ${item.modules === 1 ? "modulo" : "moduli"} DIN`} />}
        {isSwitchingDevice(pr.kind) && (
          <>
            <Row k="Numero di poli" v={'poles' in pr.p ? pr.p.poles : '—'} />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-slate-400">Stato contatti</span>
              <button
                onClick={() => toggle(comp.id)}
                className={`rounded-md px-3 py-1 text-[12px] font-semibold ${comp.closed ? 'bg-red-600/20 text-red-300 ring-1 ring-red-500/50' : 'bg-emerald-600/15 text-emerald-300 ring-1 ring-emerald-500/40'}`}
              >
                {comp.closed ? 'CHIUSO (I) — apri' : 'APERTO (O) — chiudi'}
              </button>
            </div>
          </>
        )}
        <p className="text-[11px] leading-snug text-slate-500">{item.description}</p>
      </Section>

      <Section title="Caratteristiche">
        {pr.kind === 'mcb' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Corrente nominale In">
                <Select value={pr.p.in} options={IN_VALUES_MCB} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'mcb', p: { ...pr.p, in: v } })} />
              </Field>
              <Field label="Curva d'intervento" hint="B: 3–5 In · C: 5–10 In · D: 10–20 In (soglia magnetica)">
                <Select value={pr.p.curve} options={CURVES} onChange={(v) => update(comp.id, { kind: 'mcb', p: { ...pr.p, curve: v } })} />
              </Field>
            </div>
            <Field label="Potere di interruzione Icn (CEI EN 60898-1)">
              <Select value={pr.p.icn} options={ICN_VALUES} format={(v) => `${fmt(v, v % 1 ? 1 : 0)} kA`} onChange={(v) => update(comp.id, { kind: 'mcb', p: { ...pr.p, icn: v } })} />
            </Field>
          </>
        )}
        {pr.kind === 'fuse' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cartuccia gG In" hint="Formato 10,3×38: fino a 32 A">
                <Select value={pr.p.in} options={IN_VALUES_FUSE} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'fuse', p: { ...pr.p, in: v } })} />
              </Field>
              <Field label="Potere di interruzione">
                <Select value={pr.p.icn} options={[20, 50, 100]} format={(v) => `${v} kA`} onChange={(v) => update(comp.id, { kind: 'fuse', p: { ...pr.p, icn: v } })} />
              </Field>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              Il potere di interruzione dipende dalla cartuccia e dalla tensione: usa il valore dichiarato dal costruttore (100 kA è tipico per gG 10,3×38 in c.a.).
            </p>
          </>
        )}
        {pr.kind === 'rcbo' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Corrente nominale In">
                <Select value={pr.p.in} options={IN_VALUES_RCBO} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'rcbo', p: { ...pr.p, in: v } })} />
              </Field>
              <Field label="Curva">
                <Select value={pr.p.curve} options={CURVES} onChange={(v) => update(comp.id, { kind: 'rcbo', p: { ...pr.p, curve: v } })} />
              </Field>
              <Field label="Sensibilità IΔn">
                <Select value={pr.p.idn} options={IDN_VALUES} format={(v) => `${v} mA`} onChange={(v) => update(comp.id, { kind: 'rcbo', p: { ...pr.p, idn: v } })} />
              </Field>
              <Field label="Tipo differenziale">
                <Select value={pr.p.rcdType} options={RCD_TYPES} onChange={(v) => update(comp.id, { kind: 'rcbo', p: { ...pr.p, rcdType: v } })} />
              </Field>
            </div>
            <Field label="Potere di interruzione Icn">
              <Select value={pr.p.icn} options={ICN_VALUES} format={(v) => `${fmt(v, v % 1 ? 1 : 0)} kA`} onChange={(v) => update(comp.id, { kind: 'rcbo', p: { ...pr.p, icn: v } })} />
            </Field>
          </>
        )}
        {pr.kind === 'rcd' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Corrente nominale In">
                <Select value={pr.p.in} options={IN_VALUES_RCD} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'rcd', p: { ...pr.p, in: v } })} />
              </Field>
              <Field label="Sensibilità IΔn">
                <Select
                  value={pr.p.idn}
                  options={IDN_VALUES}
                  format={(v) => `${v} mA`}
                  onChange={(v) => update(comp.id, { kind: 'rcd', p: { ...pr.p, idn: v, selective: v >= 100 ? pr.p.selective : false } })}
                />
              </Field>
              <Field label="Tipo" hint="AC: correnti alternate · A: anche pulsanti unidirezionali · F: anche frequenze miste · B: anche continue">
                <Select value={pr.p.rcdType} options={RCD_TYPES} onChange={(v) => update(comp.id, { kind: 'rcd', p: { ...pr.p, rcdType: v } })} />
              </Field>
            </div>
            <label className={`flex items-center gap-2 text-[12px] ${pr.p.idn < 100 ? 'text-slate-600' : 'text-slate-300'}`} title="Disponibile solo per IΔn ≥ 100 mA">
              <input
                type="checkbox"
                disabled={pr.p.idn < 100}
                checked={pr.p.selective}
                onChange={(e) => update(comp.id, { kind: 'rcd', p: { ...pr.p, selective: e.target.checked } })}
              />
              Selettivo (S) — ritardato
            </label>
          </>
        )}
        {pr.kind === 'switch' && (
          <Field label="Corrente nominale In">
            <Select value={pr.p.in} options={IN_VALUES_SWITCH} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'switch', p: { ...pr.p, in: v } })} />
          </Field>
        )}
        {pr.kind === 'relay' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Corrente nominale contatto">
                <Select value={pr.p.in} options={[10, 16, 20, 32]} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'relay', p: { ...pr.p, in: v } })} />
              </Field>
              <Field label="Tensione bobina">
                <Row k="" v={`${pr.p.coilV} V~`} />
              </Field>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              A ogni impulso sulla bobina (tensione A1-A2 oltre l'80% di quella nominale) il contatto 1-2 cambia stato e resta nella nuova posizione. La leva permette anche il comando manuale.
            </p>
          </>
        )}
        {pr.kind === 'button' && (
          <Field label="Nome / posizione">
            <TextInput value={pr.p.name} onChange={(v) => update(comp.id, { kind: 'button', p: { ...pr.p, name: v } })} />
          </Field>
        )}
        {pr.kind === 'wall-switch' && (
          <>
            <Field label="Nome / posizione">
              <TextInput value={pr.p.name} onChange={(v) => update(comp.id, { kind: 'wall-switch', p: { ...pr.p, name: v } })} />
            </Field>
            <Row k="Tipo" v={pr.p.type} />
            <Row
              k="Posizione"
              v={pr.p.type === 'interruttore' ? (comp.closed ? 'chiuso (L-1)' : 'aperto') : pr.p.type === 'deviatore' ? (comp.closed ? 'C collegato a 2' : 'C collegato a 1') : comp.closed ? 'incrociato (1-4, 2-3)' : 'diritto (1-3, 2-4)'}
            />
            <button onClick={() => toggle(comp.id)} className="rounded-md bg-slate-800 px-3 py-1 text-[12px] font-semibold text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700">
              Cambia posizione
            </button>
          </>
        )}
        {pr.kind === 'contactor' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Corrente dei contatti">
              <Select value={pr.p.in} options={[16, 20, 25, 40, 63]} format={(v) => `${v} A`} onChange={(v) => update(comp.id, { kind: 'contactor', p: { ...pr.p, in: v } })} />
            </Field>
            <Field label="Tensione della bobina">
              <Select value={pr.p.coilV} options={[230, 24, 12]} format={(v) => `${v} V~`} onChange={(v) => update(comp.id, { kind: 'contactor', p: { ...pr.p, coilV: v } })} />
            </Field>
            <p className="col-span-2 text-[10.5px] leading-snug text-slate-500">
              Contatti chiusi solo con la bobina alimentata (almeno l'80% della tensione nominale, valore del modello). Senza manovra manuale: lo stato lo decide il circuito di comando.
            </p>
          </div>
        )}
        {pr.kind === 'voltage-relay' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Soglia minima">
              <NumberInput value={pr.p.umin} min={150} max={225} step={1} suffix="V" onChange={(v) => update(comp.id, { kind: 'voltage-relay', p: { ...pr.p, umin: v } })} />
            </Field>
            <Field label="Soglia massima">
              <NumberInput value={pr.p.umax} min={235} max={300} step={1} suffix="V" onChange={(v) => update(comp.id, { kind: 'voltage-relay', p: { ...pr.p, umax: v } })} />
            </Field>
            <p className="col-span-2 text-[10.5px] leading-snug text-slate-500">
              Il ritardo di intervento e di richiusura dei relè reali non è modellato: il contatto segue subito la tensione.
            </p>
          </div>
        )}
        {pr.kind === 'psu' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tensione di uscita">
                <Select value={pr.p.vout} options={[12, 24]} format={(v) => `${v} V⎓`} onChange={(v) => update(comp.id, { kind: 'psu', p: { ...pr.p, vout: v } })} />
              </Field>
              <Field label="Potenza nominale">
                <NumberInput value={pr.p.pmaxW} min={10} max={480} step={10} suffix="W" onChange={(v) => update(comp.id, { kind: 'psu', p: { ...pr.p, pmaxW: v } })} />
              </Field>
              <Field label="Carico in uscita">
                <NumberInput value={pr.p.loadW} min={0} max={600} step={5} suffix="W" onChange={(v) => update(comp.id, { kind: 'psu', p: { ...pr.p, loadW: v } })} />
              </Field>
              <Field label="Rendimento">
                <NumberInput value={pr.p.efficiency} min={60} max={96} suffix="%" onChange={(v) => update(comp.id, { kind: 'psu', p: { ...pr.p, efficiency: v } })} />
              </Field>
            </div>
            <Row k="Corrente in uscita" v={`${fmt(Math.min(pr.p.loadW, pr.p.pmaxW) / pr.p.vout, 2)} A a ${pr.p.vout} V`} />
            <Row k="Potenza assorbita dalla rete" v={`${fmt(Math.min(pr.p.loadW, pr.p.pmaxW) / (pr.p.efficiency / 100) + 0.5, 1)} W`} />
            {pr.p.loadW > pr.p.pmaxW && (
              <p className="rounded bg-red-500/15 px-2 py-1 text-[11.5px] text-red-200 ring-1 ring-red-500/40">
                Il carico ({pr.p.loadW} W) supera la potenza nominale ({pr.p.pmaxW} W): l'alimentatore limita la corrente e la tensione di uscita cala (protezione da sovraccarico).
              </p>
            )}
          </>
        )}
        {pr.kind === 'pv-array' && <PvArrayEditor comp={comp} />}
        {pr.kind === 'inverter' && <InverterEditor comp={comp} />}
        {pr.kind === 'meter' && <MeterSection comp={comp} />}
        {pr.kind === 'dc-switch' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Corrente nominale">
              <NumberInput value={pr.p.in} min={10} max={63} suffix="A" onChange={(v) => update(comp.id, { kind: 'dc-switch', p: { ...pr.p, in: v } })} />
            </Field>
            <Field label="Tensione DC di impiego">
              <NumberInput value={pr.p.maxV} min={100} max={1500} step={50} suffix="V" onChange={(v) => update(comp.id, { kind: 'dc-switch', p: { ...pr.p, maxV: v } })} />
            </Field>
          </div>
        )}
        {pr.kind === 'spd' && (
          <>
            <Row k="Configurazione" v={pr.p.poles === 'DC' ? 'DC (+, −, PE)' : pr.p.poles} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipo (classe di prova)" hint="Tipo 1: correnti da fulminazione diretta; tipo 2: quadri di distribuzione; tipo 3: vicino agli apparecchi">
                <Select value={pr.p.spdType} options={[1, 2, 3] as const} format={(v) => `Tipo ${v}`} onChange={(v) => update(comp.id, { kind: 'spd', p: { ...pr.p, spdType: v } })} />
              </Field>
              <Field label="Uc (tensione max continuativa)">
                <NumberInput value={pr.p.uc} min={150} max={pr.p.poles === 'DC' ? 1500 : 760} step={5} suffix="V" onChange={(v) => update(comp.id, { kind: 'spd', p: { ...pr.p, uc: v } })} />
              </Field>
              <Field label="Up (livello di protezione)">
                <NumberInput value={pr.p.up} min={0.5} max={6} step={0.1} suffix="kV" onChange={(v) => update(comp.id, { kind: 'spd', p: { ...pr.p, up: v } })} />
              </Field>
              <Field label="In (corrente di scarica)">
                <NumberInput value={pr.p.inKA} min={1} max={100} step={1} suffix="kA" onChange={(v) => update(comp.id, { kind: 'spd', p: { ...pr.p, inKA: v } })} />
              </Field>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              A 50 Hz lo scaricatore non conduce: gli impulsi da fulmine non sono simulabili in regime sinusoidale. Il simulatore segnala le sovratensioni temporanee oltre Uc.
            </p>
          </>
        )}
        {pr.kind === 'bar' && (
          <>
            <Row k="Funzione" v={pr.p.barFn} />
            <Row k="Vie" v={pr.p.ways} />
          </>
        )}
        {pr.kind === 'supply' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tensione U0">
                <NumberInput value={pr.p.voltage} min={180} max={260} suffix="V" onChange={(v) => update(comp.id, { kind: 'supply', p: { ...pr.p, voltage: v } })} />
              </Field>
              <Field label="Potenza impegnata">
                <Select value={pr.p.contractKW} options={CONTRACT_KW} format={(v) => `${fmt(v, v % 1 ? 1 : 0)} kW`} onChange={(v) => update(comp.id, { kind: 'supply', p: { ...pr.p, contractKW: v } })} />
              </Field>
              <Field label="R anello di rete" hint="Resistenza fase + neutro della rete a monte del contatore">
                <NumberInput value={pr.p.rNetwork} min={0.001} max={5} step={0.01} suffix="Ω" onChange={(v) => update(comp.id, { kind: 'supply', p: { ...pr.p, rNetwork: v } })} />
              </Field>
              <Field label="X anello di rete">
                <NumberInput value={pr.p.xNetwork} min={0} max={5} step={0.01} suffix="Ω" onChange={(v) => update(comp.id, { kind: 'supply', p: { ...pr.p, xNetwork: v } })} />
              </Field>
            </div>
            <Row k="Sistema" v={pr.p.phases === 3 ? 'Trifase 400/230 V con neutro' : 'Monofase 230 V'} mono={false} />
            <Field label="RB — terra del neutro in cabina" hint="Sistema TT: il neutro del trasformatore è collegato a terra">
              <NumberInput value={pr.p.rb} min={0.01} max={100} step={0.1} suffix="Ω" onChange={(v) => update(comp.id, { kind: 'supply', p: { ...pr.p, rb: v } })} />
            </Field>
            <Row k="Icc presunta ai morsetti" v={`${fmt(pr.p.voltage / Math.hypot(pr.p.rNetwork, pr.p.xNetwork) / 1000, 2)} kA`} />
            <p className="text-[11px] text-slate-500">Stima con impedenza della sola rete: U0 / |Z anello|. Non sostituisce il valore dichiarato dal distributore.</p>
          </>
        )}
        {pr.kind === 'earth' && (
          <Field label="RA — resistenza del dispersore" hint="Valore da misurare sul campo con strumento idoneo">
            <NumberInput value={pr.p.ra} min={0.1} max={10000} step={1} suffix="Ω" onChange={(v) => update(comp.id, { kind: 'earth', p: { ...pr.p, ra: v } })} />
          </Field>
        )}
        {pr.kind === 'earth' && (
          <label className="flex items-center gap-2 text-[12px] text-slate-300" title="Senza misura il coordinamento RE × IΔn ≤ UL resta «verifica sul campo necessaria»">
            <input type="checkbox" checked={!!pr.p.raMeasured} onChange={(e) => update(comp.id, { kind: 'earth', p: { ...pr.p, raMeasured: e.target.checked } })} />
            Valore misurato sul campo (non di progetto)
          </label>
        )}
        {pr.kind === 'load' && (
          <>
            <Field label="Nome circuito">
              <TextInput value={pr.p.name} onChange={(v) => update(comp.id, { kind: 'load', p: { ...pr.p, name: v } })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipologia">
                <Select value={pr.p.category} options={LOAD_CATS} onChange={(v) => update(comp.id, { kind: 'load', p: { ...pr.p, category: v } })} />
              </Field>
              <Field label="Potenza nominale">
                <NumberInput value={pr.p.powerW} min={0} max={20000} step={50} suffix="W" onChange={(v) => update(comp.id, { kind: 'load', p: { ...pr.p, powerW: v } })} />
              </Field>
              <Field label="Fattore di potenza cos φ" hint="1 = carico resistivo; motori e compressori hanno cos φ minore di 1 (dato di targa)">
                <NumberInput value={pr.p.cosPhi ?? 1} min={0.3} max={1} step={0.01} onChange={(v) => update(comp.id, { kind: 'load', p: { ...pr.p, cosPhi: v } })} />
              </Field>
              <Field label="Lunghezza linea">
                <NumberInput value={pr.p.cableLength} min={0.1} max={500} step={1} suffix="m" onChange={(v) => update(comp.id, { kind: 'load', p: { ...pr.p, cableLength: v } })} />
              </Field>
              <Field label="Sezione linea">
                <Select value={pr.p.cableSection} options={WIRE_SECTIONS} format={(s) => `${fmt(s, s % 1 ? 1 : 0)} mm²`} onChange={(v) => update(comp.id, { kind: 'load', p: { ...pr.p, cableSection: v } })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-slate-300">
              <input type="checkbox" checked={pr.p.on} onChange={(e) => update(comp.id, { kind: 'load', p: { ...pr.p, on: e.target.checked } })} />
              Utilizzatore acceso
            </label>
            {pr.p.phases === 3 && (
              <label className="flex items-center gap-2 text-[12px] text-slate-300" title="Aggiunge o toglie il morsetto N del carico">
                <input type="checkbox" checked={!!pr.p.withNeutral} onChange={(e) => setLoadNeutral(comp.id, e.target.checked)} />
                Centro stella collegato al neutro
              </label>
            )}
            {(() => {
              if (pr.p.powerW <= 0) return <Row k="Impedenza equivalente" v="—" />;
              const z = loadBranchImpedance(pr.p.powerW / (pr.p.phases === 3 ? 3 : 1), pr.p.cosPhi ?? 1);
              const lbl = pr.p.phases === 3 ? 'Impedenza per ramo della stella' : 'Impedenza equivalente';
              return <Row k={lbl} v={z.im > 0.001 ? `${fmt(z.re, 2)} + j${fmt(z.im, 2)} Ω` : `${fmt(z.re, 2)} Ω`} />;
            })()}
            {(pr.p.cosPhi ?? 1) < 1 && (
              <Row k="Potenza apparente / reattiva" v={`${fmt(pr.p.powerW / (pr.p.cosPhi ?? 1), 0)} VA · ${fmt(pr.p.powerW * Math.tan(Math.acos(pr.p.cosPhi ?? 1)), 0)} var`} />
            )}
            <Row k="R di un conduttore di linea" v={`${fmt(wireResistance(pr.p.cableLength, pr.p.cableSection) * 1000, 1)} mΩ`} />
            <p className="text-[11px] text-slate-500">Metodo di posa e portata Iz saranno richiesti dalle verifiche di dimensionamento (Fase 3).</p>
          </>
        )}
      </Section>

      {running && result && result.ok && <LiveValues comp={comp} />}
      {pr.kind === 'load' && (pr.p.category === 'ricarica' || pr.p.evse) && <EvseSection comp={comp} />}
      {pr.kind === 'pv-array' && (
        <>
          {running && <PvArrayLive comp={comp} />}
          <PvEnvironmentSection />
        </>
      )}
      {pr.kind === 'inverter' && (
        <>
          <InverterLive comp={comp} />
          <PvEnvironmentSection />
          <StringChecksSection comp={comp} />
          <DayProfileSection comp={comp} />
        </>
      )}
      <ProtectionSection comp={comp} />
      <TripCurveSection comp={comp} />
      {pr.kind === 'load' && (
        <>
          <InstallSection comp={comp} />
          <LoadFaultSection comp={comp} />
          <LoadFaultCurrents comp={comp} />
        </>
      )}

      {(isSwitchingDevice(pr.kind) || pr.kind === 'load') && (
        <Section title="Circuito associato">
          {pr.kind === 'load' ? (
            (() => {
              const c = circuits.find((x) => x.loadId === comp.id);
              if (!c || c.lDevices.length === 0) return <p className="text-[12px] text-slate-500">Nessun dispositivo a monte collegato.</p>;
              return (
                <div className="flex flex-wrap items-center gap-1 text-[12px]">
                  <span className="text-slate-500">Fornitura →</span>
                  {c.lDevices.map((d) => {
                    const dev = project.components.find((x) => x.id === d)!;
                    return (
                      <button key={d} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-sky-300 hover:bg-slate-700" onClick={() => select({ type: 'component', id: d })}>
                        {dev.label}
                      </button>
                    );
                  })}
                  <span className="text-slate-500">→ {comp.label}</span>
                </div>
              );
            })()
          ) : fed.length === 0 ? (
            <p className="text-[12px] text-slate-500">Nessun utilizzatore alimentato attraverso questo dispositivo.</p>
          ) : (
            <ul className="space-y-0.5 text-[12px]">
              {fed.map((c) => (
                <li key={c.loadId}>
                  <button className="text-sky-300 hover:underline" onClick={() => select({ type: 'component', id: c.loadId })}>
                    {loadName(c.loadId)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title={`Problemi rilevati (${own.length})`}>
        {own.length === 0 ? <p className="text-[12px] text-slate-500">Nessun problema di cablaggio rilevato su questo componente.</p> : own.map((i) => <IssueCard key={i.id} issue={i} />)}
      </Section>

      <div className="p-4">
        <button onClick={() => remove(comp.id)} className="flex w-full items-center justify-center gap-2 rounded-md border border-red-900/70 py-1.5 text-[12px] text-red-300 hover:bg-red-950/50">
          <Trash2 size={13} /> Elimina componente e conduttori collegati
        </button>
      </div>
    </>
  );
}

/** Wallbox: modalità di gestione della potenza e stato della ricarica. */
function EvseSection({ comp }: { comp: ComponentInstance }) {
  const update = useStore((s) => s.updateParams);
  const running = useStore((s) => s.running);
  const ev = useStore((s) => (s.result && s.result.ok ? s.result.evse?.get(comp.id) : undefined));
  if (comp.params.kind !== 'load') return null;
  const p = comp.params.p;
  const cur = p.evse ?? { mode: 'fissa' as const, minW: 1400 };
  const set = (patch: Partial<typeof cur>) => update(comp.id, { kind: 'load', p: { ...p, evse: { ...cur, ...patch } } });
  const modes = [
    { m: 'fissa' as const, label: 'Fissa', title: 'Carica sempre alla potenza impostata' },
    { m: 'limitata' as const, label: 'Limitata al contratto', title: 'Riduce la potenza per non superare la potenza contrattuale al contatore' },
    { m: 'solare' as const, label: 'Solo surplus FV', title: "Carica solo con l'energia del fotovoltaico che andrebbe in rete" },
  ];
  return (
    <Section title="Ricarica: gestione della potenza">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Modalità di ricarica">
        {modes.map((x) => (
          <button
            key={x.m}
            role="radio"
            aria-checked={cur.mode === x.m}
            title={x.title}
            onClick={() => set({ mode: x.m })}
            className={`rounded px-2 py-0.5 text-[11.5px] ring-1 ${cur.mode === x.m ? 'bg-sky-500/15 text-sky-200 ring-sky-500/50' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <Field label="Potenza minima di ricarica" hint="Sotto questo valore la ricarica si sospende (circa 6 A = 1,4 kW in monofase)">
        <NumberInput value={cur.minW} min={0} max={p.powerW} step={100} suffix="W" onChange={(v) => set({ minW: v })} />
      </Field>
      {running && ev ? (
        <>
          <Row k="Potenza di ricarica ora" v={`${fmt(ev.setW / 1000, 2)} kW su ${fmt(ev.maxW / 1000, 2)} kW`} />
          <p className={`text-[12px] font-semibold ${ev.setW === 0 ? 'text-amber-300' : ev.setW < ev.maxW - 5 ? 'text-sky-300' : 'text-emerald-300'}`}>{ev.reason}</p>
        </>
      ) : (
        <p className="text-[11.5px] text-slate-500">Avvia la simulazione per vedere la potenza regolata.</p>
      )}
    </Section>
  );
}

function LiveValues({ comp }: { comp: ComponentInstance }) {
  const result = useStore((s) => s.result);
  if (!result || !result.ok) return null;
  const pr = comp.params;
  const terms = getTerminals(comp);
  return (
    <Section title="Valori simulati">
      {isSwitchingDevice(pr.kind) && (
        <>
          {getPoles(comp).map((p) => {
            const i = result.poleI.get(comp.id)?.[p.index];
            return <Row key={p.index} k={`Corrente polo ${p.fn}`} v={fmtCurrent(i ? abs(i) : 0)} />;
          })}
          {'in' in pr.p && (
            <Row k="Carico rispetto a In" v={`${fmt((deviceCurrent(result, comp.id) / pr.p.in) * 100, 0)} %`} />
          )}
          {isResidualDevice(pr.kind) && <Row k="Corrente differenziale IΔ" v={`${fmt((result.residual.get(comp.id) ?? 0) * 1000, 2)} mA`} />}
        </>
      )}
      {pr.kind === 'load' &&
        (() => {
          const r = result.loads.get(comp.id);
          if (!r) return null;
          return (
            <>
              {r.phaseV ? (
                r.phaseV.map((v, k) => <Row key={k} k={`Ramo L${k + 1}`} v={`${fmt(v, 1)} V · ${fmtCurrent(r.phaseI![k]!)}`} />)
              ) : (
                <>
                  <Row k="Tensione ai capi" v={`${fmt(r.v, 1)} V`} />
                  <Row k="Corrente" v={fmtCurrent(r.i)} />
                </>
              )}
              <Row k="Potenza attiva" v={fmtPower(r.p)} />
              <Row k="Caduta di tensione" v={r.energized ? `${fmt(r.dropPct, 2)} %` : '—'} />
              <Row k="Tensione della massa verso terra" v={(() => { const tv = result.touchV.get(comp.id); return tv === null || tv === undefined ? '— (massa isolata)' : `${fmt(tv, 1)} V`; })()} />
            </>
          );
        })()}
      {pr.kind === 'supply' && (
        <>
          {result.supply.phases.map((ph) => (
            <Row key={ph.phase} k={result.supply.phases.length === 3 ? `L${ph.phase}-N` : 'Tensione L-N · corrente'} v={`${fmt(ph.v, 1)} V · ${fmtCurrent(ph.i)}`} />
          ))}
          {result.supply.lineV.length === 3 && <Row k="U12 · U23 · U31" v={result.supply.lineV.map((u) => fmt(u, 0)).join(' · ') + ' V'} />}
          <Row k="Corrente nel neutro" v={fmtCurrent(result.supply.iN)} />
          <Row k="Potenza attiva" v={fmtPower(result.supply.p)} />
          <Row k="Fattore di potenza" v={fmt(result.supply.pf, 3)} />
        </>
      )}
      <div className="pt-1 text-[11px] text-slate-500">Tensione dei morsetti verso terra</div>
      <div className="grid grid-cols-3 gap-1">
        {terms.map((t) => {
          const v = result.terminalV.get(t.id);
          return (
            <div key={t.id} className="rounded bg-slate-950/70 px-1.5 py-1 text-center font-mono text-[10.5px]">
              <div className="text-slate-500">{t.label}</div>
              <div className={v && abs(v) > 50 ? 'text-red-300' : 'text-slate-300'}>{v === null || v === undefined ? '—' : `${fmt(abs(v), 1)} V`}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ conduttore

/** Pettine di collegamento selezionato (uno qualsiasi dei suoi tratti). */
function CombSection({ wire }: { wire: Wire }) {
  const project = useStore((s) => s.project);
  const result = useStore((s) => s.result);
  const remove = useStore((s) => s.removeWire);
  if (!wire.comb) return null;
  const devs = combDevices(project, wire.comb.id);
  const segs = project.wires.filter((w) => w.comb?.id === wire.comb!.id);
  const imax = result && result.ok ? Math.max(0, ...segs.map((w) => abs(result.wireI.get(w.id) ?? { re: 0, im: 0 }))) : null;
  return (
    <Section title="Pettine di collegamento">
      <div className="text-[12px] text-slate-300">{COMB_LABEL[wire.comb.type]}</div>
      <Row k="Dispositivi collegati" v={devs.map((d) => d.label).join(' · ')} mono={false} />
      <Row k="Tratto selezionato" v={`dente ${wire.conductor}, ${fmt(wire.length * 1000, 1)} mm`} />
      <Row k="Sezione equivalente / In tipica" v={`${COMB_SECTION} mm² · ${COMB_RATED_A} A`} />
      {imax !== null && <Row k="Corrente massima nella barra" v={fmtCurrent(imax)} />}
      {imax !== null && imax > COMB_RATED_A && (
        <p className="rounded bg-red-500/15 px-2 py-1 text-[11.5px] text-red-200 ring-1 ring-red-500/40">
          La corrente supera la portata tipica del pettine ({COMB_RATED_A} A): usa il dato del costruttore e alimenta la barra al centro o con un pettine di sezione maggiore.
        </p>
      )}
      <p className="text-[11px] leading-snug text-slate-500">
        Barra in rame isolata che collega gli ingressi dei dispositivi affiancati. La corrente nominale vale per il pettine alimentato a un estremo: i dati reali sono quelli del costruttore.
      </p>
      <button className="flex items-center gap-1.5 rounded-md bg-red-600/15 px-2 py-1 text-[12px] text-red-300 ring-1 ring-red-500/40 hover:bg-red-600/25" onClick={() => remove(wire.id)}>
        <Trash2 size={13} /> Rimuovi il pettine
      </button>
    </Section>
  );
}

function WireProps({ wire }: { wire: Wire }) {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.updateWire);
  const remove = useStore((s) => s.removeWire);
  const allIssues = useStore((s) => s.issues);
  const issues = allIssues.filter((i) => i.wireIds.includes(wire.id));
  const result = useStore((s) => s.result);
  const name = (tid: string) => {
    const { componentId, key } = parseTerminalId(tid);
    const c = project.components.find((x) => x.id === componentId);
    const t = c ? getTerminals(c).find((x) => x.key === key) : undefined;
    return c && t ? `${c.label} · morsetto ${t.label} (${t.fn})` : tid;
  };
  const r = wireResistance(wire.length, wire.section);
  const lineLoad = lineLoadOf(project, wire);
  const i = result && result.ok ? result.wireI.get(wire.id) : undefined;
  const va = result && result.ok ? result.terminalV.get(wire.from) : undefined;
  const vb = result && result.ok ? result.terminalV.get(wire.to) : undefined;
  if (wire.comb) {
    return (
      <>
        <CombSection wire={wire} />
        <Section title="Tratto di barra">
          <Row k="Da" v={name(wire.from)} mono={false} />
          <Row k="A" v={name(wire.to)} mono={false} />
          <Row k="Resistenza R = ρL/S" v={`${fmt(r * 1000, 3)} mΩ`} />
          {result && result.ok && <Row k="Corrente" v={fmtCurrent(i ? abs(i) : 0)} />}
        </Section>
        <WireFaultToggle wire={wire} />
        <Section title={`Problemi rilevati (${issues.length})`}>
          {issues.length === 0 ? <p className="text-[12px] text-slate-500">Nessun problema rilevato su questo tratto.</p> : issues.map((x) => <IssueCard key={x.id} issue={x} />)}
        </Section>
      </>
    );
  }
  return (
    <>
      <Section title="Conduttore">
        <Row k="Da" v={name(wire.from)} mono={false} />
        <Row k="A" v={name(wire.to)} mono={false} />
        {lineLoad && lineLoad.params.kind === 'load' && (
          <p className="rounded bg-sky-500/10 px-2 py-1.5 text-[11.5px] leading-snug text-sky-200 ring-1 ring-sky-500/30">
            Questo conduttore è la linea di {lineLoad.label} ({lineLoad.params.p.name}): lunghezza e sezione sono quelle della linea e vengono contate una sola volta. Se le cambi qui, cambia la linea dell'utilizzatore.
          </p>
        )}
        <Field label="Identificazione">
          <Select value={wire.conductor} options={CONDUCTORS} format={(c) => CONDUCTOR_LABEL[c]} onChange={(c) => update(wire.id, { conductor: c })} />
        </Field>
        <Field label="Colore isolante">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                title={WIRE_COLOR_LABEL[c]}
                onClick={() => update(wire.id, { color: c })}
                className={`h-6 w-6 rounded-full ring-2 ${wire.color === c ? 'ring-sky-400' : 'ring-slate-700'}`}
                style={{
                  background: c === 'giallo-verde' ? 'repeating-linear-gradient(45deg,#22a447 0 5px,#facc15 5px 10px)' : WIRE_COLOR_HEX[c],
                }}
              />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sezione">
            <Select value={wire.section} options={WIRE_SECTIONS} format={(s) => `${fmt(s, s % 1 ? 1 : 0)} mm²`} onChange={(s) => update(wire.id, { section: s })} />
          </Field>
          <Field label="Lunghezza">
            <NumberInput value={wire.length} min={0.01} max={500} step={0.05} suffix="m" onChange={(l) => update(wire.id, { length: l })} />
          </Field>
        </div>
        <Row k="Resistenza R = ρL/S" v={lineLoad ? `${fmt(r * 1000, 2)} mΩ (nella linea di ${lineLoad.label})` : `${fmt(r * 1000, 2)} mΩ`} />
      </Section>
      {result && result.ok && (
        <Section title="Valori simulati">
          <Row k="Corrente" v={fmtCurrent(i ? abs(i) : 0)} />
          <Row k="Caduta sul conduttore" v={va && vb ? (abs(sub(va, vb)) >= 1 ? `${fmt(abs(sub(va, vb)), 1)} V` : `${fmt(abs(sub(va, vb)) * 1000, 1)} mV`) : '—'} />
          <Row k="Potenza dissipata" v={i ? `${fmt(abs(i) ** 2 * r, 2)} W` : '—'} />
        </Section>
      )}
      <WireFaultToggle wire={wire} />
      <Section title={`Problemi rilevati (${issues.length})`}>
        {issues.length === 0 ? <p className="text-[12px] text-slate-500">Nessun problema rilevato su questo conduttore.</p> : issues.map((x) => <IssueCard key={x.id} issue={x} />)}
      </Section>
      <div className="p-4">
        <button onClick={() => remove(wire.id)} className="flex w-full items-center justify-center gap-2 rounded-md border border-red-900/70 py-1.5 text-[12px] text-red-300 hover:bg-red-950/50">
          <Trash2 size={13} /> Elimina conduttore
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ verifiche

function ChecksTab() {
  const issues = useStore((s) => s.issues);
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setRightTab);
  const count = (s: Issue['severity']) => issues.filter((i) => i.severity === s).length;
  const order: Issue['severity'][] = ['errore', 'attenzione', 'info'];
  const sorted = [...issues].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <>
      <Section title="Verifiche di cablaggio">
        <div className="grid grid-cols-3 gap-2 text-center">
          {order.map((s) => (
            <div key={s} className="rounded-md bg-slate-950/70 py-2">
              <div className={`font-mono text-lg ${s === 'errore' ? 'text-red-400' : s === 'attenzione' ? 'text-amber-400' : 'text-sky-400'}`}>{count(s)}</div>
              <div className="text-[10.5px] capitalize text-slate-500">{s === 'errore' ? 'Errori' : s === 'attenzione' ? 'Attenzioni' : 'Note'}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          Controlli topologici aggiornati a ogni modifica: morsetti liberi, fase/neutro, neutri tra gruppi differenziali, continuità del PE, identificazione dei conduttori.
        </p>
      </Section>
      <Section title="Verifica normativa">
        <p className="text-[11.5px] leading-snug text-slate-400">
          Questi sono controlli di cablaggio. Le verifiche secondo la CEI 64-8 sono nella scheda <b className="text-slate-200">Norma</b>.
        </p>
      </Section>
      <div className="space-y-2 p-4">
        {sorted.length === 0 && <p className="text-[12px] text-emerald-400">Nessun problema di cablaggio rilevato dai controlli disponibili.</p>}
        {sorted.map((i) => (
          <IssueCard
            key={i.id}
            issue={i}
            onClick={() => {
              if (i.wireIds[0]) select({ type: 'wire', id: i.wireIds[0] });
              else if (i.componentIds[0]) select({ type: 'component', id: i.componentIds[0] });
              else return;
              setTab('props');
            }}
          />
        ))}
      </div>
    </>
  );
}

const TAB_LABEL = { props: 'Proprietà', checks: 'Cablaggio', norm: 'Norma', info: 'Info', exercise: 'Esercizio' } as const;

export function PropertiesPanel() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const tab = useStore((s) => s.rightTab);
  const exerciseActive = useStore((s) => !!s.exercise);
  const setTab = useStore((s) => s.setRightTab);
  const errors = useStore((s) => s.issues.filter((i) => i.severity === 'errore').length);
  const comp = selection?.type === 'component' ? project.components.find((c) => c.id === selection.id) : undefined;
  const wire = selection?.type === 'wire' ? project.wires.find((w) => w.id === selection.id) : undefined;

  return (
    <aside className="flex h-full w-[330px] shrink-0 flex-col border-l border-slate-800 bg-slate-900/80">
      <div className="flex border-b border-slate-800 text-[12px]">
        {(exerciseActive ? (['exercise', 'props', 'checks', 'norm', 'info'] as const) : (['props', 'checks', 'norm', 'info'] as const)).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11.5px] font-semibold ${tab === t ? 'border-b-2 border-sky-400 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {TAB_LABEL[t]}
            {t === 'checks' && errors > 0 && <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 font-mono text-[10px] text-red-300">{errors}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'exercise' && exerciseActive ? <ExercisePanel /> : tab === 'norm' ? <NormPanel /> : tab === 'info' ? <InfoTab /> : tab === 'checks' ? <ChecksTab /> : comp ? <ComponentProps key={comp.id} comp={comp} /> : wire ? <WireProps key={wire.id} wire={wire} /> : <ProjectProps />}
      </div>
    </aside>
  );
}
