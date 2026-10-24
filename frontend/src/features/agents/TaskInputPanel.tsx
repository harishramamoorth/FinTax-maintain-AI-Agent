import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '@/services/api';
import { useExecutionStore } from '@/stores/executionStore';
import { useUiStore } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import { Button, Field, Select, Switch, Textarea } from '@/components/ui/primitives';
import { useHealth, useSettings, useWorkflows } from '@/hooks/queries';

const EXAMPLES = ['What is 12 * (3 + 4) / 2?', 'What is the current date and time in UTC?', '{"agents": [1, 2, 3], "ok": true}'];

export function TaskInputPanel({ workflowId, onWorkflowChange }: { workflowId: string; onWorkflowChange: (id: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [web, setWeb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();
  const status = useExecutionStore((s) => s.status);
  const taskId = useExecutionStore((s) => s.taskId);
  const begin = useExecutionStore((s) => s.begin);
  const reset = useExecutionStore((s) => s.reset);
  const focusTick = useUiStore((s) => s.focusTick);
  const health = useHealth();
  const settings = useSettings();
  const workflows = useWorkflows();
  const max = settings.data?.limits.max_prompt_chars ?? 4000;
  const busy = status === 'queued' || status === 'running';

  useEffect(() => { if (focusTick) ref.current?.focus(); }, [focusTick]);

  const run = useMutation({
    mutationFn: () => api.createTask({ prompt: prompt.trim(), workflow_id: workflowId || null, allow_web_search: web }),
    onSuccess: (t) => { begin(t); setError(null); void qc.invalidateQueries({ queryKey: ['tasks'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => { const m = errorMessage(e); setError(m); toast.error('Could not start the task', m); },
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelTask(taskId!),
    onError: (e) => toast.error('Could not cancel', errorMessage(e)),
  });

  const submit = () => {
    const p = prompt.trim();
    if (!p) { setError('Describe what you want the agents to do.'); ref.current?.focus(); return; }
    if (p.length > max) { setError(`Keep the task under ${max} characters (currently ${p.length}).`); return; }
    setError(null); run.mutate();
  };

  return (
    <div className="px-4 pb-4 space-y-3">
      <Field label="Task" htmlFor="task-prompt" error={error}>
        <Textarea id="task-prompt" ref={ref} rows={4} value={prompt} maxLength={max + 500} disabled={busy} placeholder="e.g. What is 12 * (3 + 4)? Or ask about documents in your knowledge base."
          onChange={(e) => { setPrompt(e.target.value); if (error) setError(null); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !busy) submit(); }} aria-invalid={!!error} />
      </Field>
      <div className="flex flex-wrap gap-1.5" aria-label="Example tasks">
        {EXAMPLES.map((x) => <button key={x} disabled={busy} onClick={() => { setPrompt(x); setError(null); }} className="text-xs px-2 py-1 rounded-full border hairline text-muted hover:text-ink hover:border-cyan/40 disabled:opacity-40 max-w-full truncate">{x}</button>)}
      </div>
      {health.data?.mode === 'demo' && (
        <p className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-muted">
          Demo mode cannot answer general-knowledge questions. Configure an AI provider in{' '}
          <Link to="/settings" className="text-cyan underline underline-offset-2">Settings</Link>{' '}
          for real AI responses.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 items-end">
        <Field label="Run with" htmlFor="wf-select">
          <Select id="wf-select" value={workflowId} disabled={busy} onChange={(e) => onWorkflowChange(e.target.value)}>
            <option value="">Default pipeline</option>
            {workflows.data?.items.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-2 h-10 px-3 rounded-lg border hairline" title={health.data?.search_configured ? 'Allow the Research agent to call the web search tool' : 'Set SEARCH_API_KEY on the server to enable web search'}>
          <span className="text-[13px] text-ink/90">Web search</span>
          <Switch checked={web} onChange={setWeb} label="Allow web search" disabled={busy || !health.data?.search_configured} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {busy ? (
          <Button variant="danger" icon={<Square className="size-4" />} loading={cancel.isPending} onClick={() => cancel.mutate()} className="flex-1">Cancel run</Button>
        ) : (
          <Button variant="primary" icon={<Play className="size-4" />} loading={run.isPending} onClick={submit} className="flex-1">Run task</Button>
        )}
        <Button icon={<RotateCcw className="size-4" />} disabled={busy || status === 'idle'} onClick={() => { reset(); setPrompt(''); setError(null); }}>Reset</Button>
      </div>
      <p className="text-[11px] text-faint">Ctrl/⌘ + Enter to run · {prompt.length}/{max}</p>
    </div>
  );
}
