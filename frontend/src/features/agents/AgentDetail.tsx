import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useExecutionStore, nodeStatusFor } from '@/stores/executionStore';
import { useAgents } from '@/hooks/queries';
import { Badge, IconButton, StatusBadge } from '@/components/ui/primitives';
import { fmtDuration } from '@/utils/format';
import { AGENT_META } from './meta';
import { AGENT_LABEL } from './topology';
import { EventRow } from './ExecutionLog';

export function AgentDetail({ id, type, onClose }: { id: string | null; type: string | null; onClose: () => void }) {
  const status = useExecutionStore((s) => (id ? nodeStatusFor(s, id) : 'idle'));
  const ns = useExecutionStore((s) => (id ? s.nodes[id] : undefined));
  const events = useExecutionStore((s) => s.events);
  const agents = useAgents();
  const info = agents.data?.find((a) => a.key === type);
  const meta = type ? AGENT_META[type] : undefined;
  const mine = id ? events.filter((e) => (e.node ?? e.agent) === id && e.type !== 'agent.handoff') : [];
  const label = id ? AGENT_LABEL[id] ?? id : '';
  const tone = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'active' ? 'running' : 'queued';
  return (
    <AnimatePresence>
      {id && (
        <motion.aside key={id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}
          className="absolute right-3 top-3 bottom-3 w-[300px] max-w-[calc(100%-1.5rem)] glass bg-bg2/90 rounded-xl2 flex flex-col z-10" aria-label={`${label} details`}>
          <div className="flex items-start justify-between gap-2 p-4 pb-2">
            <div><p className="font-semibold">{label}</p><p className="text-xs text-muted mt-0.5">{info?.description ?? meta?.blurb}</p></div>
            <IconButton label="Close details" className="size-7" onClick={onClose}><X className="size-4" /></IconButton>
          </div>
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {status === 'idle' || status === 'skipped' || status === 'cancelled' ? <Badge>{status === 'idle' ? 'idle' : status}</Badge> : <StatusBadge status={tone} />}
            {ns?.durationMs !== undefined && <Badge>{fmtDuration(ns.durationMs)}</Badge>}
            {info && <Badge tone={info.uses_model ? 'violet' : 'neutral'}>{info.uses_model ? `model: ${info.effective_model}` : 'no model calls'}</Badge>}
            {ns?.simulated && <Badge tone="warn">simulated</Badge>}
          </div>
          {ns?.summary && <p className="px-4 pb-2 text-sm text-ink/90 break-words">{ns.summary}</p>}
          {ns?.error && <p className="px-4 pb-2 text-sm text-bad break-words" role="alert">{ns.error}</p>}
          <div className="px-4 py-2 border-t hairline text-xs text-faint">Events from this agent</div>
          <div className="flex-1 overflow-y-auto px-4">
            {mine.length ? <ul>{mine.map((e) => <EventRow key={e.seq} e={e} />)}</ul> : <p className="text-sm text-muted py-3">{status === 'skipped' ? 'The planner did not need this agent for this task.' : 'No activity yet.'}</p>}
          </div>
          {info && <div className="px-4 py-2 border-t hairline text-[11px] text-faint num">All-time: {info.stats.runs} runs · {info.stats.failed} failed{info.stats.avg_duration_ms ? ` · avg ${fmtDuration(info.stats.avg_duration_ms)}` : ''}</div>}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
