import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; title: string; body?: string }
export interface Notice { id: number; kind: ToastKind; title: string; body?: string; at: number; read: boolean }

let n = 1;
interface ToastState {
  toasts: Toast[]; notices: Notice[];
  push(kind: ToastKind, title: string, body?: string, opts?: { notify?: boolean }): void;
  dismiss(id: number): void; markAllRead(): void; clearNotices(): void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [], notices: [],
  push: (kind, title, body, opts) => {
    const id = n++;
    set((s) => ({
      toasts: [...s.toasts.slice(-3), { id, kind, title, body }],
      notices: opts?.notify ? [{ id, kind, title, body, at: Date.now(), read: false }, ...s.notices].slice(0, 25) : s.notices,
    }));
    setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  markAllRead: () => set((s) => ({ notices: s.notices.map((x) => ({ ...x, read: true })) })),
  clearNotices: () => set({ notices: [] }),
}));

export const toast = {
  success: (t: string, b?: string, notify = false) => useToastStore.getState().push('success', t, b, { notify }),
  error: (t: string, b?: string, notify = false) => useToastStore.getState().push('error', t, b, { notify }),
  info: (t: string, b?: string) => useToastStore.getState().push('info', t, b),
};
