import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Banknote, Building2, ChevronRight, ClipboardCheck, FileText, LayoutDashboard,
  LogOut, Plus, X, type LucideIcon,
} from 'lucide-react';
import type { DemoDocument } from './demoWorkflow';
import fintaxLogo from './image.png';

export interface NavEntry<Id extends string = string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  group: string;
}

export const PALETTE = [
  ['#7c3aed', '#3b82f6'],
  ['#3b82f6', '#06b6d4'],
  ['#d97706', '#db2777'],
  ['#059669', '#06b6d4'],
] as const;

export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      previous.current = value;
      return;
    }

    const start = performance.now();
    const initial = previous.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setShown(Math.round(initial + (value - initial) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduce, value]);

  return <>{shown}</>;
}

export function NavDrawer<Id extends string>({
  open, onClose, items, screen, onSelect, counts, userName, roleLabel, onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  items: NavEntry<Id>[];
  screen: Id;
  onSelect: (id: Id) => void;
  counts: Record<string, number>;
  userName: string;
  roleLabel: string;
  onSignOut: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && <>
        <motion.button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-[2px] lg:hidden"
        />
        <motion.aside
          id="demo-mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation"
          initial={reduce ? false : { x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          className="fixed inset-y-0 start-0 z-50 flex w-[min(20rem,88vw)] flex-col border-e hairline bg-bg2 p-4 shadow-2xl lg:hidden"
        >
          <div className="flex items-center gap-3 border-b hairline pb-4">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white bg-white shadow-sm"><img src={fintaxLogo} alt="FinTax logo" className="size-full object-contain p-0.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="text-xs text-muted">{roleLabel} demo user</p>
            </div>
            <button type="button" aria-label="Close navigation" onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted hover:bg-ink/5">
              <X className="size-4" />
            </button>
          </div>
          <nav className="mt-3 flex-1 space-y-1 overflow-y-auto" aria-label="Workspace">
            {items.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={screen === item.id ? 'page' : undefined}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * index }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm ${screen === item.id ? 'bg-cyan/10 text-ink ring-1 ring-cyan/20' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}
              >
                <item.icon className={`size-4 shrink-0 ${screen === item.id ? 'text-cyan' : ''}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {counts[item.id] ? <span className="rounded-full bg-warn/15 px-2 text-[11px] text-warn">{counts[item.id]}</span> : null}
              </motion.button>
            ))}
          </nav>
          <button type="button" onClick={onSignOut} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border hairline text-sm text-muted hover:text-ink">
            <LogOut className="size-4" />Logout
          </button>
        </motion.aside>
      </>}
    </AnimatePresence>
  );
}

const PRIMARY_TABS = [
  ['overview', 'Overview', LayoutDashboard],
  ['documents', 'Documents', FileText],
  ['review', 'Review', ClipboardCheck],
  ['banking', 'Bank', Banknote],
] as const;

export function BottomBar({
  screen, onSelect, reviewCount, onMore,
}: {
  screen: string;
  onSelect: (id: 'overview' | 'documents' | 'review' | 'banking') => void;
  reviewCount: number;
  onMore: () => void;
}) {
  return (
    <nav aria-label="Primary workspace navigation" className="workspace-bottom-nav fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 lg:hidden">
      <ul className="workspace-bottom-dock mx-auto grid max-w-xl grid-cols-5">
        {PRIMARY_TABS.flatMap(([id, label, Icon], index) => {
          const active = screen === id;
          const tab = (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)} aria-current={active ? 'page' : undefined} className={`workspace-bottom-tab ${active ? 'is-active' : ''}`}>
                <span className="workspace-bottom-icon">
                  <Icon className="size-[19px]" strokeWidth={active ? 2.2 : 1.9} />
                  {id === 'review' && reviewCount > 0 && <span className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-warn px-1 text-[9px] font-semibold text-bg">{reviewCount}</span>}
                </span>
                <span className="workspace-bottom-label">{label}</span>
              </button>
            </li>
          );
          return index === 2
            ? [
                <li key="more">
                  <button type="button" onClick={onMore} aria-label="More workspace options" className="workspace-bottom-tab workspace-bottom-tab--featured">
                    <span className="workspace-bottom-icon"><Plus className="size-6" strokeWidth={2} /></span>
                    <span className="workspace-bottom-label">More</span>
                  </button>
                </li>,
                tab,
              ]
            : [tab];
        })}
      </ul>
    </nav>
  );
}

export function DocCards({
  documents, onSelect, labelFor, formatBytes, renderStatus,
}: {
  documents: DemoDocument[];
  onSelect?: (document: DemoDocument) => void;
  labelFor: (category: DemoDocument['category']) => string;
  formatBytes: (bytes: number) => string;
  renderStatus: (document: DemoDocument) => ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <ul className="divide-y divide-line/10">
      {documents.map((item, index) => (
        <motion.li key={item.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
          <button type="button" onClick={() => onSelect?.(item)} className="flex min-h-20 w-full items-center gap-3 px-4 py-3.5 text-start active:bg-ink/5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet"><FileText className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted">{labelFor(item.category)} · {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                {renderStatus(item)}
                {item.confidence > 0 && <span className="text-[11px] text-muted">{Math.round(item.confidence * 100)}%</span>}
                {item.processingProgress != null && item.status === 'processing' && <span className="text-[11px] text-muted">{item.processingProgress}%</span>}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" />
          </button>
        </motion.li>
      ))}
    </ul>
  );
}

export function Stepper({ steps }: { steps: [string, string, string][] }) {
  const reduce = useReducedMotion();
  return (
    <ol className="grid gap-5 p-5 sm:grid-cols-5 sm:gap-2">
      {steps.map(([number, title, detail], index) => (
        <li key={number} className="relative flex gap-3 sm:flex-col sm:gap-2">
          <motion.span
            initial={reduce ? false : { scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: index * 0.12 }}
            className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-cyan/10 font-mono text-xs text-cyan ring-1 ring-cyan/30"
          >{number}</motion.span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{title}</span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">{detail}</span>
          </span>
          {index < steps.length - 1 && (
            <motion.span
              aria-hidden="true"
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.12 }}
              className="absolute -bottom-3 start-5 top-11 w-px bg-cyan/30 sm:bottom-auto sm:start-12 sm:top-5 sm:h-px sm:w-[calc(100%-2.5rem)]"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
