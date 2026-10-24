import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './primitives';
import { useMotion } from '@/hooks/useMotion';
import { useToastStore } from '@/stores/toastStore';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = () => Array.from(el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []).filter((n) => !n.hasAttribute('disabled'));
    setTimeout(() => (focusable()[0] ?? el)?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusable(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useOverlay(open, onClose);
  const id = useId();
  const dur = useMotion() === 'off' ? 0 : 0.18;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: dur }}
            className={`relative glass rounded-xl2 w-full ${width} max-h-[90vh] flex flex-col bg-bg2/90 outline-none`}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b hairline">
              <h2 id={id} className="font-semibold">{title}</h2>
              <IconButton label="Close dialog" onClick={onClose}><X className="size-4" /></IconButton>
            </div>
            <div className="px-5 py-4 overflow-y-auto">{children}</div>
            {footer && <div className="px-5 py-3 border-t hairline flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}

export function Drawer({ open, onClose, title, children, width = 'sm:w-[560px]' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  const ref = useOverlay(open, onClose);
  const dur = useMotion() === 'off' ? 0 : 0.25;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.aside ref={ref} role="dialog" aria-modal="true" aria-label="Details" tabIndex={-1}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', ease: 'easeOut', duration: dur }}
            className={`absolute right-0 top-0 h-full w-full ${width} glass bg-bg2/95 flex flex-col outline-none`}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b hairline">
              <div className="min-w-0 font-semibold truncate">{title}</div>
              <IconButton label="Close panel" onClick={onClose}><X className="size-4" /></IconButton>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Delete', loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{body}</p>
    </Modal>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const icon = { success: <CheckCircle2 className="size-4 text-ok" />, error: <AlertTriangle className="size-4 text-bad" />, info: <Info className="size-4 text-cyan" /> };
  return (
    <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }}
            role={t.kind === 'error' ? 'alert' : 'status'} className="pointer-events-auto glass bg-bg2/95 rounded-xl px-4 py-3 flex gap-3 items-start">
            <span className="mt-0.5">{icon[t.kind]}</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{t.title}</p>{t.body && <p className="text-xs text-muted mt-0.5 break-words">{t.body}</p>}</div>
            <IconButton label="Dismiss" className="size-6 -mr-1 -mt-1" onClick={() => dismiss(t.id)}><X className="size-3.5" /></IconButton>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
