import {
  Cable,
  ClipboardCheck,
  ClipboardList,
  FileDown,
  FilePlus2,
  FolderOpen,
  GraduationCap,
  Gauge,
  Magnet,
  MousePointer2,
  Info,
  Play,
  Redo2,
  Ruler,
  Save,
  Square,
  Stethoscope,
  Sun,
  Tags,
  Undo2,
  Zap,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { saveProject } from '../persistence/storage';
import { useStore } from '../store/projectStore';
import { AccountButton } from './Account';
import { fmtTime } from './format';
import { UI_SCALES, useUiScale } from './uiScale';

function Btn({
  icon,
  label,
  onClick,
  disabled,
  active,
  title,
  tone = 'default',
  secondary = false,
}: {
  icon: ReactNode;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  tone?: 'default' | 'go' | 'stop';
  /** Strumento secondario: la scritta compare solo sugli schermi molto larghi (sempre come descrizione) */
  secondary?: boolean;
}) {
  const tones = {
    default: active ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/50' : 'text-slate-300 hover:bg-slate-800',
    go: 'bg-emerald-600 text-white hover:bg-emerald-500',
    stop: 'bg-red-600 text-white hover:bg-red-500',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[0.75rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${tones[tone]}`}
    >
      {icon}
      {label && <span className={secondary ? 'hidden min-[1800px]:inline' : 'hidden xl:inline'}>{label}</span>}
    </button>
  );
}

const Sep = () => <div className="mx-1 h-5 w-px bg-slate-700" />;

export function TopBar({ onOpen, onInfo }: { onOpen: () => void; onInfo: () => void }) {
  const s = useStore();
  const [exporting, setExporting] = useState(false);
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900 pr-3">
      {/* Gli strumenti scorrono se non entrano; dimensione del testo e account restano sempre visibili a destra. */}
      <div className="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden pl-3 [scrollbar-color:#334155_transparent] [scrollbar-width:thin]">
      <div className="mr-2 flex shrink-0 items-center gap-2" title="ElectroLab — Laboratorio quadri elettrici civili">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-slate-950">
          <Zap size={16} strokeWidth={2.5} />
        </div>
        <div className="hidden leading-tight min-[1600px]:block">
          <div className="text-[0.8125rem] font-bold tracking-tight text-slate-100">ElectroLab</div>
          <div className="hidden text-[0.59375rem] text-slate-500 min-[1800px]:block">Laboratorio quadri elettrici civili</div>
        </div>
      </div>
      <div className="mr-2 flex shrink-0 rounded-md bg-slate-950 p-0.5 text-[0.75rem] font-semibold">
        {(['lab', 'pv', 'academy'] as const).map((m) => (
          <button
            key={m}
            onClick={() => s.setMode(m)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 ${s.mode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {m === 'lab' ? <Zap size={13} /> : m === 'pv' ? <Sun size={13} /> : <GraduationCap size={13} />}
            {m === 'lab' ? 'Laboratorio' : m === 'pv' ? 'Progetta FV' : 'Accademia'}
          </button>
        ))}
      </div>
      {s.mode === 'lab' && (
        <>
      <Btn
        icon={<FilePlus2 size={15} />}
        label="Nuovo"
        secondary
        onClick={() => {
          if (window.confirm('Creare un nuovo progetto vuoto? Le modifiche non salvate nel progetto corrente restano nella bozza solo fino al prossimo cambio.')) s.newProject();
        }}
      />
      <Btn
        icon={<Save size={15} />}
        label="Salva"
        secondary
        onClick={() => {
          if (saveProject(s.project)) {
            s.markSaved();
            s.toast('info', `Progetto "${s.project.name}" salvato nel browser.`);
          } else s.toast('errore', 'Salvataggio non riuscito: memoria locale non disponibile.');
        }}
      />
      <Btn icon={<FolderOpen size={15} />} label="Libreria" secondary title="Libreria progetti: apri, duplica, importa, esporta" onClick={onOpen} />
      <Sep />
      <Btn icon={<Undo2 size={15} />} title="Annulla (Ctrl+Z)" onClick={s.undo} disabled={s.past.length === 0} />
      <Btn icon={<Redo2 size={15} />} title="Ripristina (Ctrl+Y)" onClick={s.redo} disabled={s.future.length === 0} />
      <Sep />
      {s.running ? (
        <Btn icon={<Square size={13} fill="currentColor" />} label="Interrompi simulazione" tone="stop" onClick={s.stopSimulation} />
      ) : (
        <Btn icon={<Play size={14} fill="currentColor" />} label="Avvia simulazione" tone="go" onClick={s.startSimulation} />
      )}
      {s.running && (
        <div className="ml-1 flex items-center gap-1.5 rounded-md bg-slate-950 px-2 py-1 font-mono text-[0.6875rem] text-emerald-300" title="Tempo simulato">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          t = {fmtTime(s.simTime)}
        </div>
      )}
      {s.running && (
        <select
          className="ml-1 h-7 rounded-md border border-slate-700 bg-slate-950 px-1 font-mono text-[0.6875rem] text-slate-200"
          value={s.speed}
          onChange={(e) => s.setSpeed(Number(e.target.value))}
          title="Velocità del tempo simulato"
        >
          {[1, 10, 60].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      )}
      <Sep />
      <Btn
        icon={<Cable size={15} />}
        label="Modalità cablaggio" secondary
        active={s.wiringMode}
        onClick={() => s.setWiringMode(!s.wiringMode)}
        title="In modalità cablaggio i componenti restano fermi e i morsetti sono evidenziati"
      />
      <Btn icon={<Tags size={15} />} label="Etichette" secondary active={s.showLabels} onClick={() => s.setShowLabels(!s.showLabels)} />
      <Btn
        icon={<Ruler size={15} />}
        label="Lunghezze" secondary
        active={s.showLengths}
        onClick={() => s.setShowLengths(!s.showLengths)}
        title="Mostra sezione e lunghezza di ogni conduttore e della conduttura di ogni utilizzatore"
      />
      <Sep />
      <Btn icon={<MousePointer2 size={15} />} title="Selezione e cablaggio" active={s.tool === 'select'} onClick={() => s.setTool('select')} />
      <Btn icon={<Gauge size={15} />} label="Multimetro" secondary active={s.tool === 'multimeter'} onClick={() => s.setTool('multimeter')} title="Multimetro: clic su due morsetti" />
      <Btn icon={<Magnet size={15} />} label="Pinza" secondary active={s.tool === 'clamp'} onClick={() => s.setTool('clamp')} title="Pinza amperometrica: clic su un conduttore o su un utilizzatore" />
      <Btn
        icon={<Stethoscope size={15} />}
        label="Verificatore" secondary
        active={s.tool === 'tester'}
        onClick={() => s.setTool('tester')}
        title="Verifiche iniziali: isolamento, anello di guasto e prova del differenziale (clic su un utilizzatore)"
      />
      <Sep />
      <Btn
        icon={<ClipboardCheck size={15} />}
        label="Verifica impianto" secondary
        onClick={() => s.setRightTab('norm')}
        active={s.rightTab === 'norm'}
      />
      <Btn
        icon={<ClipboardList size={15} />}
        label="Materiali" secondary
        title="Elenco materiali (CSV per Excel): dispositivi, apparecchiature, pettini e metri di cavo"
        onClick={async () => {
          const { bomCsv } = await import('../export/bom');
          const blob = new Blob([bomCsv(s.project)], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${s.project.name.replace(/[^\w\s-]+/g, '').trim() || 'progetto'} - materiali.csv`;
          a.click();
          URL.revokeObjectURL(url);
          s.toast('info', 'Elenco materiali scaricato (CSV).');
        }}
      />
      <Btn
        icon={<FileDown size={15} />}
        label={exporting ? 'Esportazione…' : 'Esporta PDF'}
        secondary
        disabled={exporting}
        title="Relazione PDF con dati, circuiti, schema unifilare e verifiche"
        onClick={async () => {
          setExporting(true);
          try {
            const { exportProjectPdf } = await import('../export/pdfReport');
            await exportProjectPdf(s.project);
            s.toast('info', 'Relazione PDF generata.');
          } catch (err) {
            s.toast('errore', `Esportazione PDF non riuscita: ${(err as Error).message}`);
          } finally {
            setExporting(false);
          }
        }}
      />
        </>
      )}
      <div className="flex-1" />
      </div>
      {s.mode === 'lab' && <Btn icon={<Info size={15} />} label="Modello fisico" secondary onClick={onInfo} />}
      <TextSize />
      <AccountButton />
    </header>
  );
}

