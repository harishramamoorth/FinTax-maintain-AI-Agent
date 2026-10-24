import type { TaskEvent } from '@/types/api';
import { authHeaders } from './api';

export type StreamState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed' | 'failed';
const TERMINAL = new Set(['task.completed', 'task.failed', 'task.cancelled']);

/** Parses one SSE block ("id:/event:/data:" lines) into a TaskEvent, or null for comments/keep-alives. */
export function parseSseBlock(block: string): TaskEvent | null {
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!data.length) return null;
  try { return JSON.parse(data.join('\n')) as TaskEvent; } catch { return null; }
}

interface Handlers { afterSeq?: number; onEvent(e: TaskEvent): void; onState(s: StreamState): void }

/**
 * Subscribes to a task's SSE stream using fetch (so the optional Authorization header can be sent).
 * Reconnects with exponential backoff and resumes via Last-Event-ID, so no event is lost or repeated.
 * Returns a function that closes the stream.
 */
export function streamTask(taskId: string, h: Handlers): () => void {
  const ctrl = new AbortController();
  let last = h.afterSeq ?? 0;
  let finished = false;

  (async () => {
    let attempts = 0;
    while (!ctrl.signal.aborted && !finished) {
      try {
        h.onState(attempts === 0 ? 'connecting' : 'reconnecting');
        const res = await fetch(`/api/tasks/${taskId}/stream`, {
          headers: { Accept: 'text/event-stream', 'Last-Event-ID': String(last), ...authHeaders() }, signal: ctrl.signal,
        });
        if (res.status === 401 || res.status === 404) { h.onState('failed'); return; }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        attempts = 0;
        h.onState('live');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
            const ev = parseSseBlock(block);
            if (ev) {
              if (ev.seq > last) last = ev.seq;
              h.onEvent(ev);
              if (TERMINAL.has(ev.type)) finished = true;
            }
          }
        }
        if (finished) { h.onState('closed'); return; }
        throw new Error('stream ended early');
      } catch {
        if (ctrl.signal.aborted) return;
        attempts += 1;
        if (attempts > 8) { h.onState('failed'); return; }
        await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempts)));
      }
    }
  })();

  return () => ctrl.abort();
}
