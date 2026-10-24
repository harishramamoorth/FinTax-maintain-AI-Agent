import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, FileText, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { Panel } from '@/components/ui/primitives';

export default function FinTaxDashboard() {
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  const user = account.data?.user;
  const client = useQuery({
    queryKey: ['fintax-client-home'],
    queryFn: api.clientHome,
    enabled: user?.role === 'client',
  });
  const clients = useQuery({
    queryKey: ['fintax-clients'],
    queryFn: api.clients,
    enabled: user?.role === 'admin' || user?.role === 'staff',
  });

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <p className="text-sm font-medium text-cyan">FinTax Consulting</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {user?.role === 'client' ? `Welcome, ${client.data?.company_name || user.company_name || user.username}` : `Welcome, ${user?.username}`}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {user?.role === 'client'
            ? 'Your secure client workspace.'
            : user?.role === 'admin'
              ? 'Administrator workspace and client overview.'
              : 'Staff workspace and your assigned clients.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {user?.role !== 'client' && (
          <Panel className="p-5">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan/10 text-cyan"><Building2 className="size-5" /></span><span className="text-sm text-muted">Accessible clients</span></div>
            <p className="mt-5 text-3xl font-semibold">{clients.data?.length ?? '—'}</p>
            <Link to="/clients" className="mt-4 inline-flex items-center gap-1 text-sm text-cyan">Open client list <ArrowRight className="size-4" /></Link>
          </Panel>
        )}
        <Panel className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-green/10 text-green"><ShieldCheck className="size-5" /></span><span className="text-sm text-muted">Account security</span></div>
          <p className="mt-5 text-lg font-semibold">Private sign-in</p>
          <p className="mt-2 text-sm text-muted">Your account is protected by a password and a single active session.</p>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet/10 text-violet"><FileText className="size-5" /></span><span className="text-sm text-muted">Document workspace</span></div>
          <p className="mt-5 text-lg font-semibold">Document processing</p>
          <p className="mt-2 text-sm text-muted">Upload, OCR, review, and export workflows are not enabled yet.</p>
        </Panel>
      </div>

      {user?.role !== 'client' && (
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b hairline px-5 py-4">
            <div><h2 className="font-semibold">Client accounts</h2><p className="mt-1 text-xs text-muted">Client access is limited to accounts assigned to the signed-in staff member.</p></div>
            <Link to="/clients" className="text-sm text-cyan">Manage clients</Link>
          </div>
          {clients.isLoading ? <p className="p-5 text-sm text-muted">Loading clients…</p>
            : clients.isError ? <p role="alert" className="p-5 text-sm text-bad">Could not load clients.</p>
              : clients.data?.length ? <ul className="divide-y divide-line/10">{clients.data.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3.5"><Building2 className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.company_name}</span><span className="text-xs text-muted">{item.client_number}</span></li>
              ))}</ul>
                : <div className="p-6 text-center"><Users className="mx-auto size-6 text-muted" /><p className="mt-2 text-sm text-muted">No client accounts yet.</p><Link className="mt-3 inline-block text-sm text-cyan" to="/clients">Create a client account</Link></div>}
        </Panel>
      )}
    </div>
  );
}
