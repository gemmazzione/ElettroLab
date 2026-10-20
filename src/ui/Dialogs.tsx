import { Copy, CopyPlus, Download, FileJson, FlaskConical, FolderOpen, Library, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { MODEL_ASSUMPTIONS } from '../model/constants';
import { PROTECTION_ASSUMPTIONS } from '../protection/curves';
import { copyProject, duplicateSaved, exportLibraryFile, importIntoLibrary, listLibrary, removeSaved, renameSaved, summarizeProject, type LibraryEntry, type ProjectSummary } from '../persistence/library';
import { exportProjectFile, saveProject } from '../persistence/storage';
import { DEMO_PROJECTS } from '../projects/demos';
import { useStore } from '../store/projectStore';
import { useAccount } from '../cloud/account';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" onMouseDown={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-slate-800 px-5 py-3">
          <h2 className="text-[14px] font-semibold text-slate-100">{title}</h2>
          <button className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-800" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

type SortKey = 'recenti' | 'nome';

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-300">{children}</span>;
}

function SummaryChips({ s }: { s: ProjectSummary }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Chip>{s.phases === 3 ? 'Trifase' : s.phases === 1 ? 'Monofase' : 'Senza fornitura'}</Chip>
      {s.contractKW !== null && <Chip>{s.contractKW.toLocaleString('it-IT')} kW</Chip>}
      <Chip>{s.circuits} circuiti</Chip>
      <Chip>{s.devices} dispositivi</Chip>
      {s.panels > 1 && <Chip>{s.panels} quadri</Chip>}
      <Chip>
        {s.modulesUsed}/{s.modulesTotal} moduli
      </Chip>
    </div>
  );
}

