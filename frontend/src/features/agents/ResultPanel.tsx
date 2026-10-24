import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, ExternalLink, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '@/services/api';
import { useExecutionStore } from '@/stores/executionStore';
import { toast } from '@/stores/toastStore';
import { Badge, Button, DemoBadge, ProgressBar } from '@/components/ui/primitives';
import { Markdown } from '@/components/ui/Markdown';
import { copyText, fmtDuration } from '@/utils/format';
import type { Task } from '@/types/api';

export function ResultView({ task }: { task: Task }) {
  const [copied, setCopied] = useState(false);
  const r = task.result_data;
  const v = r?.validation;
  const copy = async () => { if (task.result && await copyText(task.result)) { setCopied(true); toast.success('Result copied'); setTimeout(() => setCopied(false), 1600); } else toast.error('Copy failed'); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {task.mode === 'demo' && <DemoBadge />}
        {v && (v.passed ? <Badge tone="ok"><ShieldCheck className="size-3" />Validated · {Math.round(v.score * 100)}%</Badge> : <Badge tone="warn"><ShieldAlert className="size-3" />Validation flagged {v.issues.length} issue{v.issues.length === 1 ? '' : 's'}</Badge>)}
        <Badge>{fmtDuration(task.duration_ms)}</Badge>
        {task.tokens_used > 0 && <Badge>{task.tokens_used.toLocaleString()} tokens</Badge>}
        <Button size="sm" className="ml-auto" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copy} disabled={!task.result}>{copied ? 'Copied' : 'Copy result'}</Button>
      </div>
      {task.mode === 'demo' && (
        <p className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-muted">
          This is a simulated response, not a factual AI answer. Configure a provider in{' '}
          <Link to="/settings" className="text-cyan underline underline-offset-2">Settings</Link>{' '}
          for general questions.
        </p>
      )}
      {task.result && <div className="rounded-xl border hairline bg-bg/40 p-3"><Markdown text={task.result} /></div>}
      {v && !v.passed && v.issues.length > 0 && <ul className="text-xs text-warn list-disc pl-5 space-y-0.5">{v.issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
      {r?.warnings?.length ? <ul className="text-xs text-warn list-disc pl-5 space-y-0.5">{r.warnings.map((w, k) => <li key={k}>{w}</li>)}</ul> : null}
      {r?.sources?.length ? (
        <div><p className="text-xs text-faint mb-1">Sources (from real tool results)</p>
          <ul className="space-y-1">{r.sources.map((s, i) => <li key={i} className="text-sm">{s.type === 'web' && s.url ? <a className="text-cyan inline-flex items-center gap-1 underline underline-offset-2" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title || s.url}<ExternalLink className="size-3" /></a> : <span>{s.title} <span className="text-faint">· knowledge base</span></span>}</li>)}</ul></div>
      ) : null}
      {r?.observations?.length ? (
        <details className="text-xs text-muted"><summary className="cursor-pointer select-none">Tool calls ({r.observations.length})</summary>
          <ul className="mt-1.5 space-y-1">{r.observations.map((o, i) => <li key={i} className="font-mono">{o.ok ? '✓' : '✗'} {o.tool}{o.error ? ` — ${o.error}` : ''}</li>)}</ul></details>
      ) : null}
    </div>
  );
}

export function ResultPanel() {
  const status = useExecutionStore((s) => s.status);
  const task = useExecutionStore((s) => s.task);
  const progress = useExecutionStore((s) => s.progress);
  const error = useExecutionStore((s) => s.error);
  const begin = useExecutionStore((s) => s.begin);
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retryTask(task!.id),
    onSuccess: (t) => { begin(t); void qc.invalidateQueries({ queryKey: ['tasks'] }); toast.info('Retrying task'); },
    onError: (e) => toast.error('Could not retry', errorMessage(e)),
  });

  if (status === 'idle') return <p className="px-4 pb-6 pt-1 text-sm text-muted">The final answer appears here once the Output agent finishes.</p>;
  if (status === 'queued' || status === 'running') return (
    <div className="px-4 pb-5 space-y-2" aria-live="polite"><p className="text-sm text-muted">{status === 'queued' ? 'Queued…' : 'Agents are working…'}</p><ProgressBar value={progress} active /><p className="text-xs text-faint num">{progress}%</p></div>
  );
  if (status === 'failed' || status === 'cancelled') {
    const err = task?.error;
    return (
      <div role="alert" className="px-4 pb-5 space-y-3">
        <div className="flex gap-2 items-start"><AlertTriangle className={`size-4 mt-0.5 ${status === 'failed' ? 'text-bad' : 'text-warn'}`} /><div>
          <p className="text-sm font-medium">{status === 'failed' ? 'The task failed' : 'The task was cancelled'}</p>
          <p className="text-sm text-muted break-words">{err?.message ?? error ?? 'No further details.'}</p>
          {err?.code && <p className="text-[11px] font-mono text-faint mt-1">{err.code}{err.agent ? ` · ${err.agent}` : ''}</p>}
        </div></div>
        <Button size="sm" icon={<RotateCcw className="size-3.5" />} disabled={!task} loading={retry.isPending} onClick={() => retry.mutate()}>Retry task</Button>
      </div>
    );
  }
  return <div className="px-4 pb-5">{task ? <ResultView task={task} /> : <p className="text-sm text-muted">Loading result…</p>}</div>;
}
