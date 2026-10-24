import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { AgentNode, type AgentNodeData } from './AgentNode';
import { SignalEdge } from './SignalEdge';
import { pickHandles as sides, type Topology } from './topology';

const nodeTypes = { agent: AgentNode };
const edgeTypes = { signal: SignalEdge };
const W = 190, H = 80;

export function AgentCanvas({ topology, selectedId, onSelect }: { topology: Topology; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { nodes, edges } = useMemo(() => {
    const pos = new Map(topology.nodes.map((n) => [n.id, { x: n.x + W / 2, y: n.y + H / 2 }]));
    const nodes: Node[] = topology.nodes.map((n) => ({
      id: n.id, type: 'agent', position: { x: n.x, y: n.y }, draggable: false, connectable: false, selected: n.id === selectedId,
      data: { id: n.id, type: n.type, label: n.label } satisfies AgentNodeData,
    }));
    const edges: Edge[] = topology.edges.filter((e) => pos.has(e.from) && pos.has(e.to)).map((e) => {
      const [s, t] = sides(pos.get(e.from)!, pos.get(e.to)!);
      return { id: e.id, source: e.from, target: e.to, sourceHandle: `out-${s}`, targetHandle: `in-${t}`, type: 'signal', data: { kind: e.kind }, selectable: false, focusable: false, zIndex: e.kind === 'data' ? 2 : 1 };
    });
    return { nodes, edges };
  }, [topology, selectedId]);

  const sig = useMemo(() => topology.nodes.map((n) => `${n.id}@${n.x},${n.y}`).join('|'), [topology]);

  return (
    <ReactFlowProvider>
      <ReactFlow key={sig} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.14 }}
        minZoom={0.3} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnScroll={false} zoomOnScroll={false} preventScrolling={false}
        proOptions={{ hideAttribution: true }} onNodeClick={(_, n) => onSelect(n.id === selectedId ? null : n.id)} onPaneClick={() => onSelect(null)}
        aria-label="Agent network canvas">
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgb(var(--line) / .22)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
