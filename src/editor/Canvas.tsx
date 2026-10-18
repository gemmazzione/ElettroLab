import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { catalogItem } from '../model/catalog';
import { DEVICE_H, MODULE_W, PANEL_PAD_X, panelSize, railTop } from '../model/geometry';
import { componentHeight, componentWidth, parseTerminalId, railYOffset } from '../model/terminals';
import type { ComponentInstance, PanelDef } from '../model/types';
import { useStore } from '../store/projectStore';
import { edgeTypes } from './edges/WireEdge';
import { Instruments } from '../ui/Instruments';
import { nodeTypes, type CompNodeData } from './nodes/nodes';

export const DND_MIME = 'application/x-electrolab-catalog';

function nodeType(c: ComponentInstance): string {
  if (catalogItem(c.catalogId).mount === 'din') return 'din';
  return c.params.kind;
}

function toNode(c: ComponentInstance, selected: boolean, draggable: boolean): Node {
  const pos = c.rail ? { x: c.position.x, y: c.position.y + railYOffset(c) } : c.position;
  return {
    id: c.id,
    type: nodeType(c),
    position: pos,
    data: { componentId: c.id } satisfies CompNodeData,
    selected,
    draggable,
    width: componentWidth(c),
    height: componentHeight(c),
  };
}

/** Un quadro con le sue guide DIN, disegnato nelle coordinate dell'area di lavoro. */
function PanelShape({ panel, title, main }: { panel: PanelDef; title: string; main: boolean }) {
  const { w, h } = panelSize(panel);
  const railW = panel.modulesPerRow * MODULE_W;
  return (
    <g transform={`translate(${panel.origin.x} ${panel.origin.y})`}>
      <rect x={0} y={0} width={w} height={h} rx={10} fill="#1b2230" stroke={main ? '#3b4659' : '#475a75'} strokeWidth={2} />
      <rect x={8} y={8} width={w - 16} height={h - 16} rx={6} fill="none" stroke="#2a3446" strokeDasharray="4 6" />
      <text x={20} y={30} fontSize={13} fontWeight={600} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
        {title}
      </text>
      <text x={20} y={47} fontSize={10.5} fill="#64748b" fontFamily="ui-monospace, monospace">
        {panel.modulesPerRow * panel.rows} moduli · {panel.rows} {panel.rows === 1 ? 'guida' : 'guide'} DIN da {panel.modulesPerRow}
      </text>
      {Array.from({ length: panel.rows }, (_, r) => {
        const cy = railTop(r) + DEVICE_H / 2;
        return (
          <g key={r}>
            <rect x={PANEL_PAD_X - 14} y={cy - 32} width={railW + 28} height={64} rx={2} fill="#4b5563" stroke="#6b7280" />
            <rect x={PANEL_PAD_X - 14} y={cy - 24} width={railW + 28} height={48} fill="#3a414c" />
            {Array.from({ length: Math.floor((railW + 28) / 26) }, (_, k) => (
              <rect key={k} x={PANEL_PAD_X - 6 + k * 26} y={cy - 4} width={14} height={8} rx={3} fill="#1f242c" />
            ))}
            {Array.from({ length: panel.modulesPerRow }, (_, m) => (
              <text
                key={m}
                x={PANEL_PAD_X + m * MODULE_W + MODULE_W / 2}
                y={railTop(r) - 8}
                textAnchor="middle"
                fontSize={8}
                fill="#475569"
                fontFamily="ui-monospace, monospace"
              >
                {m + 1}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** Quadri e guide DIN: strato sotto nodi e conduttori, allineato al viewport. */
function PanelBackdrop() {
  const { x, y, zoom } = useViewport();
  const panels = useStore((s) => s.project.panels);
  const name = useStore((s) => s.project.name);
  const bottom = Math.max(...panels.map((p) => p.origin.y + panelSize(p).h));
  const left = Math.min(...panels.map((p) => p.origin.x));
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }}>
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {panels.map((p, i) => (
          <PanelShape key={p.id} panel={p} main={i === 0} title={panels.length > 1 ? p.name : name} />
        ))}
        <text x={left} y={bottom + 40} fontSize={11} fill="#475569" fontFamily="ui-sans-serif, system-ui">
          ▼ Zona utilizzatori (condutture in partenza dai quadri)
        </text>
      </g>
    </svg>
  );
}

export function Canvas() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const wiringMode = useStore((s) => s.wiringMode);
  const tool = useStore((s) => s.tool);
  const setClampTarget = useStore((s) => s.setClampTarget);
  const select = useStore((s) => s.select);
  const moveComponent = useStore((s) => s.moveComponent);
  const connect = useStore((s) => s.connect);
  const addComponent = useStore((s) => s.addComponent);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    setNodes(
      project.components.map((c) => toNode(c, selection?.type === 'component' && selection.id === c.id, !wiringMode && tool === 'select')),
    );
  }, [project, selection, wiringMode, tool]);

  const edges: Edge[] = useMemo(
    () =>
      project.wires.map((w) => {
        const a = parseTerminalId(w.from);
        const b = parseTerminalId(w.to);
        return {
          id: w.id,
          type: 'wire',
          source: a.componentId,
          sourceHandle: a.key,
          target: b.componentId,
          targetHandle: b.key,
          data: { wireId: w.id },
          selected: selection?.type === 'wire' && selection.id === w.id,
        };
      }),
    [project.wires, selection],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Solo spostamenti e misure sono applicati localmente; la selezione è gestita dallo store.
    const local = changes.filter((c) => c.type === 'position' || c.type === 'dimensions');
    if (local.length) setNodes((ns) => applyNodeChanges(local, ns));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      const c = useStore.getState().project.components.find((x) => x.id === node.id);
      if (!c) return;
      moveComponent(node.id, { x: node.position.x, y: node.position.y - railYOffset(c) });
    },
    [moveComponent],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.sourceHandle || !conn.targetHandle) return;
      connect(`${conn.source}:${conn.sourceHandle}`, `${conn.target}:${conn.targetHandle}`);
    },
    [connect],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DND_MIME);
      if (!id) return;
      const item = catalogItem(id);
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const w = item.mount === 'din' ? item.modules * MODULE_W : 170;
      const h = item.mount === 'din' ? DEVICE_H : 120;
      addComponent(id, { x: p.x - w / 2, y: p.y - h / 2 });
    },
    [addComponent, screenToFlowPosition],
  );

  return (
    <div
      className="relative h-full w-full"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, n) => {
          const c = project.components.find((x) => x.id === n.id);
          if (tool === 'clamp' && c?.params.kind === 'load') setClampTarget({ kind: 'line', id: n.id });
          else select({ type: 'component', id: n.id });
        }}
        onEdgeClick={(_, e) => {
          if (tool === 'clamp') setClampTarget({ kind: 'wire', id: e.id });
          else select({ type: 'wire', id: e.id });
        }}
        onPaneClick={() => select(null)}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={14}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        nodesConnectable={tool === 'select'}
        elementsSelectable
        minZoom={0.2}
        maxZoom={3}
        defaultViewport={{ x: 380, y: 60, zoom: 0.8 }}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#263043" />
        <PanelBackdrop />
        <Controls showInteractive={false} position="bottom-left" />
        <Instruments />
        <MiniMap pannable zoomable position="bottom-right" nodeColor="#64748b" maskColor="rgba(2,6,23,0.7)" style={{ width: 160, height: 110 }} />
      </ReactFlow>
    </div>
  );
}
