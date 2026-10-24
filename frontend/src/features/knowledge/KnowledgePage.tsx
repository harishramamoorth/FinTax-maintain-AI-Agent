import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, EyeOff, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '@/services/api';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Panel, Skeleton, Switch, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { useDebounced } from '@/hooks/useDebounced';
import { toast } from '@/stores/toastStore';
import { timeAgo } from '@/utils/format';

interface Form { title: string; content: string; tags: string; agent_accessible: boolean }
const empty: Form = { title: '', content: '', tags: '', agent_accessible: true };

function DocModal({ id, creating, onClose }: { id: string | null; creating: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(empty); const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({}); const [confirm, setConfirm] = useState(false);
  const doc = useQuery({ queryKey: ['document', id], queryFn: () => api.document(id!), enabled: !!id && !creating });
  useEffect(() => { if (creating) setF(empty); }, [creating]);
  useEffect(() => { if (doc.data && !creating) setF({ title: doc.data.title, content: doc.data.content, tags: doc.data.tags.join(', '), agent_accessible: doc.data.agent_accessible }); }, [doc.data, creating]);
  const done = () => { void qc.invalidateQueries({ queryKey: ['knowledge'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); };
  const body = () => ({ title: f.title.trim(), content: f.content.trim(), tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), agent_accessible: f.agent_accessible });
  const save = useMutation({ mutationFn: () => (creating ? api.createDocument(body()) : api.updateDocument(id!, body())), onSuccess: () => { toast.success(creating ? 'Document added' : 'Document saved'); done(); }, onError: (e) => toast.error('Could not save', errorMessage(e)) });
  const del = useMutation({ mutationFn: () => api.deleteDocument(id!), onSuccess: () => { toast.success('Document deleted'); setConfirm(false); done(); }, onError: (e) => toast.error('Could not delete', errorMessage(e)) });
  const submit = () => {
    const e: typeof errs = {};
    if (!f.title.trim()) e.title = 'Give the document a title.'; if (!f.content.trim()) e.content = 'Add some content to search.'; if (f.content.length > 50000) e.content = 'Content is limited to 50,000 characters.';
    setErrs(e); if (!Object.keys(e).length) save.mutate();
  };
  return (<>
    <Modal open={creating || !!id} onClose={onClose} title={creating ? 'New document' : 'Edit document'} width="max-w-2xl"
      footer={<>{!creating && <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{creating ? 'Add document' : 'Save changes'}</Button></>}>
      {doc.isError && !creating ? <ErrorState message={errorMessage(doc.error)} /> : (
        <div className="space-y-4">
          <Field label="Title" htmlFor="kd-title" error={errs.title}><Input id="kd-title" value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Content" htmlFor="kd-content" error={errs.content}><Textarea id="kd-content" rows={10} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field>
          <Field label="Tags" htmlFor="kd-tags" hint="Comma separated, up to 10."><Input id="kd-tags" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border hairline p-3"><div><p className="text-sm font-medium">Readable by agents</p><p className="text-xs text-muted">When off, the document stays private: the knowledge search tool can never return it.</p></div><Switch checked={f.agent_accessible} onChange={(v) => setF({ ...f, agent_accessible: v })} label="Readable by agents" /></div>
        </div>)}
    </Modal>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => del.mutate()} loading={del.isPending} title="Delete this document?" body="This permanently removes the document. Past task results that cited it are not changed." />
  </>);
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams(); const [q, setQ] = useState(''); const [tag, setTag] = useState(''); const [creating, setCreating] = useState(false);
  const dq = useDebounced(q.trim(), 250); const open = params.get('open');
  const list = useQuery({ queryKey: ['knowledge', dq, tag], queryFn: () => api.knowledge({ q: dq, tag, page_size: 100 }), placeholderData: keepPreviousData });
  const tags = Array.from(new Set(list.data?.items.flatMap((d) => d.tags) ?? [])).sort();
  const close = () => { setCreating(false); setParams({}); };
  return (
    <div className="p-3 sm:p-5 max-w-[1100px] mx-auto space-y-4">
      <Panel className="p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[14rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" aria-hidden /><Input aria-label="Search documents" className="pl-9" placeholder="Keyword search across titles, tags and content" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {tags.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Filter by tag">{tags.slice(0, 8).map((t) => <button key={t} onClick={() => setTag(tag === t ? '' : t)} aria-pressed={tag === t} className={`text-xs px-2.5 py-1 rounded-full border ${tag === t ? 'border-cyan text-cyan bg-cyan/10' : 'hairline text-muted hover:text-ink'}`}>{t}</button>)}</div>}
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New document</Button>
      </Panel>
      <p className="text-xs text-faint px-1">Search is keyword matching (title ×3, tags ×2, content). There is no semantic or vector search.</p>
      {list.isError ? <Panel><ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /></Panel> : list.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl2" />)}</div>
        : list.data!.items.length === 0 ? <Panel><EmptyState icon={<BookOpen className="size-6" />} title={dq || tag ? 'No documents match' : 'Your knowledge base is empty'} body={dq || tag ? 'Try different keywords or clear the tag filter.' : 'Add notes, policies or reference text. The Research agent can search documents you mark as readable by agents.'} action={dq || tag ? undefined : <Button variant="primary" onClick={() => setCreating(true)}>Add your first document</Button>} /></Panel>
        : <div className="grid gap-3 sm:grid-cols-2">{list.data!.items.map((d) => (
          <button key={d.id} onClick={() => setParams({ open: d.id })} className="glass rounded-xl2 p-4 text-left hover:border-cyan/40 transition-colors">
            <div className="flex items-start justify-between gap-2"><p className="font-medium">{d.title}</p>{d.agent_accessible ? <Eye className="size-4 text-faint shrink-0" aria-label="Readable by agents" /> : <EyeOff className="size-4 text-warn shrink-0" aria-label="Hidden from agents" />}</div>
            <p className="text-sm text-muted mt-1.5 line-clamp-3 break-words">{d.snippet}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}{!d.agent_accessible && <Badge tone="warn">private</Badge>}<span className="ml-auto text-[11px] text-faint">{timeAgo(d.updated_at)}</span></div>
          </button>))}</div>}
      <DocModal id={open} creating={creating} onClose={close} />
    </div>
  );
}
