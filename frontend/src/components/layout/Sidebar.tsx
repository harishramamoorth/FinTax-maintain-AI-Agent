import clsx from 'clsx';
import { Activity, BarChart3, BookOpen, ChevronsLeft, ChevronsRight, GitBranch, History, LayoutDashboard, Network, Plus, Settings, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';
import { useHealth } from '@/hooks/queries';
import { Logo } from './Logo';

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Agent Workspace', icon: Network },
  { to: '/workflows', label: 'Workflow Builder', icon: GitBranch },
  { to: '/tasks', label: 'Task History', icon: History },
  { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Content({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const nav = useNavigate();
  const focus = useUiStore((s) => s.requestFocusInput);
  const health = useHealth();
  const up = health.data?.status === 'ok';
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'px-1.5 pt-1')}><Logo collapsed={collapsed} /></div>
      <button onClick={() => { nav('/workspace'); focus(); onNavigate?.(); }} title="New Agent Task"
        className={clsx('flex items-center justify-center gap-2 h-10 rounded-full bg-cyan text-bg font-semibold text-sm hover:brightness-110 transition shadow-[0_0_24px_-8px_rgb(var(--cyan)/.8)]', collapsed && 'px-0')}>
        <Plus className="size-4" aria-hidden />{!collapsed && 'New Agent Task'}<span className="sr-only">{collapsed ? 'New Agent Task' : ''}</span>
      </button>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} title={label}
            className={({ isActive }) => clsx('group flex items-center gap-3 h-10 rounded-full px-3 text-sm transition-colors', collapsed && 'justify-center px-0',
              isActive ? 'bg-cyan/10 text-ink ring-1 ring-cyan/25' : 'text-muted hover:text-ink hover:bg-ink/5')}>
            {({ isActive }) => (<><Icon className={clsx('size-[18px] shrink-0', isActive && 'text-cyan')} aria-hidden />{!collapsed ? label : <span className="sr-only">{label}</span>}</>)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-2">
        <div className={clsx('flex items-center gap-2.5 rounded-lg border hairline px-3 py-2 text-xs', collapsed && 'justify-center px-0')} role="status" title={up ? 'Backend connected' : 'Backend unreachable'}>
          <span className={clsx('relative size-2 rounded-full', up ? 'bg-ok text-ok dot-pulse' : health.isLoading ? 'bg-warn' : 'bg-bad')} aria-hidden />
          {!collapsed && <span className="text-muted">{up ? <>Backend connected <span className="text-faint">· v{health.data?.version}</span></> : health.isLoading ? 'Connecting…' : 'Backend unreachable'}</span>}
          {collapsed && <span className="sr-only">{up ? 'Backend connected' : 'Backend unreachable'}</span>}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobile = useUiStore((s) => s.setMobileNav);
  return (
    <>
      <aside className={clsx('hidden lg:flex shrink-0 flex-col rounded-[1.5rem] border hairline bg-bg2/75 shadow-[0_18px_45px_-34px_rgb(var(--shadow)/.65)] backdrop-blur-xl m-2 relative transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-64')}>
        <Content collapsed={collapsed} />
        <button onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}
          className="absolute -right-3 top-[72px] grid place-items-center size-6 rounded-full border hairline bg-bg2 text-muted hover:text-ink">
          {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobile(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-72 rounded-e-[1.5rem] border-r hairline bg-bg2 shadow-2xl" aria-label="Navigation">
            <button onClick={() => setMobile(false)} aria-label="Close navigation" className="absolute right-2 top-3 grid place-items-center size-8 text-muted"><X className="size-4" /></button>
            <Content collapsed={false} onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
export { Activity };
