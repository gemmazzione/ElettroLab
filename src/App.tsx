import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { LayoutGrid, Network } from 'lucide-react';
import { SchemaView } from './diagram/SchemaView';
import { Canvas } from './editor/Canvas';
import { useStore } from './store/projectStore';
import { useAccount } from './cloud/account';
import { CatalogPanel } from './ui/CatalogPanel';
import { Dashboard } from './ui/Dashboard';
import { InfoDialog, OpenDialog, Toasts } from './ui/Dialogs';
import { CatalogInfoDialog } from './ui/InfoPanel';
import { AcademyView } from './ui/Academy';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { TopBar } from './ui/TopBar';

const TICK_S = 0.1;

export default function App() {
  const [openDlg, setOpenDlg] = useState(false);
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
      ) : (
      <div className="flex min-h-0 flex-1">
        <CatalogPanel />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900/60 px-2 py-1">
            {(['quadro', 'schema'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-semibold ${view === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {v === 'quadro' ? <LayoutGrid size={13} /> : <Network size={13} />}
                {v === 'quadro' ? 'Quadro' : 'Schema unifilare'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
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
        <PropertiesPanel />
      </div>
      )}
      {openDlg && <OpenDialog onClose={() => setOpenDlg(false)} />}
      {infoDlg && <InfoDialog onClose={() => setInfoDlg(false)} />}
      <CatalogInfoDialog />
      <Toasts />
    </div>
  );
}
