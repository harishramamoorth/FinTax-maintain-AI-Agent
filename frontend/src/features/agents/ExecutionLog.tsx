import clsx from 'clsx';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, CircleDot, Cog, Flag, Play, Wrench, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { useUiStore } from '@/stores/uiStore';
import { fmtTime } from '@/utils/format';
import type { EventType, TaskEvent } from '@/types/api';
import { AGENT_LABEL } from './topology';

const STYLE: Record<EventType, { icon: typeof Play; cls: string }> = {
  'task.created': { icon: Flag, cls: 'text-muted' }, 'task.started': { icon: Play, cls: 'text-violet' }, 'task.completed': { icon: CheckCircle2, cls: 'text-ok' },
  'task.failed': { icon: XCircle, cls: 'text-bad' }, 'task.cancelled': { icon: XCircle, cls: 'text-warn' }, 'agent.started': { icon: CircleDot, cls: 'text-cyan' },
  'agent.progress': { icon: Cog, cls: 'text-faint' }, 'agent.handoff': { icon: ArrowRightLeft, cls: 'text-violet' }, 'agent.completed': { icon: CheckCircle2, cls: 'text-ok' },
  'agent.failed': { icon: AlertTriangle, cls: 'text-bad' }, 'tool.started': { icon: Wrench, cls: 'text-blue' }, 'tool.completed': { icon: Wrench, cls: 'text-ok' }, 'tool.failed': { icon: Wrench, cls: 'text-bad' },
};

export function EventRow({ e, verbose = true }: { e: TaskEvent; verbose?: boolean }) {
  const { icon: Icon, cls } = STYLE[e.type] ?? STYLE['agent.progress'];
  const who = e.node ?? e.agent;
  return (
    <li className="flex gap-2.5 py-1.5 text-[12.5px] leading-snug">
      <Icon className={clsx('size-3.5 mt-0.5 shrink-0', cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="break-words">
          <span className={clsx(e.type.endsWith('failed') && 'text-bad')}>{e.message || e.type}</span>
          {e.simulated && <span className="ml-1.5 text-[10px] px-1 rounded border border-warn/30 text-warn align-middle">simulated</span>}
        </p>
        <p className="text-[11px] text-faint font-mono num">
          {fmtTime(e.created_at)} · {e.type}{who ? ` · ${AGENT_LABEL[who] ?? who}` : ''}{e.tool ? ` · ${e.tool}` : ''}
          {typeof e.data?.duration_ms === 'number' ? ` · ${e.data.duration_ms} ms` : ''}
        </p>
        {verbose && e.type === 'tool.completed' && e.data?.output && (
          <pre className="mt-1 max-h-24 overflow-auto rounded bg-bg/60 border hairline p-1.5 font-mono text-[11px] text-muted whitespace-pre-wrap break-all">{JSON.stringify(e.data.output, null, 1).slice(0, 500)}</pre>
        )}
      </div>
    </li>
  );
}

export function ExecutionLog() {
  const events = useExecutionStore((s) => s.events);
  const stream = useExecutionStore((s) => s.stream);
  const verbosity = useUiStore((s) => s.verbosity);
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const shown = verbosity === 'verbose' ? events : events.filter((e) => e.type !== 'agent.handoff' && !(e.type === 'agent.progress' && e.data?.stage === 'model_call'));

  useEffect(() => { const el = ref.current; if (el && pinned) el.scrollTop = el.scrollHeight; }, [shown.length, pinned]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div ref={ref} onScroll={(e) => { const el = e.currentTarget; setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }} className="flex-1 overflow-y-auto px-4" role="log" aria-live="off" aria-label="Execution log">
        {shown.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">Events appear here as the backend executes a task.</p>
        ) : <ul className="divide-y divide-ink/5">{shown.map((e) => <EventRow key={e.seq} e={e} verbose={verbosity === 'verbose'} />)}</ul>}
      </div>
      <div className="px-4 py-2 border-t hairline text-[11px] text-faint flex justify-between">
        <span>{shown.length} event{shown.length === 1 ? '' : 's'}</span>
        <span className={clsx(stream === 'live' && 'text-ok', stream === 'reconnecting' && 'text-warn', stream === 'failed' && 'text-bad')}>
          {stream === 'idle' ? 'no active stream' : stream === 'closed' ? 'stream closed' : `stream ${stream}`}
        </span>
      </div>
    </div>
  );
}
