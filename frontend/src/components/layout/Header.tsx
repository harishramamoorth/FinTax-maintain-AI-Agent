import { Bell, CheckCheck, LogOut, Menu, Moon, Search, Sun, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/services/api';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { activeAgentCount, useExecutionStore } from '@/stores/executionStore';
import { useHealth } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { IconButton, StatusBadge, DemoBadge } from '@/components/ui/primitives';
import { timeAgo, truncate } from '@/utils/format';
import { NAV } from './Sidebar';

function useOutside(ref: React.RefObject<HTMLElement>, fn: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fn(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fn(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, fn, on]);
}

function GlobalSearch() {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim(), 250); const nav = useNavigate(); const box = useRef<HTMLDivElement>(null);
  useOutside(box, () => setOpen(false), open);
  const tasks = useQuery({ queryKey: ['search-tasks', dq], queryFn: () => api.tasks({ q: dq, page_size: 4 }), enabled: dq.length > 1 });
  const docs = useQuery({ queryKey: ['search-docs', dq], queryFn: () => api.knowledge({ q: dq, page_size: 4 }), enabled: dq.length > 1 });
  const go = (to: string) => { setOpen(false); setQ(''); nav(to); };
  const none = dq.length > 1 && !tasks.isFetching && !docs.isFetching && !tasks.data?.items.length && !docs.data?.items.length;
  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} type="search" role="combobox" aria-expanded={open} aria-label="Search tasks and documents"
        placeholder="Search tasks and documents" className="w-full h-9 rounded-lg bg-bg/50 border hairline pl-9 pr-3 text-sm placeholder:text-faint focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/15" />
      {open && dq.length > 1 && (
        <div className="absolute z-30 top-11 left-0 right-0 glass bg-bg2/95 rounded-xl p-2 max-h-96 overflow-y-auto">
          {tasks.data?.items.length ? <p className="px-2 pt-1 pb-1 text-xs text-faint">Tasks</p> : null}
          {tasks.data?.items.map((t) => (
            <button key={t.id} onClick={() => go(`/tasks?open=${t.id}`)} className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-ink/5">
              <span className="truncate flex-1 text-sm">{truncate(t.prompt, 70)}</span><StatusBadge status={t.status} />
            </button>
          ))}
          {docs.data?.items.length ? <p className="px-2 pt-2 pb-1 text-xs text-faint">Knowledge documents</p> : null}
          {docs.data?.items.map((d) => (
            <button key={d.id} onClick={() => go(`/knowledge?open=${d.id}`)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-ink/5"><span className="text-sm">{d.title}</span></button>
          ))}
          {none && <p className="px-2 py-3 text-sm text-muted">No tasks or documents match “{dq}”.</p>}
          {(tasks.isFetching || docs.isFetching) && <p className="px-2 py-2 text-xs text-faint">Searching…</p>}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const notices = useToastStore((s) => s.notices); const markRead = useToastStore((s) => s.markAllRead); const clear = useToastStore((s) => s.clearNotices);
  const unread = notices.filter((n) => !n.read).length;
  useOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <IconButton label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => { setOpen(!open); if (!open) markRead(); }} aria-expanded={open}>
        <span className="relative"><Bell className="size-[18px]" />{unread > 0 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-magenta" />}</span>
      </IconButton>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 glass bg-bg2/95 rounded-xl p-2">
          <div className="flex items-center justify-between px-2 py-1"><p className="text-sm font-medium">Notifications</p>{notices.length > 0 && <button onClick={clear} className="text-xs text-muted hover:text-ink flex items-center gap-1"><CheckCheck className="size-3" />Clear</button>}</div>
          {notices.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted">Task results will appear here.</p> : (
            <ul className="max-h-80 overflow-y-auto">{notices.map((n) => (
              <li key={n.id} className="px-2 py-2 rounded-lg hover:bg-ink/5"><p className={clsx('text-sm', n.kind === 'error' && 'text-bad')}>{n.title}</p>{n.body && <p className="text-xs text-muted truncate">{n.body}</p>}<p className="text-[11px] text-faint">{timeAgo(new Date(n.at).toISOString())}</p></li>
            ))}</ul>)}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const nav = useNavigate();
  const health = useHealth(); const clear = useAuthStore((s) => s.clear); const token = useAuthStore((s) => s.token);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Profile menu" aria-expanded={open} className="grid place-items-center size-9 rounded-full border hairline bg-gradient-to-br from-violet/30 to-cyan/20 hover:border-cyan/50"><User className="size-4" /></button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-60 glass bg-bg2/95 rounded-xl p-2">
          <div className="px-2 py-2"><p className="text-sm font-medium">Local operator</p><p className="text-xs text-muted">Single-user workspace · {health.data?.mode === 'demo' ? 'demo mode' : 'live mode'}</p></div>
          <button onClick={() => { nav('/settings'); setOpen(false); }} className="w-full text-left px-2 py-2 rounded-lg text-sm hover:bg-ink/5">Settings</button>
          {token && <button onClick={() => { clear(); setOpen(false); window.location.reload(); }} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-bad hover:bg-bad/10"><LogOut className="size-4" />Forget access token</button>}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const title = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? 'FinTax';
  const setMobile = useUiStore((s) => s.setMobileNav);
  const theme = useUiStore((s) => s.theme); const setTheme = useUiStore((s) => s.setTheme);
  const active = useExecutionStore(activeAgentCount); const exec = useExecutionStore((s) => s.status);
  const health = useHealth(); const up = health.data?.status === 'ok';
  return (
    <header className="app-topbar min-h-16 shrink-0 px-2 pt-2 sm:px-4">
      <div className="app-topbar-card flex min-h-12 items-center gap-2 rounded-full border hairline bg-bg2/85 px-2 shadow-[0_12px_32px_-24px_rgb(var(--shadow)/.65)] backdrop-blur-xl sm:gap-3 sm:px-4">
      <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobile(true)}><Menu className="size-5" /></IconButton>
      <h1 className="app-topbar-title text-sm font-semibold tracking-tight whitespace-nowrap sm:text-base">{title}</h1>
      {health.data?.mode === 'demo' && <span className="hidden md:inline-flex"><DemoBadge /></span>}
      <div className="app-topbar-search flex min-w-0 flex-1 justify-center px-2"><GlobalSearch /></div>
      <div className="hidden md:flex items-center gap-2 text-xs text-muted" role="status" aria-label="Active agents">
        <span className={clsx('size-1.5 rounded-full', active > 0 ? 'bg-cyan' : 'bg-faint')} />
        <span className="num">{active} active agent{active === 1 ? '' : 's'}</span>
        {exec === 'running' && <span className="text-cyan">· running</span>}
      </div>
      <div className={clsx('hidden sm:flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border', up ? 'text-ok border-ok/25 bg-ok/5' : 'text-bad border-bad/25 bg-bad/5')} role="status">
        <span className={clsx('size-1.5 rounded-full', up ? 'bg-ok' : 'bg-bad')} />{up ? 'API online' : 'API offline'}
      </div>
      <div className="app-topbar-actions flex shrink-0 items-center gap-1">
        <Notifications />
        <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</IconButton>
        <ProfileMenu />
      </div>
      </div>
    </header>
  );
}
