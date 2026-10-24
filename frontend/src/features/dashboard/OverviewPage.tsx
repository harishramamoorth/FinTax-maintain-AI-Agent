import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '@/services/api';
import { Button, DemoBadge, EmptyState, ErrorState, Panel, PanelHeader, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { EventRow } from '@/features/agents/ExecutionLog';
import { AGENT_LABEL } from '@/features/agents/topology';
import { useHealth } from '@/hooks/queries';
import { useUiStore } from '@/stores/uiStore';
import { fmtDuration, fmtPercent, timeAgo, truncate } from '@/utils/format';

function Stat({ label, value, icon: Icon, tone, hint }: { label: string; value: string | number; icon: typeof Activity; tone: string; hint?: string }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between"><p className="text-[13px] text-muted">{label}</p><Icon className={clsx('size-[18px]', tone)} aria-hidden /></div>
      <p className="mt-2 text-3xl font-semibold tracking-tight num">{value}</p>
      {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
    </Panel>
  );
}

export default function OverviewPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 8000 });
  const health = useHealth(); const nav = useNavigate(); const focus = useUiStore((s) => s.requestFocusInput);
  const d = q.data;
  if (q.isError) return <div className="p-6"><Panel><ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /></Panel></div>;
  const rate = d?.success_rate;
  const maxRuns = Math.max(1, ...Object.values(d?.agents ?? {}).map((a) => a.runs));
  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-[1400px] mx-auto">
      {health.data?.mode === 'demo' && (
        <div className="glass rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 border-warn/30"><DemoBadge /><p className="text-sm text-muted flex-1 min-w-[16rem]">No AI provider is configured, so model steps are simulated. Tools and stored data are real. Set <code className="font-mono text-ink">AI_API_KEY</code> on the server to go live.</p><Link to="/settings" className="text-sm text-cyan underline underline-offset-2">How to configure</Link></div>
      )}
      <section aria-label="Key metrics" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {q.isLoading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[116px] rounded-xl2" />) : (<>
          <Stat label="Total tasks" value={d!.total_tasks} icon={Activity} tone="text-blue" hint={d!.avg_duration_ms ? `avg ${fmtDuration(d!.avg_duration_ms)} per completed task` : 'no completed tasks yet'} />
          <Stat label="Completed" value={d!.completed} icon={CheckCircle2} tone="text-ok" hint={`Success rate ${fmtPercent(rate)}`} />
          <Stat label="Failed" value={d!.failed} icon={XCircle} tone="text-bad" hint={d!.cancelled ? `${d!.cancelled} cancelled` : undefined} />
          <Stat label="Running now" value={d!.running + d!.queued} icon={Loader2} tone="text-cyan" hint={d!.queued ? `${d!.queued} queued` : undefined} />
        </>)}
      </section>

      {d && d.total_tasks === 0 ? (
        <Panel><EmptyState icon={<PlayCircle className="size-6" />} title="No tasks yet" body="Run your first task to see agents light up and metrics fill in. Everything on this page is computed from stored runs."
          action={<Button variant="primary" onClick={() => { nav('/workspace'); focus(); }}>Run a task</Button>} /></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Recent executions" actions={<Link to="/tasks" className="text-xs text-cyan">View all</Link>} />
            <ul className="px-2 pb-2">{(d?.recent_tasks ?? []).map((t) => (
              <li key={t.id}><button onClick={() => nav(`/tasks?open=${t.id}`)} className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-ink/5">
                <div className="min-w-0 flex-1"><p className="text-sm truncate">{truncate(t.prompt, 90)}</p><p className="text-xs text-faint">{timeAgo(t.created_at)} · {fmtDuration(t.duration_ms)}{t.mode === 'demo' ? ' · demo' : ''}</p></div><StatusBadge status={t.status} />
              </button></li>))}
              {q.isLoading && <Skeleton className="h-40 m-2" />}
            </ul>
          </Panel>
          <div className="space-y-4">
            <Panel>
              <PanelHeader title="Agent activity" hint="Runs recorded across all tasks" />
              <ul className="px-4 pb-4 space-y-3">{Object.entries(d?.agents ?? {}).map(([k, a]) => (
                <li key={k}><div className="flex justify-between text-[13px]"><span>{AGENT_LABEL[k] ?? k}</span><span className="text-muted num">{a.runs} run{a.runs === 1 ? '' : 's'}{a.failed ? <span className="text-bad"> · {a.failed} failed</span> : null}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-ink/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue to-cyan" style={{ width: `${(a.runs / maxRuns) * 100}%` }} /></div></li>))}</ul>
            </Panel>
            <Panel>
              <PanelHeader title="Recent system events" />
              <div className="px-4 pb-3 max-h-72 overflow-y-auto">{d?.recent_events.length ? <ul className="divide-y divide-ink/5">{d.recent_events.map((e) => <EventRow key={e.id} e={e} verbose={false} />)}</ul> : <p className="text-sm text-muted pb-3">Nothing recorded yet.</p>}</div>
            </Panel>
          </div>
        </div>
      )}
      {d && <p className="text-xs text-faint text-center num">{d.documents} knowledge document{d.documents === 1 ? '' : 's'} · {d.workflows} saved workflow{d.workflows === 1 ? '' : 's'}</p>}
    </div>
  );
}
