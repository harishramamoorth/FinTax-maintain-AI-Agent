import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, LockKeyhole, Upload } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/services/api';
import { Button, Field, Input, Panel } from '@/components/ui/primitives';
import type { FinTaxDocument } from '@/types/api';

const CATEGORIES = [
  ['company_formation', 'Company formation'],
  ['accounting', 'Accounting / FiBu'],
  ['bank_statement', 'Bank statement'],
  ['purchase_invoice', 'Purchase invoice'],
  ['sales_invoice', 'Sales invoice'],
  ['receipt', 'Receipt'],
  ['cash_book', 'Cash book'],
  ['payroll', 'Payroll'],
  ['employee_record', 'Employee record'],
  ['correspondence', 'Correspondence'],
  ['identity_document', 'Identity document'],
  ['contract', 'Contract'],
  ['other', 'Other'],
];

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  const documents = useQuery({ queryKey: ['fintax-documents'], queryFn: api.documents });
  const clients = useQuery({
    queryKey: ['fintax-clients'],
    queryFn: api.clients,
    enabled: account.data?.user.role === 'admin' || account.data?.user.role === 'staff',
  });
  const [category, setCategory] = useState('accounting');
  const [clientId, setClientId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const upload = useMutation({
    mutationFn: () => api.uploadDocument(file!, category, account.data?.user.role === 'client' ? undefined : clientId),
    onSuccess: () => {
      setFile(null);
      const input = document.getElementById('document-file') as HTMLInputElement | null;
      if (input) input.value = '';
      void queryClient.invalidateQueries({ queryKey: ['fintax-documents'] });
    },
    onError: (error) => setUploadError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Upload failed'),
  });
  const role = account.data?.user.role;
  const prettyCategory = (value: string) => CATEGORIES.find(([key]) => key === value)?.[1] ?? value;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div><p className="text-sm font-medium text-cyan">FinTax Consulting</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Documents</h1><p className="mt-2 text-sm text-muted">Originals are stored privately in the configured server storage. Staff access follows client assignments.</p></div>

      <Panel className="p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan/10 text-cyan"><Upload className="size-5" /></span><div><h2 className="font-semibold">Upload a document</h2><p className="mt-1 text-xs text-muted">PDF, JPEG, PNG, or WebP · up to 50 MB · PDF page limit: 200</p></div></div>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          setUploadError('');
          if (!file) { setUploadError('Choose a document to upload.'); return; }
          if (file.size > 50 * 1024 * 1024) { setUploadError('The maximum upload size is 50 MB.'); return; }
          if (role !== 'client' && !clientId) { setUploadError('Choose the client for this document.'); return; }
          upload.mutate();
        }}>
          {role !== 'client' && <Field label="Client account" htmlFor="document-client">
            <select id="document-client" required value={clientId} onChange={(event) => setClientId(event.target.value)} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm">
              <option value="">Select a client</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.client_number}</option>)}
            </select>
          </Field>}
          <Field label="Document category" htmlFor="document-category">
            <select id="document-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm">
              {CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <Field label="Choose file" htmlFor="document-file">
            <Input id="document-file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="py-2" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </Field>
          <div className="flex items-end"><Button type="submit" variant="primary" icon={<Upload className="size-4" />} loading={upload.isPending} className="w-full">Upload original</Button></div>
        </form>
        {uploadError && <p role="alert" className="mt-3 text-sm text-bad">{uploadError}</p>}
        {upload.isSuccess && <p role="status" className={`mt-3 text-sm ${upload.data.status === 'duplicate' ? 'text-warn' : 'text-green'}`}>
          {upload.data.status === 'duplicate' ? 'This file matches a document already uploaded for this client.' : 'Document received and stored. AI extraction is not enabled yet.'}
        </p>}
        <p className="mt-4 flex items-start gap-2 text-xs text-muted"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Uploads are not yet processed by OCR or an AI classifier. Password-protected PDFs are stored securely and marked for password handling; the PDF password is never requested or stored here.</p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center gap-3 border-b hairline px-5 py-4"><FileText className="size-5 text-cyan" /><div><h2 className="font-semibold">Uploaded files</h2><p className="text-xs text-muted">Only documents permitted for your account are shown.</p></div></div>
        {documents.isLoading ? <p className="p-5 text-sm text-muted">Loading documents…</p>
          : documents.isError ? <p role="alert" className="p-5 text-sm text-bad">Could not load documents.</p>
            : documents.data?.length ? <ul className="divide-y divide-line/10">{documents.data.map((item) => <DocumentRow key={item.id} item={item} category={prettyCategory(item.category)} />)}</ul>
              : <p className="p-8 text-center text-sm text-muted">No documents have been uploaded yet.</p>}
      </Panel>
    </div>
  );
}

function DocumentRow({ item, category }: { item: FinTaxDocument; category: string }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="grid size-9 place-items-center rounded-lg bg-violet/10 text-violet"><FileText className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.original_filename}</span><span className="block text-xs text-muted">{category} · {formatSize(item.size_bytes)}{item.page_count ? ` · ${item.page_count} pages` : ''}</span></span>
      <span className={`text-xs ${item.status === 'received' ? 'text-green' : 'text-warn'}`}>{item.status === 'password_required' ? 'Password handling needed' : item.status === 'duplicate' ? 'Possible duplicate' : 'Received'}</span>
      <a href={`/api/documents/${encodeURIComponent(item.id)}/download`} className="inline-flex h-9 items-center gap-2 rounded-lg border hairline px-3 text-sm hover:border-cyan/40" download><Download className="size-4" />Download original</a>
    </li>
  );
}