/** Dimensione del testo e dell'interfaccia: A più piccola / A più grande. */
function TextSize() {
  const scale = useUiScale((s) => s.scale);
  const setScale = useUiScale((s) => s.setScale);
  const i = UI_SCALES.indexOf(scale as (typeof UI_SCALES)[number]);
  const btn = 'flex h-7 w-7 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';
  return (
    <div className="mr-1 flex shrink-0 items-center gap-0.5 rounded-md bg-slate-950 p-0.5" role="group" aria-label="Dimensione del testo">
      <button className={btn} onClick={() => setScale(UI_SCALES[Math.max(0, i - 1)]!)} disabled={i <= 0} aria-label="Testo più piccolo" title="Testo più piccolo">
        <span className="text-[0.75rem] font-semibold">A</span>
      </button>
      <span className="w-9 text-center font-mono text-[0.6875rem] tabular-nums text-slate-400" aria-live="polite">
        {Math.round(scale * 100)}%
      </span>
      <button className={btn} onClick={() => setScale(UI_SCALES[Math.min(UI_SCALES.length - 1, i + 1)]!)} disabled={i >= UI_SCALES.length - 1} aria-label="Testo più grande" title="Testo più grande">
        <span className="text-[1rem] font-semibold">A</span>
      </button>
    </div>
  );
}
