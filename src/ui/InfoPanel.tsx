import { BookOpen, X } from 'lucide-react';
import { catalogItem } from '../model/catalog';
import { componentInfo } from '../model/componentInfo';
import { useStore } from '../store/projectStore';

/** Scheda didattica di un articolo del catalogo. */
export function ComponentInfoView({ catalogId }: { catalogId: string }) {
  const info = componentInfo(catalogId);
  const item = catalogItem(catalogId);
  if (!info) return <p className="p-4 text-[12px] text-slate-500">Scheda non disponibile.</p>;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[14px] font-semibold text-slate-100">{info.title}</div>
        <div className="mt-0.5 text-[12px] text-slate-400">
          {item.category}
          {item.mount === 'din' && item.defaults ? ` · ${item.modules} ${item.modules === 1 ? 'modulo' : 'moduli'} DIN` : ''}
        </div>
      </div>
      <p className="rounded-md border-l-2 border-amber-400 bg-amber-400/5 px-3 py-2 text-[12.5px] leading-relaxed text-slate-200">{info.summary}</p>
      {info.sections.map((s) => (
        <section key={s.title}>
          <h4 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300">{s.title}</h4>
          <p className="text-[12px] leading-relaxed text-slate-300">{s.text}</p>
        </section>
      ))}
    </div>
  );
}

/** Scheda del componente selezionato nel quadro. */
export function InfoTab() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const comp = selection?.type === 'component' ? project.components.find((c) => c.id === selection.id) : undefined;
  if (!comp) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center text-[12px] text-slate-500">
        <BookOpen size={22} />
        Seleziona un componente nel quadro per leggerne il funzionamento, oppure usa il pulsante «i» accanto a ogni articolo del catalogo.
      </div>
    );
  }
  return (
    <div className="p-4">
      <ComponentInfoView catalogId={comp.catalogId} />
    </div>
  );
}

/** Finestra con la scheda di un articolo del catalogo. */
export function CatalogInfoDialog() {
  const id = useStore((s) => s.infoItem);
  const close = useStore((s) => s.setInfoItem);
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" onMouseDown={() => close(null)}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex justify-end">
          <button className="rounded p-1 text-slate-400 hover:bg-slate-800" onClick={() => close(null)}>
            <X size={16} />
          </button>
        </div>
        <ComponentInfoView catalogId={id} />
      </div>
    </div>
  );
}
