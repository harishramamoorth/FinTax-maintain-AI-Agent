import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Copy, KeyRound, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/services/api';
import { Button, Field, Input, Panel } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/primitives';
import { useDemoDocumentsStore } from '@/stores/demoDocumentsStore';
import { DEMO_CLIENTS } from './demoAccounts';
import type { DemoDocument } from './demoWorkflow';

function ManagedClientsPage() {
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  const clients = useQuery({ queryKey: ['fintax-clients'], queryFn: api.clients });
  const accounts = useQuery({
    queryKey: ['fintax-accounts'],
    queryFn: api.accounts,
    enabled: account.data?.user.role === 'admin',
  });
  const audit = useQuery({
    queryKey: ['fintax-audit'],
    queryFn: api.auditEvents,
    enabled: account.data?.user.role === 'admin',
  });
  const [role, setRole] = useState<'client' | 'staff'>('client');
  const [username, setUsername] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientNumber, setClientNumber] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string; clientNumber?: string } | null>(null);
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string, string>>({});
  const [resetCredential, setResetCredential] = useState<{ username: string; password: string } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const demoDocuments = useDemoDocumentsStore((state) => state.documents);
  const admin = account.data?.user.role === 'admin';
  const selectedClient = clients.data?.find((client) => client.id === selectedClientId) ?? null;
  const selectedClientDocuments = selectedClient?.email
    ? demoDocuments.filter((document) => document.clientId === selectedClient.email)
    : [];
  const create = useMutation({
    mutationFn: () => api.createAccount({
      role,
      username: username.trim(),
      initial_password: initialPassword,
      email: email.trim() || undefined,
      company_name: role === 'client' ? companyName.trim() : undefined,
      client_number: role === 'client' ? clientNumber.trim() : undefined,
    }),
    onSuccess: ({ user, temporary_password }) => {
      setCreatedCredentials({
        username: user.username,
        password: temporary_password,
        clientNumber: user.client_number || undefined,
      });
      setUsername('');
      setInitialPassword('');
      setConfirmPassword('');
      setEmail('');
      setCompanyName('');
      setClientNumber('');
      void queryClient.invalidateQueries({ queryKey: ['fintax-clients'] });
      void queryClient.invalidateQueries({ queryKey: ['fintax-accounts'] });
    },
  });
  const createError = create.error instanceof ApiError ? create.error.message : create.error instanceof Error ? create.error.message : null;
  const assign = useMutation({
    mutationFn: ({ userId, clientId }: { userId: string; clientId: string }) => api.assignClient(userId, clientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fintax-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['fintax-clients'] });
    },
  });
  const resetPassword = useMutation({
    mutationFn: (userId: string) => api.resetAccountPassword(userId),
    onSuccess: ({ temporary_password }, userId) => {
      const user = accounts.data?.find((entry) => entry.id === userId);
      if (user) setResetCredential({ username: user.username, password: temporary_password });
    },
  });
  const disable = useMutation({
    mutationFn: (userId: string) => api.disableAccount(userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['fintax-accounts'] }),
  });
  const copyCredentials = async () => {
    if (!createdCredentials) return;
    const text = `Username: ${createdCredentials.username}\n${createdCredentials.clientNumber ? `Client number: ${createdCredentials.clientNumber}\n` : ''}Temporary password: ${createdCredentials.password}`;
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div><p className="text-sm font-medium text-cyan">FinTax Consulting</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Clients</h1><p className="mt-2 text-sm text-muted">Create and manage client access. Staff see only clients assigned to them.</p></div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-3 border-b hairline px-5 py-4"><Users className="size-5 text-cyan" /><div><h2 className="font-semibold">Client accounts</h2><p className="text-xs text-muted">{clients.data?.length ?? 0} accessible clients</p></div></div>
          {clients.isLoading ? <p className="p-5 text-sm text-muted">Loading clients…</p>
            : clients.isError ? <p role="alert" className="p-5 text-sm text-bad">Could not load clients.</p>
              : clients.data?.length ? <ul className="divide-y divide-line/10">{clients.data.map((client) => {
                const clientDocuments = client.email ? demoDocuments.filter((document) => document.clientId === client.email) : [];
                const pendingCount = clientDocuments.filter((document) => document.status === 'processing' || document.status === 'review').length;
                const attentionCount = clientDocuments.filter((document) => ['needs_information', 'action_required', 'password_required', 'rejected'].includes(document.status)).length;
                const completedCount = clientDocuments.filter((document) => document.status === 'approved').length;
                const requestCount = clientDocuments.filter((document) => document.clientRequest && !document.clientRequest.resolvedAt).length;
                return <li key={client.id} className="px-5 py-4">
                  <button type="button" onClick={() => setSelectedClientId((current) => current === client.id ? null : client.id)} aria-expanded={selectedClientId === client.id} className="flex w-full items-center gap-3 text-left">
                    <span className="grid size-10 place-items-center rounded-xl bg-cyan/10 text-cyan"><Building2 className="size-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{client.company_name}</span><span className="block text-xs text-muted">{client.client_number}{client.email ? ` · ${client.email}` : ''}</span></span>
                    <span className="flex max-w-full flex-wrap justify-end gap-1.5 sm:ml-auto">
                      <Badge tone="neutral">{clientDocuments.length} docs</Badge>
                      <Badge tone="cyan">{pendingCount} pending</Badge>
                      <Badge tone={attentionCount ? 'warn' : 'neutral'}>{attentionCount} attention</Badge>
                      <Badge tone="ok">{completedCount} completed</Badge>
                      <Badge tone={requestCount ? 'warn' : 'neutral'}>{requestCount} outstanding requests</Badge>
                    </span>
                  </button>
                  {selectedClientId === client.id && <div className="mt-4 rounded-xl border hairline bg-bg/40 p-4">
                    <h3 className="text-sm font-medium">Demo document history</h3>
                    {!clientDocuments.length
                      ? <p className="mt-2 text-xs text-muted">No demo documents are associated with this client.</p>
                      : <ul className="mt-3 space-y-3">{clientDocuments.map((document) => (
                        <li key={document.id} className="flex flex-wrap items-start justify-between gap-2 border-t hairline pt-3 text-xs">
                          <span className="min-w-0"><span className="block truncate font-medium">{document.name}</span><span className="mt-1 block text-muted">{document.category.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleString()}</span>
                            {document.clientRequest && <span className="mt-1 block text-amber-300">{document.clientRequest.reason} · Requested {new Date(document.clientRequest.createdAt).toLocaleString()}{document.clientRequest.resolvedAt ? ' · Client responded' : ' · Outstanding'}</span>}
                          </span>
                          <Badge tone={document.status === 'approved' ? 'ok' : document.status === 'rejected' || document.status === 'needs_information' ? 'warn' : 'cyan'}>{document.status.replace(/_/g, ' ')}</Badge>
                        </li>
                      ))}</ul>}
                  </div>}
                </li>;
              })}</ul> : <div className="p-8 text-center"><Users className="mx-auto size-7 text-muted" /><p className="mt-3 text-sm text-muted">No client accounts yet. Create the first one here.</p></div>}
        </Panel>

        <Panel className="h-fit p-5">
          <h2 className="font-semibold">Create account</h2>
          <p className="mt-1 text-xs text-muted">Set a temporary password for the new account. The user must replace it at first sign-in.</p>
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            setCreatedCredentials(null);
            setPasswordError('');
            if (initialPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
            create.mutate();
          }}>
            {admin && <Field label="Account role" htmlFor="account-role"><select id="account-role" value={role} onChange={(event) => setRole(event.target.value as 'client' | 'staff')} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm"><option value="client">Client</option><option value="staff">Staff</option></select></Field>}
            <Field label="Username" htmlFor="account-username"><Input id="account-username" required minLength={3} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
            <Field label="Temporary password (at least 12 characters)" htmlFor="account-password"><Input id="account-password" type="password" required minLength={12} autoComplete="new-password" value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} /></Field>
            <Field label="Confirm temporary password" htmlFor="account-password-confirm"><Input id="account-password-confirm" type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>
            <Field label={role === 'client' ? 'Email (optional)' : 'Staff email'} htmlFor="account-email"><Input id="account-email" type="email" required={role === 'staff'} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            {role === 'client' && <>
              <Field label="Company name" htmlFor="client-company"><Input id="client-company" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></Field>
              <Field label="Client number (used to sign in)" htmlFor="client-number"><Input id="client-number" required value={clientNumber} onChange={(event) => setClientNumber(event.target.value)} /></Field>
            </>}
            {(passwordError || createError) && <p role="alert" className="text-sm text-bad">{passwordError || createError}</p>}
            <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={create.isPending} className="w-full">Create account</Button>
          </form>
          {createdCredentials && <div role="status" className="mt-4 space-y-2 rounded-lg border border-green/25 bg-green/5 p-3 text-sm">
            <p className="font-medium text-green">Account created. Share these temporary credentials securely; the user must change the password at first sign-in.</p>
            <p>Username: <span className="font-mono">{createdCredentials.username}</span></p>
            {createdCredentials.clientNumber && <p>Client number: <span className="font-mono">{createdCredentials.clientNumber}</span></p>}
            <p className="break-all">Temporary password: <span className="font-mono">{createdCredentials.password}</span></p>
            <Button size="sm" icon={<Copy className="size-3.5" />} onClick={copyCredentials}>Copy credentials</Button>
          </div>}
        </Panel>
      </div>

      {selectedClient && <Panel className="overflow-hidden">
        <div className="border-b hairline px-5 py-4"><h2 className="font-semibold">{selectedClient.company_name} · document activity</h2><p className="mt-1 text-xs text-muted">Browser-session demo records matched only to this client email. These are not server documents.</p></div>
        {selectedClientDocuments.length ? <ul className="divide-y divide-line/10">{selectedClientDocuments.map((document) => <ClientDemoDocument key={document.id} document={document} />)}</ul>
          : <p className="p-6 text-sm text-muted">No documents are available for this client in the current demo session.</p>}
      </Panel>}

      {admin && <Panel className="overflow-hidden">
        <div className="border-b hairline px-5 py-4"><h2 className="font-semibold">All accounts</h2><p className="text-xs text-muted">Reset credentials, deactivate accounts, and assign clients to staff.</p></div>
        <ul className="divide-y divide-line/10">{accounts.data?.map((user) => <li key={user.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-sm">{user.username}</span>
          <span className="text-xs capitalize text-muted">{user.role}</span>
          <span className="text-xs text-muted">{user.enabled ? 'Active' : 'Disabled'}</span>
          {user.role === 'staff' && <span className="flex items-center gap-2">
            <select aria-label={`Assign a client to ${user.username}`} value={selectedAssignments[user.id] ?? ''} onChange={(event) => setSelectedAssignments((previous) => ({ ...previous, [user.id]: event.target.value }))} className="h-9 max-w-48 rounded-lg border hairline bg-bg/60 px-2 text-xs">
              <option value="">Assign a client…</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
            </select>
            <Button size="sm" disabled={!selectedAssignments[user.id] || assign.isPending} loading={assign.isPending} onClick={() => {
              const clientId = selectedAssignments[user.id];
              if (clientId) assign.mutate({ userId: user.id, clientId });
            }}>Assign</Button>
            <span className="text-xs text-muted">{user.assigned_client_ids.length} assigned</span>
          </span>}
          {user.id !== account.data?.user.id && <Button size="sm" icon={<KeyRound className="size-3.5" />} onClick={() => { setResetCredential(null); resetPassword.mutate(user.id); }} loading={resetPassword.isPending}>Reset password</Button>}
          {user.enabled && <Button size="sm" variant="danger" onClick={() => {
            if (window.confirm(`Deactivate ${user.username}? They will be signed out immediately.`)) disable.mutate(user.id);
          }} loading={disable.isPending}>Deactivate</Button>}
        </li>)}</ul>
        {resetCredential && <div role="status" className="border-t hairline p-4 text-sm"><p className="font-medium text-green">Temporary password for {resetCredential.username}: <span className="font-mono">{resetCredential.password}</span></p><p className="text-xs text-muted">This is shown once; the account must change it at next sign-in.</p></div>}
        {(assign.error || resetPassword.error || disable.error) && <p role="alert" className="border-t hairline p-4 text-sm text-bad">
          {[assign.error, resetPassword.error, disable.error].find((error) => error instanceof Error)?.message ?? 'Account action failed.'}
        </p>}
      </Panel>}

      {admin && <Panel className="overflow-hidden">
        <div className="border-b hairline px-5 py-4"><h2 className="font-semibold">Recent audit activity</h2><p className="text-xs text-muted">Recent account and document access events.</p></div>
        {audit.isError ? <p role="alert" className="p-5 text-sm text-bad">Could not load audit events.</p>
          : audit.data?.length ? <ul className="divide-y divide-line/10">{audit.data.slice(0, 20).map((event) => <li key={event.id} className="flex flex-wrap gap-2 px-5 py-3 text-xs"><span className="font-medium">{event.action.replace(/_/g, ' ')}</span><span className="text-muted">{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span><span className="ml-auto text-muted">{event.client_id ? `Client ${event.client_id.slice(0, 8)}` : ''}</span></li>)}</ul>
            : <p className="p-5 text-sm text-muted">No audit events recorded yet.</p>}
      </Panel>}
    </div>
  );
}

