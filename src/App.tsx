import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { LayoutGrid, Network, PanelLeftOpen, Play, SlidersHorizontal, Square, X } from 'lucide-react';
import { SchemaView } from './diagram/SchemaView';
import { Canvas } from './editor/Canvas';
import { useStore } from './store/projectStore';
import { useAccount } from './cloud/account';
import { CatalogPanel } from './ui/CatalogPanel';
import { Dashboard } from './ui/Dashboard';
import { InfoDialog, OpenDialog, Toasts } from './ui/Dialogs';
import { CatalogInfoDialog } from './ui/InfoPanel';
import { AcademyView } from './ui/Academy';
import { PvDesignView } from './ui/PvDesignView';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { TopBar } from './ui/TopBar';
import { EmptyProject, LabGuide } from './ui/LabGuide';

const TICK_S = 0.1;

/** Schermo ampio: catalogo e proprietà affiancati allo schema; più stretto, diventano pannelli a scomparsa. */
function useWide(): boolean {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function App() {
  const [openDlg, setOpenDlg] = useState(false);
  const wide = useWide();
  const [drawer, setDrawer] = useState<'catalog' | 'props' | null>(null);
  const hasSelection = useStore((s) => s.selection !== null);
  const componentCount = useStore((s) => s.project.components.length);
  // Su schermi stretti: dopo aver aggiunto un componente il catalogo si chiude e mostra lo schema.
  useEffect(() => setDrawer((d) => (d === 'catalog' ? null : d)), [componentCount]);
  useEffect(() => {
    if (wide) setDrawer(null);
  }, [wide]);
  useEffect(() => {
    if (!drawer) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [drawer]);
  const [infoDlg, setInfoDlg] = useState(false);
  const running = useStore((s) => s.running);
  const mode = useStore((s) => s.mode);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  // Account: stato della sessione all'avvio; i progressi dell'Accademia si ricaricano quando cambia l'utente.
  const dataVersion = useAccount((s) => s.dataVersion);
  useEffect(() => {
    void useAccount.getState().init();
  }, []);

  // Orologio della simulazione (tempo virtuale per il registro eventi).
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => useStore.getState().tick(TICK_S), TICK_S * 1000);
    return () => clearInterval(h);
  }, [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const s = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        s.removeSelection();
      } else if (e.key === 'Escape') {
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <TopBar onOpen={() => setOpenDlg(true)} onInfo={() => setInfoDlg(true)} />
      {mode === 'academy' ? (
        <AcademyView key={dataVersion} />
      ) : mode === 'pv' ? (
        <PvDesignView key={dataVersion} />
      ) : (
      <div className="relative flex min-h-0 flex-1">
        {wide && <CatalogPanel />}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/60 px-2 py-1 [scrollbar-width:none]">
            {!wide && (
              <button
                onClick={() => setDrawer('catalog')}
                title="Catalogo componenti"
                className="mr-1 flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.75rem] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <PanelLeftOpen size={14} /> <span className="hidden min-[420px]:inline">Catalogo</span>
              </button>
            )}
            {(['quadro', 'schema'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.75rem] font-semibold ${view === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {v === 'quadro' ? <LayoutGrid size={13} /> : <Network size={13} />}
                <span className={wide || view === v ? 'inline' : 'hidden min-[420px]:inline'}>{v === 'quadro' ? 'Quadro' : wide ? 'Schema unifilare' : 'Schema'}</span>
              </button>
            ))}
            {!wide && (
              <button
                onClick={() => (running ? useStore.getState().stopSimulation() : useStore.getState().startSimulation())}
                className={`ml-auto flex items-center gap-1 rounded px-2.5 py-1 text-[0.75rem] font-semibold text-white ${running ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                title={running ? 'Interrompi simulazione' : 'Avvia simulazione'}
              >
                {running ? <Square size={11} fill='currentColor' /> : <Play size={12} fill='currentColor' />} {running ? 'Stop' : 'Avvia'}
              </button>
            )}
            {!wide && (
              <button
                onClick={() => setDrawer('props')}
                title={hasSelection ? 'Proprietà del componente' : 'Proprietà del progetto'}
                className="relative flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.75rem] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <SlidersHorizontal size={14} /> <span className="hidden min-[420px]:inline">{hasSelection ? 'Proprietà' : 'Progetto'}</span>
                {hasSelection && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}
              </button>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            <LabGuide />
            <EmptyProject
              onOpenExamples={() => setOpenDlg(true)}
              onOpenCatalog={() => (wide ? document.querySelector<HTMLInputElement>('aside input[placeholder^="Cerca"]')?.focus() : setDrawer('catalog'))}
            />
            {view === 'quadro' ? (
              <ReactFlowProvider>
                <Canvas />
              </ReactFlowProvider>
            ) : (
              <SchemaView />
            )}
          </div>
          <Dashboard />
        </main>
        {wide && <PropertiesPanel />}
        {!wide && drawer && (
          <div className="absolute inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label={drawer === 'catalog' ? 'Catalogo componenti' : 'Proprietà'}>
            <button className="pv-fade-in absolute inset-0 bg-slate-950/60" aria-label="Chiudi" onClick={() => setDrawer(null)} />
            <div className={`relative flex h-full max-w-[90vw] ${drawer === 'catalog' ? 'drawer-left' : 'drawer-right ml-auto'}`}>
              {drawer === 'catalog' ? <CatalogPanel className="w-[20rem] max-w-[90vw]" /> : <PropertiesPanel className="w-[22rem] max-w-[90vw]" />}
              <button
                onClick={() => setDrawer(null)}
                className={`absolute top-2 z-10 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:text-white ${drawer === 'catalog' ? 'right-2' : 'left-[-2.5rem]'}`}
                aria-label="Chiudi il pannello"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      )}
      {openDlg && <OpenDialog onClose={() => setOpenDlg(false)} />}
      {infoDlg && <InfoDialog onClose={() => setInfoDlg(false)} />}
      <CatalogInfoDialog />
      <Toasts />
    </div>
  );
}
