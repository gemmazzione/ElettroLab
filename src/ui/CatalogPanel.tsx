import { ChevronDown, ChevronRight, Info, Lock, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DND_MIME } from '../editor/Canvas';
import { exerciseById } from '../academy/exercises';
import { CATALOG, type CatalogCategory, type CatalogItem } from '../model/catalog';
import { useStore } from '../store/projectStore';

function ItemRow({ item }: { item: CatalogItem }) {
  const add = useStore((s) => s.addComponent);
  const showInfo = useStore((s) => s.setInfoItem);
  const disabled = !item.defaults && item.kind !== 'comb';
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, item.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => !disabled && add(item.id)}
      title={disabled ? item.unavailableReason : item.kind === 'comb' ? `${item.description}\n\nTrascinalo sul primo dispositivo della fila (oppure seleziona il dispositivo e fai doppio clic).` : `${item.description}\n\nTrascina sul quadro o fai doppio clic.`}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${
        disabled ? 'cursor-default text-slate-600' : 'cursor-grab text-slate-200 hover:bg-slate-800 active:cursor-grabbing'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <button
        className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-amber-300"
        title="Come funziona"
        onClick={(e) => {
          e.stopPropagation();
          showInfo(item.id);
        }}
      >
        <Info size={13} />
      </button>
      {disabled ? (
        <Lock size={12} className="shrink-0" />
      ) : (
        <>
          {item.mount === 'din' && (
            <span className="shrink-0 font-mono text-[10px] text-slate-500">{item.kind === 'comb' ? 'barra' : `${item.modules}M`}</span>
          )}
          <button
            className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 hover:bg-slate-700 hover:text-sky-300 group-hover:opacity-100"
            onClick={() => add(item.id)}
            title="Aggiungi"
          >
            <Plus size={13} />
          </button>
        </>
      )}
    </div>
  );
}

export function CatalogPanel() {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<CatalogCategory>>(new Set(['Altri dispositivi']));
  const exId = useStore((s) => s.exercise?.id);
  const materials = exId ? (exerciseById(exId)?.materials ?? null) : null;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const m = new Map<CatalogCategory, CatalogItem[]>();
    for (const it of CATALOG) {
      if (materials && !materials.includes(it.id)) continue;
      if (q && !`${it.name} ${it.category} ${it.description}`.toLowerCase().includes(q)) continue;
      m.set(it.category, [...(m.get(it.category) ?? []), it]);
    }
    return [...m.entries()];
  }, [query, materials]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/80">
      <div className="border-b border-slate-800 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Catalogo componenti</div>
        <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 focus-within:border-sky-500">
          <Search size={13} className="text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca dispositivo…"
            className="w-full bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map(([cat, items]) => {
          const isClosed = closed.has(cat) && !query;
          return (
            <div key={cat} className="mb-1">
              <button
                className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (n.has(cat)) n.delete(cat);
                    else n.add(cat);
                    return n;
                  })
                }
              >
                {isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                {cat}
              </button>
              {!isClosed && items.map((it) => <ItemRow key={it.id} item={it} />)}
            </div>
          );
        })}
        {materials && (
          <div className="mb-2 rounded-md border border-amber-700/50 bg-amber-950/30 p-2 text-[11px] leading-snug text-amber-200">
            {materials.length ? 'Materiali disponibili per l\'esercizio.' : 'In questo esercizio non servono nuovi componenti: lavora su quelli già presenti.'}
          </div>
        )}
        {groups.length === 0 && !materials && <div className="p-3 text-[12px] text-slate-500">Nessun componente trovato.</div>}
      </div>
      <div className="border-t border-slate-800 p-3 text-[10.5px] leading-snug text-slate-500">
        Trascina i dispositivi DIN sulle guide del quadro; gli utilizzatori e la fornitura si posizionano liberamente. Gli articoli con il lucchetto non sono ancora simulati.
      </div>
    </aside>
  );
}