export default function ClientsPage({ demoOnly = false }: { demoOnly?: boolean }) {
  return demoOnly ? <DemoClientsPage /> : <ManagedClientsPage />;
}

function DemoClientsPage() {
  const documents = useDemoDocumentsStore((state) => state.documents);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const demoClients = DEMO_CLIENTS;
  const pendingTotal = documents.filter((document) => ['processing', 'review'].includes(document.status)).length;
  const attentionTotal = documents.filter((document) => ['needs_information', 'action_required', 'password_required', 'rejected'].includes(document.status)).length;
  const completedTotal = documents.filter((document) => document.status === 'approved').length;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan">FinTax Consulting · Admin demo</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Clients</h2><p className="mt-2 text-sm text-muted">Fictional demo client summaries and document activity for this browser session.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[['Demo clients', demoClients.length, 'bg-blue-50 text-blue-700'], ['Waiting for review', pendingTotal, 'bg-amber-50 text-amber-700'], ['Needs attention', attentionTotal, 'bg-rose-50 text-rose-700']].map(([label, value, color]) => <Panel key={label} className="!rounded-2xl !border-white/80 !bg-white/85 p-3 shadow-[0_16px_40px_-30px_rgba(60,80,140,.4)] sm:p-4"><p className="text-[10px] text-muted sm:text-xs">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p></Panel>)}
    </div>
    <Panel className="overflow-hidden !rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-4 py-4 sm:px-5"><div><h3 className="font-semibold">Client workspaces</h3><p className="mt-1 text-xs text-muted">{demoClients.length} fictional clients · {completedTotal} approved documents</p></div><Badge tone="neutral">Demo data only</Badge></div>
      <ul className="space-y-2 p-3 sm:p-4">{demoClients.map((client) => {
        const clientDocuments = documents.filter((document) => document.clientId === client.email);
        const pendingCount = clientDocuments.filter((document) => ['processing', 'review'].includes(document.status)).length;
        const attentionCount = clientDocuments.filter((document) => ['needs_information', 'action_required', 'password_required', 'rejected'].includes(document.status)).length;
        const completedCount = clientDocuments.filter((document) => document.status === 'approved').length;
        const requestCount = clientDocuments.filter((document) => document.clientRequest && !document.clientRequest.resolvedAt).length;
        return <li key={client.id} className={`rounded-2xl border p-3 transition-colors sm:p-4 ${selectedClientId === client.id ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200/80 bg-white hover:bg-slate-50/70'}`}>
          <button type="button" aria-expanded={selectedClientId === client.id} onClick={() => setSelectedClientId((current) => current === client.id ? null : client.id)} className="flex w-full flex-wrap items-center gap-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Users className="size-5" /></span>
            <span className="min-w-40 flex-1"><span className="block text-sm font-semibold">{client.company}</span><span className="block truncate text-xs text-muted">{client.email} · {client.country} · DEMO DATA</span></span>
            <span className="flex max-w-full flex-wrap justify-start gap-1.5 sm:justify-end">
              <Badge tone="neutral">{clientDocuments.length} documents</Badge>
              <Badge tone="cyan">{pendingCount} pending</Badge>
              <Badge tone={attentionCount ? 'warn' : 'neutral'}>{attentionCount} attention</Badge>
              <Badge tone="ok">{completedCount} completed</Badge>
              <Badge tone={requestCount ? 'warn' : 'neutral'}>{requestCount} outstanding requests</Badge>
            </span>
          </button>
          {selectedClientId === client.id && <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-3 sm:p-4">
            <h3 className="text-sm font-semibold">Document history</h3>
            {clientDocuments.length
              ? <ul className="mt-3 space-y-3">{clientDocuments.map((document) => <li key={document.id} className="flex flex-wrap items-start justify-between gap-2 border-t hairline pt-3 text-xs">
                <span className="min-w-0"><span className="block truncate font-medium">{document.name}</span><span className="mt-1 block text-muted">{document.category.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleString()}</span>
                  {document.clientRequest && <span className="mt-1 block text-amber-700">{document.clientRequest.reason} · {document.clientRequest.resolvedAt ? 'Client responded' : 'Outstanding'}</span>}
                </span>
                <Badge tone={document.status === 'approved' ? 'ok' : ['rejected', 'needs_information'].includes(document.status) ? 'warn' : 'cyan'}>{document.status.replace(/_/g, ' ')}</Badge>
              </li>)}</ul>
              : <p className="mt-2 text-xs text-muted">No demo documents yet. Client records stay isolated by demo account email.</p>}
          </div>}
        </li>;
      })}</ul>
      <p className="border-t hairline px-4 py-3 text-[11px] text-muted sm:px-5">Demo records exist only in this tab. Account creation and staff assignment are not simulated here; they remain in the existing account-management feature.</p>
    </Panel>
  </div>;
}

