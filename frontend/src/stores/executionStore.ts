import { create } from 'zustand';
import type { Task, TaskEvent, TaskStatus } from '@/types/api';
import type { StreamState } from '@/services/stream';
import { edgeId } from '@/features/agents/topology';

export type NodeStatus = 'idle' | 'active' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export type EdgeStatus = 'active' | 'done' | 'error';

export interface NodeState {
  status: NodeStatus; startedAt?: string; durationMs?: number; summary?: string; message?: string; tool?: string | null;
  error?: string; simulated?: boolean; toolRuns: number;
}

export interface ExecState {
  taskId: string | null; task: Task | null; status: 'idle' | TaskStatus; mode: 'live' | 'demo' | null;
  events: TaskEvent[]; lastSeq: number; seen: Record<number, true>;
  nodes: Record<string, NodeState>; edges: Record<string, EdgeStatus>; orchestrator: NodeStatus;
  progress: number; stream: StreamState; completionTick: number; error: string | null;
}

const blank = (): ExecState => ({
  taskId: null, task: null, status: 'idle', mode: null, events: [], lastSeq: 0, seen: {}, nodes: {}, edges: {}, orchestrator: 'idle',
  progress: 0, stream: 'idle', completionTick: 0, error: null,
});

const key = (e: TaskEvent) => e.node ?? e.agent ?? '';
const node = (s: ExecState, k: string): NodeState => s.nodes[k] ?? { status: 'idle', toolRuns: 0 };

/** Pure reducer: applies one backend event. Duplicate or stale events (seq already seen) are ignored. */
export function applyEvent(s: ExecState, e: TaskEvent): ExecState {
  if (s.seen[e.seq]) return s;
  const next: ExecState = { ...s, seen: { ...s.seen, [e.seq]: true }, events: [...s.events, e].sort((a, b) => a.seq - b.seq), lastSeq: Math.max(s.lastSeq, e.seq) };
  const nodes = { ...s.nodes };
  const edges = { ...s.edges };
  const k = key(e);
  const prog = typeof e.data?.progress === 'number' ? e.data.progress : undefined;
  if (prog !== undefined && prog > next.progress) next.progress = prog;

  switch (e.type) {
    case 'task.created':
      next.status = 'queued'; next.mode = e.data?.mode ?? s.mode; break;
    case 'task.started':
      next.status = 'running'; next.orchestrator = 'active'; break;
    case 'agent.handoff':
      for (const ed of (e.data?.edges ?? []) as { from: string; to: string; kind: string }[]) edges[edgeId(ed.kind, ed.from, ed.to)] = 'active';
      break;
    case 'agent.started':
      nodes[k] = { ...node(s, k), status: 'active', startedAt: e.created_at, simulated: e.simulated, message: e.message, toolRuns: 0, error: undefined };
      break;
    case 'agent.progress':
      nodes[k] = { ...node(s, k), message: e.message }; break;
    case 'tool.started':
      nodes[k] = { ...node(s, k), tool: e.tool, message: e.message }; break;
    case 'tool.completed':
    case 'tool.failed':
      nodes[k] = { ...node(s, k), tool: null, toolRuns: node(s, k).toolRuns + 1, message: e.message }; break;
    case 'agent.completed':
      nodes[k] = { ...node(s, k), status: 'completed', durationMs: e.data?.duration_ms, summary: e.data?.summary, tool: null, message: e.message };
      for (const id of Object.keys(edges)) if (id.endsWith(`->${k}`) && edges[id] === 'active') edges[id] = 'done';
      break;
    case 'agent.failed':
      nodes[k] = { ...node(s, k), status: 'failed', durationMs: e.data?.duration_ms, error: e.message, tool: null };
      for (const id of Object.keys(edges)) if (id.endsWith(`->${k}`) && edges[id] === 'active') edges[id] = 'error';
      break;
    case 'task.completed':
      next.status = 'completed'; next.orchestrator = 'completed'; next.progress = 100; next.completionTick = s.completionTick + 1;
      for (const id of Object.keys(edges)) if (edges[id] === 'active') edges[id] = 'done';
      for (const nk of Object.keys(nodes)) if (nodes[nk].status === 'active') nodes[nk] = { ...nodes[nk], status: 'completed', tool: null };
      break;
    case 'task.failed':
      next.status = 'failed'; next.orchestrator = 'failed'; next.error = e.message;
      for (const nk of Object.keys(nodes)) if (nodes[nk].status === 'active') nodes[nk] = { ...nodes[nk], status: 'failed', error: e.message, tool: null };
      for (const id of Object.keys(edges)) if (edges[id] === 'active') edges[id] = 'error';
      break;
    case 'task.cancelled':
      next.status = 'cancelled'; next.orchestrator = 'cancelled';
      for (const nk of Object.keys(nodes)) if (nodes[nk].status === 'active') nodes[nk] = { ...nodes[nk], status: 'cancelled', tool: null };
      for (const id of Object.keys(edges)) if (edges[id] === 'active') delete edges[id];
      break;
  }
  next.nodes = nodes; next.edges = edges;
  return next;
}

/** Marks nodes that never ran as skipped once a task completes (so they stop looking pending). */
export function nodeStatusFor(s: ExecState, id: string): NodeStatus {
  if (id === 'orchestrator') return s.orchestrator;
  const n = s.nodes[id];
  if (n) return n.status;
  return s.status === 'completed' ? 'skipped' : 'idle';
}

interface Actions {
  begin(task: Task | { id: string; mode?: 'live' | 'demo' }): void;
  setTask(t: Task): void; setStream(s: StreamState): void; push(e: TaskEvent): void; reset(): void;
}

export const useExecutionStore = create<ExecState & Actions>((set) => ({
  ...blank(),
  begin: (t) => set({ ...blank(), taskId: t.id, mode: t.mode ?? null, status: 'queued', task: 'prompt' in t ? (t as Task) : null }),
  setTask: (task) => set((s) => (s.taskId === task.id ? { task, mode: task.mode } : s)),
  setStream: (stream) => set({ stream }),
  push: (e) => set((s) => (s.taskId === e.task_id ? applyEvent(s, e) : s)),
  reset: () => set(blank()),
}));

export const activeAgentCount = (s: ExecState) => Object.values(s.nodes).filter((n) => n.status === 'active').length;
