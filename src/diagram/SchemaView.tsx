import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/projectStore';
import { buildSingleLine } from './singleLine';
import { PALETTES, SingleLineSvg } from './SingleLineSvg';

/** Vista "Schema unifilare": derivata dal progetto, sempre allineata ai collegamenti del quadro. */
export function SchemaView() {
  const project = useStore((s) => s.project);
  const result = useStore((s) => s.result);
  const running = useStore((s) => s.running);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setRightTab);
  const sl = useMemo(() => buildSingleLine(project), [project]);
  const [zoom, setZoom] = useState(1);

  if (!sl) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0b1120] p-8 text-center text-[13px] text-slate-400">
        Lo schema unifilare si genera a partire dal punto di fornitura: aggiungi una fornitura al progetto.
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto bg-[#0b1120]">
      <div className="sticky left-0 top-0 z-10 flex items-center gap-1 p-2">
        <button className="rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800" title="Riduci" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>
          <ZoomOut size={14} />
        </button>
        <button className="rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800" title="Ingrandisci" onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}>
          <ZoomIn size={14} />
        </button>
        <button className="rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800" title="100%" onClick={() => setZoom(1)}>
          <Maximize2 size={14} />
        </button>
        <span className="ml-1 font-mono text-[11px] text-slate-500">{Math.round(zoom * 100)}%</span>
        <span className="ml-3 text-[11px] text-slate-500">
          Clic su un simbolo per selezionare il componente. {running ? 'Correnti in tempo reale.' : 'Avvia la simulazione per vedere le correnti.'}
        </span>
      </div>
      <div className="px-4 pb-6" style={{ width: sl.width * zoom + 32 }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: sl.width, height: sl.height * zoom }}>
          <SingleLineSvg
            sl={sl}
            project={project}
            palette={PALETTES.dark}
            live={running ? result : null}
            selectedId={selection?.type === 'component' ? selection.id : null}
            onSelect={(id) => {
              select({ type: 'component', id });
              setTab('props');
            }}
          />
        </div>
      </div>
    </div>
  );
}
