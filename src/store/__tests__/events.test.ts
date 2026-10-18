import { describe, expect, it } from 'vitest';
import { monolocale } from '../../projects/demos';
import { useStore } from '../projectStore';

describe('registro eventi durante i guasti', () => {
  it('cortocircuito L-N eliminato dal magnetico: niente allarmi permanenti sullo stato transitorio', () => {
    const s = useStore.getState();
    const p = monolocale();
    for (const c of p.components) if (c.params.kind !== 'load') c.closed = true;
    s.openProject(p);
    useStore.getState().startSimulation();
    const prese = useStore.getState().project.components.find((c) => c.params.kind === 'load' && c.params.p.name === 'Prese soggiorno')!;
    useStore.getState().toggleFault('short-LN', prese.id);

    const st = useStore.getState();
    const texts = st.events.map((e) => e.text);
    // l'intervento magnetico è registrato
    expect(texts.some((t) => t.includes('sganciatore magnetico'))).toBe(true);
    // i sintomi dei pochi millisecondi prima dell'intervento non devono comparire come allarmi
    expect(texts.some((t) => t.includes('morsetto di neutro dell\'apparecchio'))).toBe(false);
    expect(texts.some((t) => t.includes('fuori dall\'intervallo'))).toBe(false);
    // stato finale: nessun allarme di errore attivo
    expect(st.result && st.result.ok ? st.result.alerts.filter((a) => a.severity === 'errore') : []).toEqual([]);
  });
});
