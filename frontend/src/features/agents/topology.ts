import type { WorkflowDefinition } from '@/types/api';

export interface TopoNode { id: string; type: string; label: string; x: number; y: number }
export interface TopoEdge { id: string; from: string; to: string; kind: 'control' | 'data' }
export interface Topology { nodes: TopoNode[]; edges: TopoEdge[] }

export const AGENT_LABEL: Record<string, string> = {
  orchestrator: 'Orchestrator', planner: 'Planning', research: 'Research', execution: 'Execution',
  analysis: 'Analysis', validation: 'Validation', response: 'Output',
};

export const edgeId = (kind: string, from: string, to: string) => `${kind}:${from}->${to}`;

const N = (id: string, x: number, y: number): TopoNode => ({ id, type: id, label: AGENT_LABEL[id], x, y });

/** The built-in pipeline layout: orchestrator in the middle, agents around it. */
export const DEFAULT_TOPOLOGY: Topology = (() => {
  const nodes = [N('planner', 235, 0), N('research', 0, 170), N('execution', 470, 170), N('orchestrator', 230, 150), N('analysis', 235, 340), N('validation', 0, 510), N('response', 470, 510)];
  const data: [string, string][] = [['planner', 'research'], ['planner', 'execution'], ['research', 'analysis'], ['execution', 'analysis'], ['analysis', 'validation'], ['validation', 'response']];
  const control = ['planner', 'research', 'execution', 'analysis', 'validation', 'response'];
  return {
    nodes,
    edges: [
      ...data.map(([a, b]) => ({ id: edgeId('data', a, b), from: a, to: b, kind: 'data' as const })),
      ...control.map((t) => ({ id: edgeId('control', 'orchestrator', t), from: 'orchestrator', to: t, kind: 'control' as const })),
    ],
  };
})();

/** Topology for a saved workflow: its nodes/edges as authored, plus the orchestrator hub dispatching each node. */
export function topologyFromWorkflow(def: WorkflowDefinition): Topology {
  const xs = def.nodes.map((n) => n.position.x), ys = def.nodes.map((n) => n.position.y);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 300;
  const top = (ys.length ? Math.min(...ys) : 0) - 190;
  const nodes: TopoNode[] = [
    { id: 'orchestrator', type: 'orchestrator', label: 'Orchestrator', x: cx, y: top },
    ...def.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label || AGENT_LABEL[n.type] || n.type, x: n.position.x, y: n.position.y })),
  ];
  const edges: TopoEdge[] = [
    ...def.edges.map((e) => ({ id: edgeId('data', e.source, e.target), from: e.source, to: e.target, kind: 'data' as const })),
    ...def.nodes.map((n) => ({ id: edgeId('control', 'orchestrator', n.id), from: 'orchestrator', to: n.id, kind: 'control' as const })),
  ];
  return { nodes, edges };
}

/** Picks which node sides an edge should attach to, based on the relative position of its two nodes. */
export function pickHandles(a: { x: number; y: number }, b: { x: number; y: number }): [string, string] {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy) * 0.9) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}