function ClientDemoDocument({ document }: { document: DemoDocument }) {
  return <li className="px-5 py-4">
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-48 flex-1"><span className="block text-sm font-medium">{document.name}</span><span className="mt-1 block text-xs text-muted">{document.category.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleString()}</span></span>
      <Badge tone={document.status === 'approved' ? 'ok' : ['rejected', 'password_required'].includes(document.status) ? 'bad' : 'warn'}>{document.status.replace(/_/g, ' ')}</Badge>
      <Badge tone="neutral">{Math.round(document.confidence * 100)}% confidence</Badge>
    </div>
    {document.note && <p className="mt-2 text-xs text-muted">{document.note}</p>}
    {document.clientRequest && <p className="mt-2 rounded-md border border-warn/20 bg-warn/5 p-2 text-xs text-muted">Client request: {document.clientRequest.reason}{document.clientRequest.response ? ` · Client response: ${document.clientRequest.response}` : ''}</p>}
    {document.reviewHistory && <details className="mt-2"><summary className="cursor-pointer text-xs text-cyan">Workflow history ({document.reviewHistory.length})</summary><ul className="mt-2 space-y-1 text-[11px] text-muted">{document.reviewHistory.map((event, index) => <li key={`${event.at}-${index}`}>{new Date(event.at).toLocaleString()} · {event.action}: {event.details}</li>)}</ul></details>}
  </li>;
}