/** Libreria progetti: salvati nel browser, predefiniti, import/esportazione. */
export function OpenDialog({ onClose }: { onClose: () => void }) {
  const accountUser = useAccount((s) => (s.phase === 'signed-in' ? s.user : null));
  const openProject = useStore((s) => s.openProject);
  const project = useStore((s) => s.project);
  const toast = useStore((s) => s.toast);
  const [entries, setEntries] = useState<LibraryEntry[]>(() => listLibrary());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recenti');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setEntries(listLibrary());

  const q = query.trim().toLowerCase();
  const shown = entries
    .filter((e) => !q || `${e.project.name} ${e.project.description}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === 'nome' ? a.project.name.localeCompare(b.project.name, 'it') : b.project.updatedAt.localeCompare(a.project.updatedAt)));

  return (
    <Modal title={accountUser ? `Libreria progetti · account ${accountUser.username}` : 'Libreria progetti (questo browser)'} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 focus-within:border-sky-500">
          <Search size={13} className="text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nei progetti salvati…" className="w-full bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-200">
          <option value="recenti">Più recenti</option>
          <option value="nome">Nome</option>
        </select>
        <button
          className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-sky-500"
          onClick={() => {
            const c = copyProject(project);
            if (saveProject(c)) {
              refresh();
              toast('info', `Salvata una copia: «${c.name}».`);
            }
          }}
          title="Salva il progetto aperto come nuovo progetto della libreria"
        >
          <CopyPlus size={13} /> Salva corrente come copia
        </button>
      </div>

      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">I miei progetti ({entries.length})</h3>
      <div className="mb-5 space-y-1.5">
        {shown.length === 0 && (
          <p className="text-[12px] text-slate-500">{entries.length ? 'Nessun progetto corrisponde alla ricerca.' : 'Nessun progetto salvato. Usa «Salva» nella barra superiore.'}</p>
        )}
        {shown.map(({ project: p, summary }) => (
          <div key={p.id} className="rounded-lg border border-slate-800 px-3 py-2 hover:border-slate-600">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {renaming === p.id ? (
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newName.trim()) renameSaved(p.id, newName.trim());
                      setRenaming(null);
                      refresh();
                    }}
                  >
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-[13px] text-slate-100" />
                    <button className="rounded bg-slate-700 px-2 text-[12px] text-slate-100">OK</button>
                  </form>
                ) : (
                  <button
                    className="block w-full text-left"
                    onClick={() => {
                      openProject(p);
                      onClose();
                    }}
                  >
                    <div className="truncate text-[13px] font-semibold text-slate-100">{p.name}</div>
                    <div className="text-[11px] text-slate-500">Modificato il {new Date(p.updatedAt).toLocaleString('it-IT')}</div>
                  </button>
                )}
                <SummaryChips s={summary} />
              </div>
              <div className="flex shrink-0 gap-0.5">
                <IconBtn title="Apri" onClick={() => (openProject(p), onClose())}>
                  <FolderOpen size={14} />
                </IconBtn>
                <IconBtn title="Duplica" onClick={() => (duplicateSaved(p.id), refresh())}>
                  <Copy size={14} />
                </IconBtn>
                <IconBtn title="Rinomina" onClick={() => (setRenaming(p.id), setNewName(p.name))}>
                  <Pencil size={14} />
                </IconBtn>
                <IconBtn title="Esporta file .json" onClick={() => exportProjectFile(p)}>
                  <Download size={14} />
                </IconBtn>
                <IconBtn
                  title="Elimina dal browser"
                  danger
                  onClick={() => {
                    if (window.confirm(`Eliminare definitivamente «${p.name}» dal browser?`)) {
                      removeSaved(p.id);
                      refresh();
                    }
                  }}
                >
                  <Trash2 size={14} />
                </IconBtn>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <FlaskConical size={13} /> Progetti predefiniti
      </h3>
      <div className="mb-5 grid grid-cols-1 gap-2 md:grid-cols-2">
        {DEMO_PROJECTS.map((d) => {
          const p = d.build();
          return (
            <button
              key={d.id}
              onClick={() => {
                openProject(p);
                onClose();
              }}
              className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-left hover:border-sky-500"
            >
              <div className="text-[13px] font-semibold text-slate-100">{d.name}</div>
              <div className="text-[11.5px] leading-snug text-slate-400">{d.summary}</div>
              <SummaryChips s={summarizeProject(p)} />
            </button>
          );
        })}
      </div>

      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <FileJson size={13} /> File
      </h3>
      <div className="flex flex-wrap gap-2">
        <button className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800" onClick={() => fileRef.current?.click()}>
          <Upload size={13} /> Importa progetto o libreria (.json)
        </button>
        <button className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800" onClick={() => exportProjectFile(project)}>
          <Download size={13} /> Esporta il progetto aperto
        </button>
        <button
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          disabled={!entries.length}
          onClick={() => {
            const n = exportLibraryFile();
            toast('info', `Esportata la libreria (${n} progetti).`);
          }}
        >
          <Library size={13} /> Esporta tutta la libreria
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = '';
            if (!file) return;
            try {
              const { imported } = importIntoLibrary(JSON.parse(await file.text()));
              refresh();
              if (imported.length === 1) {
                openProject(imported[0]!);
                onClose();
                toast('info', `Progetto «${imported[0]!.name}» importato nella libreria.`);
              } else toast('info', `Importati ${imported.length} progetti nella libreria.`);
            } catch (err) {
              toast('errore', `Importazione non riuscita: ${(err as Error).message}`);
            }
          }}
        />
      </div>
      <p className="mt-3 text-[11px] leading-snug text-slate-500">
        I progetti sono salvati nella memoria locale di questo browser: esporta la libreria per conservarli o trasferirli su un altro computer.
      </p>
    </Modal>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`rounded p-1.5 text-slate-400 ${danger ? 'hover:bg-red-950 hover:text-red-300' : 'hover:bg-slate-800 hover:text-slate-100'}`}>
      {children}
    </button>
  );
}

export function InfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Modello fisico e approssimazioni" onClose={onClose}>
      <div className="space-y-3">
        {[...MODEL_ASSUMPTIONS, ...PROTECTION_ASSUMPTIONS].map((a) => (
          <div key={a.title}>
            <div className="text-[12.5px] font-semibold text-slate-200">{a.title}</div>
            <div className="text-[12px] leading-relaxed text-slate-400">{a.text}</div>
          </div>
        ))}
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-[12px] leading-relaxed text-amber-200">
          ElectroLab è uno strumento didattico e di pre-verifica. Non sostituisce la progettazione, l'installazione e le verifiche eseguite da professionisti abilitati e non attesta la conformità di alcun impianto.
        </div>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-lg rounded-lg border px-4 py-2 text-[12.5px] shadow-xl ${t.level === 'errore' ? 'border-red-800 bg-red-950 text-red-200' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
