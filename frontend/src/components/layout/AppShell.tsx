import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/overlays';
import { api } from '@/services/api';
import { Button } from '@/components/ui/primitives';
import { FileText, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { FinTaxLogin } from './FinTaxLogin';
import { ApiError } from '@/services/api';
import type { FinTaxUser } from '@/types/api';
import fintaxLogo from '@/features/fintax/image.png';

export function AppShell() {
  const queryClient = useQueryClient();
  const account = useQuery({
    queryKey: ['fintax-user'],
    queryFn: api.me,
    staleTime: 30_000,
    retry: false,
  });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });

  if (account.isLoading) {
    return <div className="min-h-full grid place-items-center text-sm text-muted">Loading secure FinTax portal…</div>;
  }
  if (account.isError && account.error instanceof ApiError && account.error.status === 401) {
    return <FinTaxLogin />;
  }
  if (account.isError) {
    return <div role="alert" className="min-h-full grid place-items-center p-6 text-center"><div className="max-w-md"><p className="text-sm text-bad">Could not connect to the FinTax service: {account.error.message}</p><Link to="/demo" className="mt-4 inline-flex items-center gap-2 rounded-lg border hairline px-4 py-2 text-sm text-cyan hover:bg-cyan/5">Open the browser-only demo <FileText className="size-4" /></Link></div></div>;
  }
  if (!account.data) {
    return <div className="min-h-full grid place-items-center text-sm text-muted">Loading secure FinTax portal…</div>;
  }
  if (account.data.user.must_change_password) {
    return <FinTaxLogin user={account.data.user} />;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col p-3 sm:flex">
        <div className="flex h-full flex-col rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_20px_55px_-38px_rgba(30,41,59,.4)] backdrop-blur-xl">
        <Link to="/" className="mb-8 flex items-center gap-3 px-2 pt-2">
          <span className="grid size-10 place-items-center overflow-hidden rounded-xl border border-white bg-white shadow-sm"><img src={fintaxLogo} alt="FinTax logo" className="size-full object-contain p-0.5" /></span>
          <span><span className="block text-lg font-semibold">FinTax</span><span className="block text-xs text-muted">Client workspace</span></span>
        </Link>
        <PortalNavigation user={account.data.user} />
        <div className="mt-auto border-t hairline pt-4">
          <p className="truncate px-2 text-sm font-medium">{account.data.user.company_name || account.data.user.username}</p>
          <p className="px-2 text-xs capitalize text-muted">{account.data.user.role}</p>
          <Button className="mt-3 w-full justify-start" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
        </div>
      </aside>
      <main id="main" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <header className="portal-topbar sticky top-0 z-20 mx-2 mt-2 flex min-h-14 flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/85 px-3 py-2 shadow-[0_18px_45px_-34px_rgba(30,41,59,.35)] backdrop-blur-xl sm:mx-4 sm:min-h-16 sm:flex-nowrap sm:rounded-full sm:px-5 sm:py-0">
            <span className="portal-brand font-semibold sm:hidden">FinTax</span>
            <span className="portal-subtitle text-sm text-muted">Secure client portal</span>
            <nav aria-label="Portal navigation" className="hidden items-center gap-1 rounded-full bg-slate-100/80 p-1 md:flex">
              <NavLink to="/" end className={({ isActive }) => `rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>Overview</NavLink>
              <NavLink to="/documents" className={({ isActive }) => `rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>Documents</NavLink>
              {account.data.user.role !== 'client' && <NavLink to="/clients" className={({ isActive }) => `rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>Clients</NavLink>}
            </nav>
            <span className="portal-identity ml-auto text-xs text-muted">{account.data.user.client_number || account.data.user.email || account.data.user.username}</span>
            <nav aria-label="Mobile navigation" className="portal-mobile-nav flex w-full gap-1 overflow-x-auto rounded-full bg-slate-100/80 p-1 sm:hidden">
              <NavLink to="/" end className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>Overview</NavLink>
              <NavLink to="/documents" className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>Documents</NavLink>
              {account.data.user.role !== 'client' && <NavLink to="/clients" className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>Clients</NavLink>}
              <button type="button" className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-600" onClick={() => logout.mutate()}>Sign out</button>
            </nav>
          </header>
          <div className="flex-1 p-5 sm:p-8">
            <Suspense fallback={<div className="py-16 text-center text-sm text-muted">Loading portal…</div>}><Outlet /></Suspense>
          </div>
          <Toaster />
        </div>
      </main>
    </div>
  );
}

function PortalNavigation({ user }: { user: FinTaxUser }) {
  const links = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/documents', label: 'Documents', icon: FileText, end: false },
    ...(user.role !== 'client' ? [{ to: '/clients', label: 'Clients', icon: Users, end: false }] : []),
  ];
  return (
    <nav aria-label="Main" className="space-y-1">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'text-muted hover:bg-slate-100 hover:text-ink'}`}>
          <Icon className="size-4" />{label}
        </NavLink>
      ))}
    </nav>
  );
}
