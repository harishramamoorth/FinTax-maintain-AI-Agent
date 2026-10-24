import { Network } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useExecutionStore } from '@/stores/executionStore';
import { Badge, DemoBadge, Panel, PanelHeader, ProgressBar, StatusBadge } from '@/components/ui/primitives';
import { useHealth, useWorkflows } from '@/hooks/queries';
import { AgentCanvas } from './AgentCanvas';
import { AgentDetail } from './AgentDetail';
import { ExecutionLog } from './ExecutionLog';
import { ResultPanel } from './ResultPanel';
import { TaskInputPanel } from './TaskInputPanel';
import { DEFAULT_TOPOLOGY, topologyFromWorkflow } from './topology';

export default function WorkspacePage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState('');
  const taskId = useExecutionStore((s) => s.taskId);
  const task = useExecutionStore((s) => s.task);
  const status = useExecutionStore((s) => s.status);
  const progress = useExecutionStore((s) => s.progress);
  const mode = useExecutionStore((s) => s.mode);
  const begin = useExecutionStore((s) => s.begin);
  const health = useHealth();
  const workflows = useWorkflows();
  const [tab, setTab] = useState<'result' | 'log'>('log');

  // Open a past task (?task=ID): the stream replays its stored events, so the canvas shows its real final state.
  const requested = params.get('task');
  useEffect(() => {
    if (requested && requested !== taskId) { begin({ id: requested }); setTab('result'); }
    if (requested) setParams({}, { replace: true });
  }, [requested]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (status === 'completed' || status === 'failed') setTab('result'); if (status === 'queued') setTab('log'); }, [status]);

  const topology = useMemo(() => {
    const snap = task?.workflow_snapshot;
    if (snap?.nodes?.length) return topologyFromWorkflow(snap);
    if (!taskId && workflowId) { const wf = workflows.data?.items.find((w) => w.id === workflowId); if (wf) return topologyFromWorkflow(wf.definition); }
    return DEFAULT_TOPOLOGY;
  }, [task?.workflow_snapshot, taskId, workflowId, workflows.data]);
  const selType = selected ? topology.nodes.find((n) => n.id === selected)?.type ?? null : null;
  useEffect(() => { setSelected(null); }, [taskId]);

  const demo = (mode ?? health.data?.mode) === 'demo';

  return (
    <div className="p-3 sm:p-4 grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Panel className="relative overflow-hidden h-[460px] min-h-[380px]" aria-label="Agent network">
        <div className="absolute left-4 top-3 z-10 flex items-center gap-2 pointer-events-none">
          {status === 'idle' ? <Badge>idle</Badge> : <StatusBadge status={status} />}
          {status === 'idle' && <span className="hidden sm:inline text-xs text-muted">Submit a task to light up the network</span>}
          {demo && <DemoBadge />}
        </div>
        <div className="absolute left-4 right-4 bottom-3 z-10 pointer-events-none" aria-hidden={status === 'idle'}>
          {status !== 'idle' && <div className="max-w-md mx-auto glass rounded-full px-4 py-2 flex items-center gap-3"><div className="flex-1"><ProgressBar value={progress} active={status === 'running'} tone={status === 'failed' ? 'bad' : status === 'completed' ? 'ok' : 'cyan'} /></div><span className="text-xs num text-muted w-9 text-right">{progress}%</span></div>}
        </div>
        <div className="absolute right-4 top-3 z-10 hidden xl:flex items-center gap-3 text-[11px] text-faint pointer-events-none">
          <span className="flex items-center gap-1.5"><span className="w-4 border-t border-cyan" />data handoff</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-violet" />orchestrator dispatch</span>
        </div>
        <AgentCanvas topology={topology} selectedId={selected} onSelect={setSelected} />
        <AgentDetail id={selected} type={selType} onClose={() => setSelected(null)} />
        {status === 'idle' && (
          <div className="absolute inset-x-0 bottom-14 grid place-items-center pointer-events-none"><p className="text-xs text-faint flex items-center gap-1.5"><Network className="size-3.5" />Click any node to inspect that agent</p></div>
        )}
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel><PanelHeader title="New task" hint={demo ? 'Demo mode: model output is simulated, tools are real.' : 'Runs on your configured AI provider.'} /><TaskInputPanel workflowId={workflowId} onWorkflowChange={setWorkflowId} /></Panel>
        <Panel className="flex flex-col min-h-[300px]">
          <div className="flex items-center gap-1 px-3 pt-3 border-b hairline" role="tablist">
            {(['result', 'log'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 pb-2.5 -mb-px text-sm border-b-2 transition-colors ${tab === t ? 'border-cyan text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{t === 'result' ? 'Result' : 'Execution log'}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pt-3" role="tabpanel">{tab === 'result' ? <ResultPanel /> : <ExecutionLog />}</div>
        </Panel>
      </div>
    </div>
  );
}
