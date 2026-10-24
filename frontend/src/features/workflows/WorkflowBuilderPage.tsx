import { addEdge, Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type Connection, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FilePlus2, Play, Save, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '@/services/api';
import { Badge, Button, Field, Input, Panel, PanelHeader, ProgressBar, Select, StatusBadge, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { AgentNode, type AgentNodeData } from '@/features/agents/AgentNode';
import { AGENT_META } from '@/features/agents/meta';
import { AGENT_LABEL, pickHandles } from '@/features/agents/topology';
import { useWorkflows } from '@/hooks/queries';
import { useExecutionStore } from '@/stores/executionStore';
import { toast } from '@/stores/toastStore';
import type { ValidationResult, WorkflowDefinition, WorkflowMeta } from '@/types/api';

const nodeTypes = { agent: AgentNode };
const ORDER = ['planner', 'research', 'execution', 'analysis', 'validation', 'response'];
const defaultEdge = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(53 214 255)' }, style: { stroke: 'rgb(53 214 255 / .6)', strokeWidth: 1.8 } };

const mkNode = (n: { id: string; type: string; label?: string | null; position: { x: number; y: number }; config?: Record<string, any> }, noStatus: boolean): Node => ({
  id: n.id, type: 'agent', position: n.position, data: { id: n.id, type: n.type, label: n.label || AGENT_LABEL[n.type] || n.type, builder: true, noStatus, config: n.config ?? {} } satisfies AgentNodeData,
});

function Builder({ meta }: { meta: WorkflowMeta }) {
  const nav = useNavigate(); const qc = useQueryClient(); const workflows = useWorkflows();
  const begin = useExecutionStore((s) => s.begin);
  const activeTask = useExecutionStore((s) => s.taskId); const status = useExecutionStore((s) => s.status); const progress = useExecutionStore((s) => s.progress);
  const events = useExecutionStore((s) => s.events);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]); const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [wfId, setWfId] = useState<string | null>(null); const [name, setName] = useState('New workflow'); const [desc, setDesc] = useState('');
  const [selected, setSelected] = useState<string | null>(null); const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null); const [runOpen, setRunOpen] = useState(false); const [prompt, setPrompt] = useState(''); const [delOpen, setDelOpen] = useState(false);
  const [runTask, setRunTask] = useState<string | null>(null); const [jsonErr, setJsonErr] = useState<Record<string, string>>({});

  const showStatus = !!runTask && runTask === activeTask;
  useEffect(() => { setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, noStatus: !showStatus } }))); }, [showStatus, setNodes]);

  const load = useCallback((def: WorkflowDefinition) => {
    setNodes(def.nodes.map((n) => mkNode(n, true))); const pos = new Map(def.nodes.map((n) => [n.id, { x: n.position.x + 95, y: n.position.y + 40 }]));
    setEdges(def.edges.map((e, i) => {
      const [a, b] = pos.has(e.source) && pos.has(e.target) ? pickHandles(pos.get(e.source)!, pos.get(e.target)!) : ['right', 'left'];
      return { id: e.id || `e${i}-${e.source}-${e.target}`, source: e.source, target: e.target, sourceHandle: `out-${a}`, targetHandle: `in-${b}`, ...defaultEdge };
    }));
    setSelected(null); setResult(null); setDirty(false); setJsonErr({});
  }, [setNodes, setEdges]);
  useEffect(() => { if (!nodes.length && !wfId) load(meta.starter); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const definition = useMemo<WorkflowDefinition>(() => ({
    nodes: nodes.map((n) => ({ id: n.id, type: (n.data as AgentNodeData).type, label: (n.data as AgentNodeData).label, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, config: (n.data as AgentNodeData).config ?? {} })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }), [nodes, edges]);

  const touch = () => { setDirty(true); setResult(null); };
  const onConnect = useCallback((c: Connection) => { setEdges((es) => (es.some((e) => e.source === c.source && e.target === c.target) ? es : addEdge({ ...c, ...defaultEdge }, es))); touch(); }, [setEdges]);
  const isValid = useCallback((c: Edge | Connection) => c.source !== c.target, []);

  const addNode = (type: string) => {
    let i = 1; while (nodes.some((n) => n.id === `${type}-${i}`) || (i === 1 && nodes.some((n) => n.id === type))) i++;
    const id = i === 1 && !nodes.some((n) => n.id === type) ? type : `${type}-${i}`;
    setNodes((ns) => [...ns, mkNode({ id, type, position: { x: 60 + (ns.length % 5) * 40, y: 40 + ns.length * 50 }, config: type === 'execution' ? { tool: meta.tools_by_type.execution?.[0] } : {} }, !showStatus)]); touch(); setSelected(id);
  };
  const sel = nodes.find((n) => n.id === selected); const sd = sel?.data as AgentNodeData | undefined;
  const patch = (fn: (d: AgentNodeData) => AgentNodeData) => { setNodes((ns) => ns.map((n) => (n.id === selected ? { ...n, data: fn(n.data as AgentNodeData) } : n))); touch(); };
  const setCfg = (k: string, v: unknown) => patch((d) => { const c = { ...(d.config ?? {}) }; if (v === '' || v === undefined) delete c[k]; else c[k] = v; return { ...d, config: c }; });
  const removeNode = () => { setNodes((ns) => ns.filter((n) => n.id !== selected)); setEdges((es) => es.filter((e) => e.source !== selected && e.target !== selected)); setSelected(null); touch(); };

  const validate = useMutation({ mutationFn: () => api.validateWorkflow(definition), onSuccess: (r) => { setResult(r); r.valid ? toast.success('Workflow is valid', `Execution order: ${r.order.join(' → ')}`) : toast.error('Workflow has problems', `${r.issues.length} issue(s)`); }, onError: (e) => toast.error('Validation failed', errorMessage(e)) });
  const save = useMutation({
    mutationFn: async () => { const b = { name: name.trim() || 'Untitled', description: desc, definition }; return wfId ? api.updateWorkflow(wfId, b) : api.createWorkflow(b); },
    onSuccess: (w) => { setWfId(w.id); setDirty(false); void qc.invalidateQueries({ queryKey: ['workflows'] }); toast.success('Workflow saved', `Version ${w.version}`); },
    onError: (e) => { const m = errorMessage(e); toast.error('Could not save', m); if ((e as any)?.details) setResult({ valid: false, issues: (e as any).details, order: [] }); },
  });
  const del = useMutation({ mutationFn: () => api.deleteWorkflow(wfId!), onSuccess: () => { toast.success('Workflow deleted'); setWfId(null); setDelOpen(false); setName('New workflow'); load(meta.starter); void qc.invalidateQueries({ queryKey: ['workflows'] }); }, onError: (e) => toast.error('Could not delete', errorMessage(e)) });
  const run = useMutation({
    mutationFn: async () => { let id = wfId; if (!id || dirty) { const w = await save.mutateAsync(); id = w.id; } return api.executeWorkflow(id!, { prompt: prompt.trim() }); },
    onSuccess: (t) => { setRunOpen(false); setRunTask(t.id); begin(t); toast.info('Workflow started'); },
    onError: (e) => toast.error('Could not run workflow', errorMessage(e)),
  });
  const issueIds = new Set((result?.issues ?? []).map((i) => i.node).filter(Boolean));
  const tools = sd ? meta.tools_by_type[sd.type] : undefined;
  const toolInputText = sd?.config?.tool_input !== undefined ? JSON.stringify(sd.config.tool_input, null, 2) : '';
  const exampleInput = sd?.config?.tool ? Object.keys(meta.tool_schemas[sd.config.tool]?.properties ?? {}).join(', ') : '';

  return (
    <div className="p-3 sm:p-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]">
      <Panel className="lg:col-span-2 p-3 flex flex-wrap items-end gap-3">
        <div className="w-52"><Field label="Saved workflows" htmlFor="wf-load"><Select id="wf-load" value={wfId ?? ''} onChange={(e) => { const w = workflows.data?.items.find((x) => x.id === e.target.value); if (w) { setWfId(w.id); setName(w.name); setDesc(w.description); load(w.definition); } else { setWfId(null); setName('New workflow'); setDesc(''); load(meta.starter); } }}><option value="">New (starter template)</option>{workflows.data?.items.map((w) => <option key={w.id} value={w.id}>{w.name} · v{w.version}</option>)}</Select></Field></div>
        <div className="flex-1 min-w-[12rem]"><Field label="Name" htmlFor="wf-name"><Input id="wf-name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></Field></div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<FilePlus2 className="size-4" />} onClick={() => { setWfId(null); setName('New workflow'); setDesc(''); setNodes([]); setEdges([]); setSelected(null); setResult(null); setDirty(false); }}>Blank</Button>
          <Button icon={<ShieldCheck className="size-4" />} loading={validate.isPending} onClick={() => validate.mutate()}>Validate</Button>
          <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>{dirty || !wfId ? 'Save' : 'Saved'}</Button>
          <Button variant="primary" icon={<Play className="size-4" />} disabled={!nodes.length} onClick={() => setRunOpen(true)}>Run</Button>
          {wfId && <Button variant="danger" aria-label="Delete workflow" icon={<Trash2 className="size-4" />} onClick={() => setDelOpen(true)} />}
        </div>
      </Panel>

      <Panel className="relative overflow-hidden builder h-[480px] lg:h-auto">
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]" role="toolbar" aria-label="Add agent node">
          {ORDER.filter((t) => meta.node_types.includes(t)).map((t) => { const Icon = AGENT_META[t].icon; return <button key={t} onClick={() => addNode(t)} className="glass rounded-lg px-2.5 h-8 text-xs flex items-center gap-1.5 hover:border-cyan/50"><Icon className="size-3.5 text-cyan" aria-hidden />+ {AGENT_LABEL[t]}</button>; })}
        </div>
        <ReactFlow nodes={nodes.map((n) => ({ ...n, className: issueIds.has(n.id) ? 'outline outline-2 outline-bad/70 rounded-2xl' : undefined }))} edges={edges} nodeTypes={nodeTypes} onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === 'position' || x.type === 'remove')) touch(); }} onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === 'remove')) touch(); }}
          onConnect={onConnect} isValidConnection={isValid} onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.3} maxZoom={1.5} deleteKeyCode={['Backspace', 'Delete']} proOptions={{ hideAttribution: true }} aria-label="Workflow canvas">
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgb(var(--line) / .22)" /><Controls showInteractive={false} /><MiniMap pannable zoomable maskColor="rgb(4 6 12 / .55)" nodeColor="#35d6ff" nodeStrokeWidth={0} style={{ background: "rgb(var(--bg2))" }} className="!hidden md:!block" />
        </ReactFlow>
        {!nodes.length && <p className="absolute inset-0 grid place-items-center text-sm text-muted pointer-events-none">Add agent nodes from the toolbar, then drag between handles to connect them.</p>}
      </Panel>

      <div className="flex flex-col gap-3 lg:overflow-y-auto min-h-0">
        <Panel>
          <PanelHeader title={sd ? `Configure: ${sd.label}` : 'Node settings'} hint={sd ? AGENT_META[sd.type]?.blurb : 'Select a node to edit it. Press Delete to remove the selection.'} />
          {sd && (
            <div className="px-4 pb-4 space-y-3">
              <Field label="Label" htmlFor="n-label"><Input id="n-label" value={sd.label} maxLength={80} onChange={(e) => patch((d) => ({ ...d, label: e.target.value }))} /></Field>
              {tools && (<>
                <Field label="Tool" htmlFor="n-tool" hint={sd.type === 'execution' ? 'Required.' : 'Defaults to knowledge search.'}><Select id="n-tool" value={sd.config?.tool ?? ''} onChange={(e) => setCfg('tool', e.target.value)}><option value="">{sd.type === 'execution' ? 'Choose a tool…' : 'Default'}</option>{tools.map((t) => <option key={t}>{t}</option>)}</Select></Field>
                {sd.config?.tool && <Field label="Tool input (JSON)" htmlFor="n-in" error={jsonErr[sd.id]} hint={`Optional. Fields: ${exampleInput}. Blank = derive from the task prompt.`}><Textarea id="n-in" rows={4} className="font-mono text-xs" defaultValue={toolInputText} key={`${sd.id}-${sd.config.tool}`} onBlur={(e) => { const v = e.target.value.trim(); if (!v) { setJsonErr((x) => ({ ...x, [sd.id]: '' })); setCfg('tool_input', undefined); return; } try { const j = JSON.parse(v); if (typeof j !== 'object' || Array.isArray(j) || !j) throw new Error(); setJsonErr((x) => ({ ...x, [sd.id]: '' })); setCfg('tool_input', j); } catch { setJsonErr((x) => ({ ...x, [sd.id]: 'Enter a valid JSON object.' })); } }} /></Field>}
              </>)}
              {['planner', 'analysis', 'response'].includes(sd.type) && <Field label="Extra instruction" htmlFor="n-ins" hint="Appended to the agent's system prompt (max 500 characters)."><Textarea id="n-ins" rows={3} maxLength={500} value={sd.config?.instruction ?? ''} onChange={(e) => setCfg('instruction', e.target.value)} /></Field>}
              {['planner', 'analysis', 'validation', 'response'].includes(sd.type) && <Field label="Model override" htmlFor="n-model" hint="Blank = use the agent default."><Input id="n-model" value={sd.config?.model ?? ''} maxLength={120} onChange={(e) => setCfg('model', e.target.value)} /></Field>}
              <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={removeNode}>Remove node</Button>
            </div>)}
        </Panel>
        {result && (
          <Panel role="status"><PanelHeader title={result.valid ? 'Valid workflow' : `${result.issues.length} problem${result.issues.length === 1 ? '' : 's'}`} actions={result.valid ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-bad" />} />
            <div className="px-4 pb-4 text-sm">{result.valid ? <p className="text-muted">Runs in order: <span className="font-mono text-xs">{result.order.join(' → ')}</span>. The server re-validates before every run.</p> : <ul className="space-y-1.5">{result.issues.map((i, k) => <li key={k} className="text-bad">{i.message}{i.node && <button className="ml-1 text-xs underline" onClick={() => setSelected(i.node!)}>go to node</button>}</li>)}</ul>}</div></Panel>)}
        {runTask && runTask === activeTask && (
          <Panel><PanelHeader title="Latest run" actions={<StatusBadge status={status === 'idle' ? 'queued' : status} />} />
            <div className="px-4 pb-4 space-y-2"><ProgressBar value={progress} active={status === 'running'} /><ul className="text-xs text-muted space-y-0.5 max-h-28 overflow-y-auto">{events.filter((e) => e.type.startsWith('agent.') && e.type !== 'agent.progress' && e.type !== 'agent.handoff').slice(-6).map((e) => <li key={e.seq}>{e.message}</li>)}</ul>
              <Button size="sm" onClick={() => nav('/workspace')}>Open in workspace</Button></div></Panel>)}
        <p className="text-[11px] text-faint px-1">Rules: one entry node, one final Response node, no cycles, every node reachable. Execution nodes need a tool. <Badge className="ml-1">server-validated</Badge></p>
      </div>

      <Modal open={runOpen} onClose={() => setRunOpen(false)} title="Run workflow" footer={<><Button onClick={() => setRunOpen(false)}>Cancel</Button><Button variant="primary" disabled={!prompt.trim()} loading={run.isPending} onClick={() => run.mutate()}>{dirty || !wfId ? 'Save & run' : 'Run'}</Button></>}>
        <Field label="Task prompt" htmlFor="wf-prompt" hint={dirty || !wfId ? 'Unsaved changes are saved first.' : undefined}><Textarea id="wf-prompt" rows={4} value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} autoFocus /></Field>
      </Modal>
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={() => del.mutate()} loading={del.isPending} title="Delete this workflow?" body="The saved definition and its versions are removed. Past runs keep their own snapshot." />
    </div>
  );
}

export default function WorkflowBuilderPage() {
  const meta = useQuery({ queryKey: ['workflow-meta'], queryFn: api.workflowMeta, staleTime: Infinity });
  if (meta.isLoading) return <div className="p-6"><p className="text-sm text-muted">Loading builder…</p></div>;
  if (meta.isError || !meta.data) return <div className="p-6"><Panel className="p-6 text-sm text-bad">{errorMessage(meta.error)}</Panel></div>;
  return <ReactFlowProvider><Builder meta={meta.data} /></ReactFlowProvider>;
}
