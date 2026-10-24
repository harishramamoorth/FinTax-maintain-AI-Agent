import { describe, expect, it } from 'vitest';
import { applyEvent, nodeStatusFor, type ExecState } from './executionStore';
import type { TaskEvent } from '@/types/api';

const base = (): ExecState => ({ taskId: 't', task: null, status: 'queued', mode: 'demo', events: [], lastSeq: 0, seen: {}, nodes: {}, edges: {}, orchestrator: 'idle', progress: 0, stream: 'live', completionTick: 0, error: null });
let seq = 0;
const ev = (type: TaskEvent['type'], extra: Partial<TaskEvent> = {}): TaskEvent => ({ id: ++seq, task_id: 't', seq, type, agent: null, node: null, tool: null, message: type, data: {}, simulated: false, created_at: '2026-01-01T00:00:00Z', ...extra });
const run = (events: TaskEvent[]) => events.reduce(applyEvent, base());

describe('execution reducer', () => {
  it('activates the orchestrator and an agent, lighting edges from real handoff events', () => {
    seq = 0;
    const s = run([
      ev('task.created', { data: { mode: 'demo' } }), ev('task.started'),
      ev('agent.handoff', { agent: 'planner', node: 'planner', data: { edges: [{ from: 'orchestrator', to: 'planner', kind: 'control' }] } }),
      ev('agent.started', { agent: 'planner', node: 'planner', data: { progress: 5 } }),
    ]);
    expect(s.status).toBe('running');
    expect(s.orchestrator).toBe('active');
    expect(s.nodes.planner.status).toBe('active');
    expect(s.edges['control:orchestrator->planner']).toBe('active');
    expect(s.progress).toBe(5);
  });

  it('completes a node and turns its incoming active edges to done', () => {
    seq = 0;
    const s = run([
      ev('task.started'),
      ev('agent.handoff', { agent: 'analysis', node: 'analysis', data: { edges: [{ from: 'research', to: 'analysis', kind: 'data' }] } }),
      ev('agent.started', { agent: 'analysis', node: 'analysis' }),
      ev('agent.completed', { agent: 'analysis', node: 'analysis', data: { duration_ms: 12, summary: 'ok', progress: 60 } }),
    ]);
    expect(s.nodes.analysis).toMatchObject({ status: 'completed', durationMs: 12, summary: 'ok' });
    expect(s.edges['data:research->analysis']).toBe('done');
  });

  it('shows failures honestly and never marks the task completed', () => {
    seq = 0;
    const s = run([
      ev('task.started'),
      ev('agent.handoff', { agent: 'execution', node: 'execution', data: { edges: [{ from: 'planner', to: 'execution', kind: 'data' }] } }),
      ev('agent.started', { agent: 'execution', node: 'execution' }),
      ev('tool.started', { agent: 'execution', node: 'execution', tool: 'calculator' }),
      ev('tool.failed', { agent: 'execution', node: 'execution', tool: 'calculator' }),
      ev('agent.failed', { agent: 'execution', node: 'execution', message: 'boom' }),
      ev('task.failed', { message: 'boom' }),
    ]);
    expect(s.nodes.execution.status).toBe('failed');
    expect(s.edges['data:planner->execution']).toBe('error');
    expect(s.status).toBe('failed');
    expect(s.orchestrator).toBe('failed');
    expect(s.completionTick).toBe(0);
  });

  it('ignores duplicate events (replay after reconnect) without corrupting state', () => {
    seq = 0;
    const events = [ev('task.started'), ev('agent.started', { agent: 'planner', node: 'planner' }), ev('agent.completed', { agent: 'planner', node: 'planner' })];
    const once = run(events);
    const twice = [...events, ...events].reduce(applyEvent, base());
    expect(twice.events).toHaveLength(3);
    expect(twice.nodes.planner.status).toBe('completed');
    expect(twice.lastSeq).toBe(once.lastSeq);
  });

  it('orders out-of-order delivery by seq', () => {
    seq = 0;
    const a = ev('task.started'), b = ev('agent.started', { agent: 'planner', node: 'planner' });
    const s = [b, a].reduce(applyEvent, base());
    expect(s.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('marks never-run nodes as skipped on completion and bumps the completion tick', () => {
    seq = 0;
    const s = run([ev('task.started'), ev('agent.started', { agent: 'planner', node: 'planner' }), ev('agent.completed', { agent: 'planner', node: 'planner' }), ev('task.completed')]);
    expect(s.status).toBe('completed');
    expect(s.progress).toBe(100);
    expect(s.completionTick).toBe(1);
    expect(nodeStatusFor(s, 'research')).toBe('skipped');
    expect(nodeStatusFor(s, 'planner')).toBe('completed');
    expect(nodeStatusFor(s, 'orchestrator')).toBe('completed');
  });

  it('cancellation stops active nodes and clears active edges', () => {
    seq = 0;
    const s = run([ev('task.started'), ev('agent.handoff', { data: { edges: [{ from: 'orchestrator', to: 'planner', kind: 'control' }] } }), ev('agent.started', { agent: 'planner', node: 'planner' }), ev('task.cancelled')]);
    expect(s.nodes.planner.status).toBe('cancelled');
    expect(s.edges['control:orchestrator->planner']).toBeUndefined();
    expect(s.status).toBe('cancelled');
  });

  it('tracks tool activity on the node while a tool runs', () => {
    seq = 0;
    let s = run([ev('agent.started', { agent: 'research', node: 'research' }), ev('tool.started', { agent: 'research', node: 'research', tool: 'knowledge_search' })]);
    expect(s.nodes.research.tool).toBe('knowledge_search');
    s = applyEvent(s, ev('tool.completed', { agent: 'research', node: 'research', tool: 'knowledge_search' }));
    expect(s.nodes.research.tool).toBeNull();
    expect(s.nodes.research.toolRuns).toBe(1);
  });
});
