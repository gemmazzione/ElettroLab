import {
  Cable,
  ClipboardCheck,
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
  Tags,
  Undo2,
  Zap,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { saveProject } from '../persistence/storage';
import { useStore } from '../store/projectStore';
import { AccountButton } from './Account';
import { fmtTime } from './format';

function Btn({
  icon,
  label,
  onClick,
  disabled,
  active,
  title,
  tone = 'default',
}: {
  icon: ReactNode;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  tone?: 'default' | 'go' | 'stop';
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
      className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${tones[tone]}`}
    >
      {icon}
      {label && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}

const Sep = () => <div className="mx-1 h-5 w-px bg-slate-700" />;

export function TopBar({ onOpen, onInfo }: { onOpen: () => void; onInfo: () => void }) {
  const s = useStore();
  const [exporting, setExporting] = useState(false);
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900 px-3">
      <div className="mr-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-slate-950">
          <Zap size={16} strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-tight text-slate-100">ElectroLab</div>
          <div className="text-[9.5px] text-slate-500">Laboratorio quadri elettrici civili</div>
        </div>
      </div>
      <div className="mr-2 flex rounded-md bg-slate-950 p-0.5 text-[12px] font-semibold">
        {(['lab', 'academy'] as const).map((m) => (
          <button
            key={m}
            onClick={() => s.setMode(m)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 ${s.mode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {m === 'lab' ? <Zap size={13} /> : <GraduationCap size={13} />}
            {m === 'lab' ? 'Laboratorio' : 'Accademia'}
          </button>
        ))}
      </div>
      <Btn
        icon={<FilePlus2 size={15} />}
        label="Nuovo"
        onClick={() => {
          if (window.confirm('Creare un nuovo progetto vuoto? Le modifiche non salvate nel progetto corrente restano nella bozza solo fino al prossimo cambio.')) s.newProject();
        }}
      />
      <Btn
        icon={<Save size={15} />}
        label="Salva"
        onClick={() => {
          if (saveProject(s.project)) {
            s.markSaved();
            s.toast('info', `Progetto "${s.project.name}" salvato nel browser.`);
          } else s.toast('errore', 'Salvataggio non riuscito: memoria locale non disponibile.');
        }}
      />
      <Btn icon={<FolderOpen size={15} />} label="Libreria" title="Libreria progetti: apri, duplica, importa, esporta" onClick={onOpen} />
      <Sep />
      <Btn icon={<Undo2 size={15} />} title="Annulla (Ctrl+Z)" onClick={s.undo} disabled={s.past.length === 0} />
      <Btn icon={<Redo2 size={15} />} title="Ripristina (Ctrl+Y)" onClick={s.redo} disabled={s.future.length === 0} />
      <Sep />
      <Btn
        icon={<Cable size={15} />}
        label="Modalità cablaggio"
        active={s.wiringMode}
        onClick={() => s.setWiringMode(!s.wiringMode)}
        title="In modalità cablaggio i componenti restano fermi e i morsetti sono evidenziati"
      />
      <Btn icon={<Tags size={15} />} label="Etichette" active={s.showLabels} onClick={() => s.setShowLabels(!s.showLabels)} />
      <Btn
        icon={<Ruler size={15} />}
        label="Lunghezze"
        active={s.showLengths}
        onClick={() => s.setShowLengths(!s.showLengths)}
        title="Mostra sezione e lunghezza di ogni conduttore e della conduttura di ogni utilizzatore"
      />
      <Sep />
      <Btn icon={<MousePointer2 size={15} />} title="Selezione e cablaggio" active={s.tool === 'select'} onClick={() => s.setTool('select')} />
      <Btn icon={<Gauge size={15} />} label="Multimetro" active={s.tool === 'multimeter'} onClick={() => s.setTool('multimeter')} title="Multimetro: clic su due morsetti" />
      <Btn icon={<Magnet size={15} />} label="Pinza" active={s.tool === 'clamp'} onClick={() => s.setTool('clamp')} title="Pinza amperometrica: clic su un conduttore o su un utilizzatore" />
      <Sep />
      {s.running ? (
        <Btn icon={<Square size={13} fill="currentColor" />} label="Interrompi simulazione" tone="stop" onClick={s.stopSimulation} />
      ) : (
        <Btn icon={<Play size={14} fill="currentColor" />} label="Avvia simulazione" tone="go" onClick={s.startSimulation} />
      )}
      {s.running && (
        <div className="ml-1 flex items-center gap-1.5 rounded-md bg-slate-950 px-2 py-1 font-mono text-[11px] text-emerald-300" title="Tempo simulato">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          t = {fmtTime(s.simTime)}
        </div>
      )}
      {s.running && (
        <select
          className="ml-1 h-7 rounded-md border border-slate-700 bg-slate-950 px-1 font-mono text-[11px] text-slate-200"
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
      <Btn
        icon={<ClipboardCheck size={15} />}
        label="Verifica impianto"
        onClick={() => s.setRightTab('norm')}
        active={s.rightTab === 'norm'}
      />
      <Btn
        icon={<FileDown size={15} />}
        label={exporting ? 'Esportazione…' : 'Esporta PDF'}
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
      <div className="flex-1" />
      <Btn icon={<Info size={15} />} label="Modello fisico" onClick={onInfo} />
      <AccountButton />
    </header>
  );
}
