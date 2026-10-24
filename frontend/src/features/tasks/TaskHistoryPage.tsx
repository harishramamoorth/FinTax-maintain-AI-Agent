import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, History, RotateCcw, Search, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '@/services/api';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Input, Panel, Select, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/overlays';
import { ResultView } from '@/features/agents/ResultPanel';
import { EventRow } from '@/features/agents/ExecutionLog';
import { useDebounced } from '@/hooks/useDebounced';
import { useExecutionStore } from '@/stores/executionStore';
import { toast } from '@/stores/toastStore';
import { fmtDateTime, fmtDuration, truncate } from '@/utils/format';

function TaskDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const nav = useNavigate(); const qc = useQueryClient(); const begin = useExecutionStore((s) => s.begin);
  const task = useQuery({ queryKey: ['task', id], queryFn: () => api.task(id!), enabled: !!id, refetchInterval: (q) => (q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false) });
  const events = useQuery({ queryKey: ['task-events', id, task.data?.status], queryFn: () => api.taskEvents(id!), enabled: !!id });
  const retry = useMutation({ mutationFn: () => api.retryTask(id!), onSuccess: (t) => { begin(t); void qc.invalidateQueries({ queryKey: ['tasks'] }); nav('/workspace'); }, onError: (e) => toast.error('Could not retry', errorMessage(e)) });
  const cancel = useMutation({ mutationFn: () => api.cancelTask(id!), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['task', id] }); void qc.invalidateQueries({ queryKey: ['tasks'] }); }, onError: (e) => toast.error('Could not cancel', errorMessage(e)) });
  const t = task.data;
  return (
    <Drawer open={!!id} onClose={onClose} title={t ? <span className="flex items-center gap-2">Task <span className="font-mono text-xs text-faint">{t.id.slice(0, 8)}</span></span> : 'Task'}>
      {task.isLoading && <div className="p-5 space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-32" /></div>}
      {task.isError && <ErrorState message={errorMessage(task.error)} onRetry={() => task.refetch()} />}
      {t && (
        <div className="p-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={t.status} />{t.mode === 'demo' && <DemoBadge />}{t.retry_of && <Badge>retry of {t.retry_of.slice(0, 8)}</Badge>}{t.workflow_id && <Badge tone="violet">workflow run</Badge>}</div>
          <div><p className="text-xs text-faint mb-1">Prompt</p><p className="text-sm whitespace-pre-wrap break-words rounded-lg border hairline bg-bg/40 p-3">{t.prompt}</p></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[['Created', fmtDateTime(t.created_at)], ['Started', fmtDateTime(t.started_at)], ['Completed', fmtDateTime(t.completed_at)], ['Duration', fmtDuration(t.duration_ms)], ['Model calls', t.llm_calls], ['Tool calls', t.tool_calls]].map(([k, v]) => (
              <div key={String(k)}><dt className="text-xs text-faint">{k}</dt><dd className="num">{v}</dd></div>))}
          </dl>
          {t.status === 'completed' && <div><p className="text-xs text-faint mb-2">Final output</p><ResultView task={t} /></div>}
          {(t.status === 'failed' || t.status === 'cancelled') && t.error && <div role="alert" className="rounded-lg border border-bad/30 bg-bad/5 p-3"><p className="text-sm font-medium">{t.error.message}</p><p className="text-xs font-mono text-faint mt-1">{t.error.code}{t.error.agent ? ` · ${t.error.agent}` : ''}</p></div>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => { begin({ id: t.id, mode: t.mode }); nav('/workspace'); }}>Replay in workspace</Button>
            {(t.status === 'failed' || t.status === 'cancelled') && <Button size="sm" variant="primary" icon={<RotateCcw className="size-3.5" />} loading={retry.isPending} onClick={() => retry.mutate()}>Retry</Button>}
            {(t.status === 'queued' || t.status === 'running') && <Button size="sm" variant="danger" icon={<Square className="size-3.5" />} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</Button>}
          </div>
          <div><p className="text-xs text-faint mb-1">Execution events ({events.data?.length ?? 0})</p>
            {events.isLoading ? <Skeleton className="h-24" /> : <ul className="divide-y divide-ink/5 rounded-lg border hairline px-3">{events.data?.map((e) => <EventRow key={e.seq} e={e} verbose={false} />)}</ul>}</div>
        </div>
      )}
    </Drawer>
  );
}

export default function TaskHistoryPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [mode, setMode] = useState(''); const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim(), 300); const open = params.get('open');
  useEffect(() => setPage(1), [dq, status, mode]);
  const list = useQuery({ queryKey: ['tasks', dq, status, mode, page], queryFn: () => api.tasks({ q: dq, status, mode, page, page_size: 15 }), placeholderData: keepPreviousData, refetchInterval: 6000 });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1;
  const filtered = !!(dq || status || mode);
  return (
    <div className="p-3 sm:p-5 max-w-[1200px] mx-auto space-y-4">
      <Panel className="p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[14rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" aria-hidden /><Input aria-label="Search tasks" placeholder="Search prompts, results or task IDs" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Filter by status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['queued', 'running', 'completed', 'failed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Filter by mode" className="w-36" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Live + demo</option><option value="live">Live only</option><option value="demo">Demo only</option></Select>
      </Panel>
      <Panel className="overflow-hidden">
        {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.isLoading ? <div className="p-4 space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : list.data!.items.length === 0 ? <EmptyState icon={<History className="size-6" />} title={filtered ? 'No tasks match these filters' : 'No tasks yet'} body={filtered ? 'Try a different search or clear the filters.' : 'Tasks you run in the Agent Workspace are stored here with their full event history.'} action={filtered ? <Button onClick={() => { setQ(''); setStatus(''); setMode(''); }}>Clear filters</Button> : undefined} />
          : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead><tr className="text-left text-xs text-faint border-b hairline"><th className="px-4 py-2.5 font-medium">Task</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium">Created</th><th className="px-3 py-2.5 font-medium">Completed</th><th className="px-4 py-2.5 font-medium text-right">Duration</th></tr></thead>
              <tbody>{list.data!.items.map((t) => (
                <tr key={t.id} tabIndex={0} onClick={() => setParams({ open: t.id })} onKeyDown={(e) => e.key === 'Enter' && setParams({ open: t.id })} className="border-b hairline last:border-0 hover:bg-ink/5 cursor-pointer focus-visible:bg-ink/5">
                  <td className="px-4 py-3 max-w-[28rem]"><p className="truncate">{truncate(t.prompt, 100)}</p><p className="text-[11px] font-mono text-faint">{t.id.slice(0, 8)}{t.mode === 'demo' ? ' · demo' : ''}{t.retry_of ? ' · retry' : ''}</p></td>
                  <td className="px-3 py-3"><StatusBadge status={t.status} /></td><td className="px-3 py-3 text-muted num whitespace-nowrap">{fmtDateTime(t.created_at)}</td><td className="px-3 py-3 text-muted num whitespace-nowrap">{fmtDateTime(t.completed_at)}</td><td className="px-4 py-3 text-right num">{fmtDuration(t.duration_ms)}</td></tr>))}</tbody></table></div>
          )}
        {list.data && list.data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t hairline text-xs text-muted"><span className="num">{list.data.total} task{list.data.total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-1"><Button size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="size-4" />} /><span className="px-2 num">{page} / {pages}</span><Button size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="size-4" />} /></div></div>
        )}
      </Panel>
      <TaskDetail id={open} onClose={() => setParams({})} />
    </div>
  );
}
