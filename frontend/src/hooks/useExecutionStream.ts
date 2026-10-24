import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { streamTask } from '@/services/stream';
import { useExecutionStore } from '@/stores/executionStore';
import { toast } from '@/stores/toastStore';
import { truncate } from '@/utils/format';

/**
 * Keeps one SSE subscription open for the active task for as long as the app is mounted, so the canvas,
 * log and progress survive page navigation. Every UI change originates from a backend event.
 */
export function useExecutionStream() {
  const taskId = useExecutionStore((s) => s.taskId);
  const qc = useQueryClient();

  useEffect(() => {
    if (!taskId) return;
    const { push, setStream, setTask } = useExecutionStore.getState();
    let closed = false;
    const refreshTask = async () => {
      try {
        const t = await api.task(taskId);
        if (!closed) setTask(t);
        return t;
      } catch { return null; }
    };
    void refreshTask();
    const stop = streamTask(taskId, {
      onState: setStream,
      onEvent: (e) => {
        push(e);
        if (e.type === 'task.completed' || e.type === 'task.failed' || e.type === 'task.cancelled') {
          void refreshTask().then((t) => {
            if (!t) return;
            const label = truncate(t.prompt, 60);
            if (e.type === 'task.completed') toast.success('Task completed', label, true);
            else if (e.type === 'task.failed') toast.error('Task failed', t.error?.message ?? label, true);
            else toast.info('Task cancelled', label);
          });
          for (const k of ['dashboard', 'tasks', 'analytics', 'agents']) void qc.invalidateQueries({ queryKey: [k] });
        }
      },
    });
    return () => { closed = true; stop(); };
  }, [taskId, qc]);
}
