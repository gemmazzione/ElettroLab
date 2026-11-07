import { describe, expect, it } from 'vitest';
import { simulate } from '../../engine/simulate';
import { checkWiring } from '../../graph/erc';
import { catalogItem } from '../../model/catalog';
import { getPoles } from '../../model/terminals';
import { addLoad, line, ProjectBuilder, t } from '../../projects/demos';
import { advance } from '../stepper';

/** Fornitura monofase, magnetotermico 2P con blocco differenziale, un utilizzatore. */
function circuit(selective = false, idn = 30) {
  const b = new ProjectBuilder('Blocco differenziale', 1, 12);
  const cnt = b.add('supply-mono', { position: { x: -270, y: 40 } });
  const earth = b.add('earth', { position: { x: -250, y: 430 } });
  const q = b.add('mcb-blocco-2p', { rail: { row: 0, slot: 0 } }, (c) => {
    c.closed = true;
    if (c.params.kind === 'rcbo') c.params.p = { ...c.params.p, in: 25, idn, selective };
  });
  const xpe = b.add('bar-pe-8', { rail: { row: 0, slot: 5 } });
  const u = addLoad(b, { catalogId: 'load-generico', name: 'Carico', powerW: 2000, section: 4, length: 15 }, 0, 600, 1);
  b.wire(t(cnt, 'L'), t(q, 'p0_in'), 6, 5).wire(t(cnt, 'N'), t(q, 'p1_in'), 6, 5);
  b.wire(t(earth, 'PE'), t(xpe, 't0'), 6, 5);
  line(b, q, u, xpe, 1, 4);
  return { project: b.project, q, u };
}

describe('magnetotermico con blocco differenziale', () => {
  it('a catalogo, con entrambi i poli protetti (2P) e il neutro protetto (4P)', () => {
    expect(catalogItem('mcb-blocco-2p').kind).toBe('rcbo');
    const { q } = circuit();
    expect(getPoles(q).every((p) => p.protected)).toBe(true);
    const b = new ProjectBuilder('x', 1, 12);
    const q4 = b.add('mcb-blocco-4p', { rail: { row: 0, slot: 0 } });
    expect(getPoles(q4).filter((p) => p.protected).length).toBe(4);
  });

  it('cablaggio corretto e carico alimentato', () => {
    const { project, u } = circuit();
    expect(checkWiring(project).filter((i) => i.severity === 'errore')).toEqual([]);
    const r = simulate(project);
    if (!r.ok) throw new Error(r.reason);
    expect(r.loads.get(u.id)!.energized).toBe(true);
  });

  it('guasto a terra: interviene il blocco differenziale; il tipo S è ritardato', () => {
    const fast = circuit(false, 300);
    fast.project.faults = [{ id: 'g', type: 'L-PE', targetId: fast.u.id, resistance: 0 }];
    const o1 = advance(fast.project, {}, null, 1, 'settle');
    expect(o1.prot[fast.q.id]!.tripped).toBe('differenziale');

    const slow = circuit(true, 300);
    slow.project.faults = [{ id: 'g', type: 'L-PE', targetId: slow.u.id, resistance: 0 }];
    const o2 = advance(slow.project, {}, null, 1, 'settle');
    expect(o2.prot[slow.q.id]!.tripped).toBe('differenziale');
    expect(o2.elapsed).toBeGreaterThan(o1.elapsed);
  });
});
