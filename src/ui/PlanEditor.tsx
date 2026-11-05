import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { MousePointer2, Square, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { f, type PlantResult } from '../impianto/calc';
import { boardsOf, DEVICE_LABEL, newId, ROOM_LABEL, type DeviceKind, type Plant, type RoomType } from '../impianto/model';
import { applyPlan, planExtent, roomCounts, routes } from '../impianto/plan';
import { currentPlant, useImpianto } from '../impianto/store';
import { Field, NumberInput, Select, TextInput } from './fields';

/**
 * Planimetria del progetto: si disegnano i locali (rettangoli), si posizionano quadri e punti (luce, prese,
 * comandi, utilizzatori) e si assegnano alle linee. Dalle posizioni si stimano le lunghezze delle linee.
 */

type Tool = 'select' | 'room' | 'board' | DeviceKind;
type Sel = { t: 'room' | 'device'; id: string } | { t: 'board'; id: string } | null;

const PALETTE = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb923c', '#2dd4bf', '#f87171', '#818cf8', '#facc15', '#4ade80', '#e879f9'];
const SYMBOL: Record<DeviceKind, string> = { luce: '✕', presa: 'P', 'presa-16': 'P16', comando: 'C', 'presa-cee': 'CEE', emergenza: 'E', utilizzatore: 'U' };
const snap = (v: number, step = 0.25) => Math.round(v / step) * step;

export function PlanStep({ r }: { r: PlantResult }) {
  const p = useImpianto((s) => currentPlant(s));
  const up = useImpianto((s) => s.update);
  const [tool, setTool] = useState<Tool>('select');
  const [lineId, setLineId] = useState('');
  const [boardSel, setBoardSel] = useState('');
  const [sel, setSel] = useState<Sel>(null);
  const [scale, setScale] = useState(48);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drag = useRef<{ kind: 'room' | 'device' | 'board'; id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const ext = planExtent(p);
  const W = (ext.w + 2) * scale;
  const H = (ext.h + 2) * scale;
  const color = (id: string) => (id ? PALETTE[Math.max(0, p.lines.findIndex((l) => l.id === id)) % PALETTE.length]! : '#64748b');
  const tagOf = (id: string) => r.lines.find((x) => x.line.id === id)?.tag ?? '';
  const rs = useMemo(() => routes(p), [p]);
  const counts = useMemo(() => roomCounts(p), [p]);
  const boards = boardsOf(p);
  const setPlan = (fn: (pl: Plant['plan']) => Plant['plan']) => up((x) => ({ ...x, plan: fn(x.plan) }));

  const at = (e: RPointerEvent) => {
    const b = svg.current!.getBoundingClientRect();
    return { x: (e.clientX - b.left) / scale, y: (e.clientY - b.top) / scale };
  };

  const down = (e: RPointerEvent<SVGSVGElement>) => {
    const pt = at(e);
    if (tool === 'room') {
      setDraft({ x0: snap(pt.x, 0.5), y0: snap(pt.y, 0.5), x1: snap(pt.x, 0.5), y1: snap(pt.y, 0.5) });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'board') {
      setPlan((pl) => ({ ...pl, boards: { ...pl.boards, [boardSel]: { x: snap(pt.x), y: snap(pt.y) } } }));
      setSel({ t: 'board', id: boardSel });
      return;
    }
    if (tool !== 'select') {
      const d = { id: newId('d'), kind: tool, x: snap(pt.x), y: snap(pt.y), lineId };
      setPlan((pl) => ({ ...pl, devices: [...pl.devices, d] }));
      setSel({ t: 'device', id: d.id });
      return;
    }
    setSel(null);
  };

  const startDrag = (e: RPointerEvent, kind: 'room' | 'device' | 'board', id: string, x: number, y: number) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    const pt = at(e);
    drag.current = { kind, id, dx: pt.x - x, dy: pt.y - y, moved: false };
    setSel({ t: kind, id });
    svg.current?.setPointerCapture?.(e.pointerId);
  };

  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const pt = at(e);
    if (draft) return setDraft({ ...draft, x1: snap(pt.x, 0.5), y1: snap(pt.y, 0.5) });
    const d = drag.current;
    if (!d) return;
    const step = d.kind === 'room' ? 0.5 : 0.25;
    const x = Math.max(0, snap(pt.x - d.dx, step));
    const y = Math.max(0, snap(pt.y - d.dy, step));
    d.moved = true;
    setPlan((pl) =>
      d.kind === 'room'
        ? { ...pl, rooms: pl.rooms.map((r0) => (r0.id === d.id ? { ...r0, x, y } : r0)) }
        : d.kind === 'device'
          ? { ...pl, devices: pl.devices.map((d0) => (d0.id === d.id ? { ...d0, x, y } : d0)) }
          : { ...pl, boards: { ...pl.boards, [d.id]: { x, y } } },
    );
  };

  const upPtr = () => {
    if (draft) {
      const x = Math.min(draft.x0, draft.x1);
      const y = Math.min(draft.y0, draft.y1);
      const w = Math.abs(draft.x1 - draft.x0);
      const h = Math.abs(draft.y1 - draft.y0);
      if (w >= 1 && h >= 1) {
        const room = { id: newId('r'), name: `Locale ${p.plan.rooms.length + 1}`, type: 'camera' as RoomType, x, y, w, h };
        setPlan((pl) => ({ ...pl, rooms: [...pl.rooms, room] }));
        setSel({ t: 'room', id: room.id });
        setTool('select');
      }
      setDraft(null);
    }
    drag.current = null;
  };

  const remove = () => {
    if (!sel) return;
    if (sel.t === 'room') setPlan((pl) => ({ ...pl, rooms: pl.rooms.filter((x) => x.id !== sel.id) }));
    if (sel.t === 'device') setPlan((pl) => ({ ...pl, devices: pl.devices.filter((x) => x.id !== sel.id) }));
    if (sel.t === 'board' && sel.id) setPlan((pl) => ({ ...pl, boards: Object.fromEntries(Object.entries(pl.boards).filter(([k]) => k !== sel.id)) }));
    setSel(null);
  };

  const selRoom = sel?.t === 'room' ? p.plan.rooms.find((x) => x.id === sel.id) : undefined;
  const selDev = sel?.t === 'device' ? p.plan.devices.find((x) => x.id === sel.id) : undefined;
  const lineOpts = ['', ...p.lines.filter((l) => l.kind !== 'sottoquadro').map((l) => l.id)];
  const lineName = (id: string) => (id ? `${tagOf(id)} ${p.lines.find((l) => l.id === id)?.name ?? ''}` : 'non assegnato');
  const tools: [Tool, string][] = [
    ['select', 'Seleziona e sposta'],
    ['room', 'Disegna un locale'],
    ['board', 'Posiziona un quadro'],
    ...(Object.keys(DEVICE_LABEL) as DeviceKind[]).map((k) => [k, DEVICE_LABEL[k]] as [Tool, string]),
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[0.875rem] font-semibold text-slate-100">Planimetria</h2>
          <div className="flex items-center gap-1">
            <button aria-label="Riduci" onClick={() => setScale((s) => Math.max(20, s - 8))} className="rounded p-1.5 text-slate-300 hover:bg-slate-800">
              <ZoomOut size={15} />
            </button>
            <button aria-label="Ingrandisci" onClick={() => setScale((s) => Math.min(96, s + 8))} className="rounded p-1.5 text-slate-300 hover:bg-slate-800">
              <ZoomIn size={15} />
            </button>
          </div>
        </div>
        <p className="mb-3 text-[0.75rem] leading-snug text-slate-400">
          Disegna i locali trascinando, posiziona i quadri e i punti dell'impianto e assegnali alle linee. Il programma stima la lunghezza di ogni linea (percorso a L dal quadro, punto dopo punto, più le risalite) e riconosce le linee che arrivano in un bagno. Griglia da 0,5 m.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1">
            {tools.map(([k, label]) => (
              <button
                key={k}
                title={label}
                onClick={() => setTool(k)}
                aria-pressed={tool === k}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[0.71875rem] ${tool === k ? 'border-sky-500 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
              >
                {k === 'select' ? <MousePointer2 size={12} /> : k === 'room' ? <Square size={12} /> : k === 'board' ? <span className="font-mono text-[0.625rem]">Q</span> : <span className="font-mono text-[0.625rem]">{SYMBOL[k as DeviceKind]}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {tool !== 'select' && tool !== 'room' && tool !== 'board' && (
            <div className="w-[16rem]">
              <Field label="Linea dei nuovi punti">
                <Select value={lineId} options={lineOpts} format={lineName} onChange={setLineId} />
              </Field>
            </div>
          )}
          {tool === 'board' && (
            <div className="w-[14rem]">
              <Field label="Quadro da posizionare">
                <Select value={boardSel} options={boards.map((b) => b.id)} format={(v) => boards.find((b) => b.id === v)?.name ?? v} onChange={setBoardSel} />
              </Field>
            </div>
          )}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="max-h-[36rem] overflow-auto rounded-md bg-slate-950">
            <svg
              ref={svg}
              width={W}
              height={H}
              className={`block touch-none select-none ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={upPtr}
              onPointerLeave={upPtr}
              role="img"
              aria-label="Planimetria dell'impianto"
            >
              <defs>
                <pattern id="grid05" width={scale / 2} height={scale / 2} patternUnits="userSpaceOnUse">
                  <path d={`M ${scale / 2} 0 L 0 0 0 ${scale / 2}`} fill="none" stroke="#1e293b" strokeWidth={1} />
                </pattern>
              </defs>
              <rect width={W} height={H} fill="url(#grid05)" />
              {p.plan.rooms.map((rm) => (
                <g key={rm.id} onPointerDown={(e) => startDrag(e, 'room', rm.id, rm.x, rm.y)}>
                  <rect x={rm.x * scale} y={rm.y * scale} width={rm.w * scale} height={rm.h * scale} fill={rm.type === 'bagno' ? '#0c4a6e55' : '#0f172a'} stroke={sel?.t === 'room' && sel.id === rm.id ? '#38bdf8' : '#94a3b8'} strokeWidth={sel?.t === 'room' && sel.id === rm.id ? 2.5 : 1.5} />
                  <text x={rm.x * scale + 6} y={rm.y * scale + 15} fontSize={11} fill="#cbd5e1" fontWeight={600}>
                    {rm.name}
                  </text>
                  <text x={rm.x * scale + 6} y={rm.y * scale + 28} fontSize={9} fill="#64748b">
                    {f(rm.w * rm.h, 1)} m²
                  </text>
                </g>
              ))}
              {/* Percorsi stimati */}
              {rs.map((ro) => {
                const l = p.lines.find((x) => x.id === ro.lineId)!;
                const start = p.plan.boards[l.boardId] ?? p.plan.boards[''];
                if (!start || !ro.devices.length) return null;
                const pts = [start];
                const left = [...ro.devices];
                let cur = start;
                while (left.length) {
                  left.sort((a, b) => Math.abs(a.x - cur.x) + Math.abs(a.y - cur.y) - (Math.abs(b.x - cur.x) + Math.abs(b.y - cur.y)));
                  cur = left.shift()!;
                  pts.push(cur);
                }
                const d = pts.map((q, i) => (i === 0 ? `M${q.x * scale},${q.y * scale}` : `L${q.x * scale},${pts[i - 1]!.y * scale} L${q.x * scale},${q.y * scale}`)).join(' ');
                return <path key={ro.lineId} d={d} fill="none" stroke={color(ro.lineId)} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.6} pointerEvents="none" />;
              })}
              {Object.entries(p.plan.boards).map(([id, pos]) => (
                <g key={id || 'qg'} onPointerDown={(e) => startDrag(e, 'board', id, pos.x, pos.y)}>
                  <rect x={pos.x * scale - 12} y={pos.y * scale - 9} width={24} height={18} rx={2} fill="#0f172a" stroke={sel?.t === 'board' && sel.id === id ? '#38bdf8' : '#fbbf24'} strokeWidth={2} />
                  <text x={pos.x * scale} y={pos.y * scale + 4} fontSize={9} textAnchor="middle" fill="#fbbf24" fontWeight={700}>
                    {id ? (tagOf(id) || 'SQ') : 'QG'}
                  </text>
                </g>
              ))}
              {p.plan.devices.map((d) => (
                <g key={d.id} onPointerDown={(e) => startDrag(e, 'device', d.id, d.x, d.y)}>
                  <circle cx={d.x * scale} cy={d.y * scale} r={9} fill="#0f172a" stroke={sel?.t === 'device' && sel.id === d.id ? '#ffffff' : color(d.lineId)} strokeWidth={2} />
                  <text x={d.x * scale} y={d.y * scale + 3.5} fontSize={SYMBOL[d.kind].length > 1 ? 7 : 10} textAnchor="middle" fill={color(d.lineId)} fontWeight={700}>
                    {SYMBOL[d.kind]}
                  </text>
                </g>
              ))}
              {draft && (
                <rect
                  x={Math.min(draft.x0, draft.x1) * scale}
                  y={Math.min(draft.y0, draft.y1) * scale}
                  width={Math.abs(draft.x1 - draft.x0) * scale}
                  height={Math.abs(draft.y1 - draft.y0) * scale}
                  fill="#38bdf822"
                  stroke="#38bdf8"
                  strokeDasharray="4 3"
                />
              )}
            </svg>
          </div>
          <div className="space-y-3">
            {selRoom && (
              <div className="space-y-2 rounded-md bg-slate-950/50 p-3">
                <Field label="Nome del locale">
                  <TextInput value={selRoom.name} onChange={(v) => setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((x) => (x.id === selRoom.id ? { ...x, name: v } : x)) }))} />
                </Field>
                <Field label="Tipo">
                  <Select value={selRoom.type} options={Object.keys(ROOM_LABEL) as RoomType[]} format={(v) => ROOM_LABEL[v]} onChange={(v) => setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((x) => (x.id === selRoom.id ? { ...x, type: v } : x)) }))} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Larghezza">
                    <NumberInput value={selRoom.w} min={1} max={200} step={0.5} suffix="m" onChange={(v) => setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((x) => (x.id === selRoom.id ? { ...x, w: v } : x)) }))} />
                  </Field>
                  <Field label="Profondità">
                    <NumberInput value={selRoom.h} min={1} max={200} step={0.5} suffix="m" onChange={(v) => setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((x) => (x.id === selRoom.id ? { ...x, h: v } : x)) }))} />
                  </Field>
                </div>
              </div>
            )}
            {selDev && (
              <div className="space-y-2 rounded-md bg-slate-950/50 p-3">
                <Field label="Punto">
                  <Select value={selDev.kind} options={Object.keys(DEVICE_LABEL) as DeviceKind[]} format={(v) => DEVICE_LABEL[v]} onChange={(v) => setPlan((pl) => ({ ...pl, devices: pl.devices.map((x) => (x.id === selDev.id ? { ...x, kind: v } : x)) }))} />
                </Field>
                <Field label="Linea">
                  <Select value={selDev.lineId} options={lineOpts} format={lineName} onChange={(v) => setPlan((pl) => ({ ...pl, devices: pl.devices.map((x) => (x.id === selDev.id ? { ...x, lineId: v } : x)) }))} />
                </Field>
              </div>
            )}
            {sel && (
              <button onClick={remove} className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-[0.75rem] text-slate-300 hover:border-red-400 hover:text-red-300">
                <Trash2 size={13} /> Elimina {sel.t === 'room' ? 'il locale' : sel.t === 'device' ? 'il punto' : 'la posizione del quadro'}
              </button>
            )}
            {!sel && <p className="text-[0.71875rem] text-slate-500">Seleziona un locale o un punto per modificarlo; trascinalo per spostarlo.</p>}
            <Field label="Altezza dei locali (risalite ai punti luce)">
              <NumberInput value={p.plan.heightM} min={2} max={12} step={0.1} suffix="m" onChange={(v) => setPlan((pl) => ({ ...pl, heightM: v }))} />
            </Field>
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[0.875rem] font-semibold text-slate-100">Lunghezze stimate delle linee</h2>
          <button onClick={() => up((x) => applyPlan(x))} disabled={!rs.length} className="rounded-md bg-sky-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-sky-500 disabled:opacity-40">
            Usa le lunghezze e i bagni della planimetria
          </button>
        </div>
        {rs.length === 0 ? (
          <p className="text-[0.75rem] text-slate-500">Nessuna linea ha punti in planimetria.</p>
        ) : (
          <table className="w-full text-[0.75rem]">
            <thead className="text-left text-[0.65625rem] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="py-1 font-medium">Linea</th>
                <th className="py-1 font-medium">Punti</th>
                <th className="py-1 text-right font-medium">Stima</th>
                <th className="py-1 text-right font-medium">Nel progetto</th>
              </tr>
            </thead>
            <tbody>
              {rs.map((ro) => {
                const l = p.lines.find((x) => x.id === ro.lineId)!;
                return (
                  <tr key={ro.lineId} className="border-b border-slate-800/60">
                    <td className="py-1">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color(ro.lineId) }} />
                      <span className="font-mono text-slate-500">{tagOf(ro.lineId)}</span> {l.name}
                      {ro.bathroom && <span className="ml-1 text-[0.6875rem] text-sky-300">bagno</span>}
                    </td>
                    <td className="py-1 text-slate-400">{ro.devices.length || 'sottoquadro'}</td>
                    <td className="py-1 text-right font-mono">{ro.lengthM} m</td>
                    <td className={`py-1 text-right font-mono ${Math.abs(ro.lengthM - l.lengthM) > 2 ? 'text-amber-200' : 'text-slate-300'}`}>{f(l.lengthM, 0)} m</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {counts.length > 0 && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-1 text-[0.875rem] font-semibold text-slate-100">Punti per locale</h2>
          <p className="mb-3 text-[0.71875rem] leading-snug text-slate-400">Da confrontare con le dotazioni minime richieste dal livello dell'impianto (variante della CEI 64-8 successiva al 2007, non verificata qui).</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-[0.75rem]">
              <thead className="text-left text-[0.65625rem] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="py-1 font-medium">Locale</th>
                  <th className="py-1 text-right font-medium">m²</th>
                  {(Object.keys(DEVICE_LABEL) as DeviceKind[]).map((k) => (
                    <th key={k} className="py-1 text-right font-medium" title={DEVICE_LABEL[k]}>
                      {SYMBOL[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.room.id} className="border-b border-slate-800/60">
                    <td className="py-1">
                      {c.room.name} <span className="text-[0.6875rem] text-slate-500">{ROOM_LABEL[c.room.type]}</span>
                    </td>
                    <td className="py-1 text-right font-mono">{f(c.areaM2, 1)}</td>
                    {(Object.keys(DEVICE_LABEL) as DeviceKind[]).map((k) => (
                      <td key={k} className="py-1 text-right font-mono text-slate-300">
                        {c.counts[k] ?? '·'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
