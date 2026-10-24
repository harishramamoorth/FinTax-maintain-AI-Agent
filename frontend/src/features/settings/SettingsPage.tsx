import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, errorMessage } from '@/services/api';
import { Badge, Button, DemoBadge, ErrorState, Input, Panel, PanelHeader, Select, Skeleton, Switch } from '@/components/ui/primitives';
import { useAgents, useHealth, useSettings } from '@/hooks/queries';
import { useUiStore, type MotionLevel } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import type { AgentInfo } from '@/types/api';
import { fmtDateTime } from '@/utils/format';

function Row({ k, children }: { k: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 py-2.5 border-t hairline first:border-0 text-sm"><span className="text-muted">{k}</span><span className="text-right min-w-0 break-words">{children}</span></div>; }
const Flag = ({ on, yes = 'Enabled', no = 'Not configured' }: { on: boolean; yes?: string; no?: string }) => on ? <Badge tone="ok"><CheckCircle2 className="size-3" />{yes}</Badge> : <Badge><CircleSlash className="size-3" />{no}</Badge>;

function AgentRow({ a }: { a: AgentInfo }) {
  const qc = useQueryClient();
  const [model, setModel] = useState(a.model ?? ''); const [temp, setTemp] = useState(String(a.temperature)); const [max, setMax] = useState(String(a.max_tokens)); const [enabled, setEnabled] = useState(a.enabled);
  useEffect(() => { setModel(a.model ?? ''); setTemp(String(a.temperature)); setMax(String(a.max_tokens)); setEnabled(a.enabled); }, [a]);
  const required = a.key === 'planner' || a.key === 'response';
  const dirty = model !== (a.model ?? '') || Number(temp) !== a.temperature || Number(max) !== a.max_tokens || enabled !== a.enabled;
  const save = useMutation({ mutationFn: () => api.updateAgent(a.key, { model: model.trim() || null, temperature: Number(temp), max_tokens: Number(max), enabled }), onSuccess: () => { toast.success(`${a.name} updated`); void qc.invalidateQueries({ queryKey: ['agents'] }); }, onError: (e) => toast.error('Could not save', errorMessage(e)) });
  const bad = !(Number(temp) >= 0 && Number(temp) <= 1.5) || !(Number(max) >= 64 && Number(max) <= 4096);
  return (
    <tr className="border-t hairline align-middle">
      <td className="px-4 py-2.5"><p className="text-sm font-medium">{a.name}</p><p className="text-[11px] text-faint">{a.uses_model ? 'uses the model' : 'tool-only'}</p></td>
      <td className="px-2 py-2.5"><Input aria-label={`${a.name} model`} className="h-9 min-w-[9rem]" placeholder={a.effective_model} value={model} disabled={!a.uses_model} onChange={(e) => setModel(e.target.value)} /></td>
      <td className="px-2 py-2.5"><Input aria-label={`${a.name} temperature`} className="h-9 w-20" type="number" step="0.1" min={0} max={1.5} value={temp} disabled={!a.uses_model} onChange={(e) => setTemp(e.target.value)} /></td>
      <td className="px-2 py-2.5"><Input aria-label={`${a.name} max tokens`} className="h-9 w-24" type="number" step="64" min={64} max={4096} value={max} disabled={!a.uses_model} onChange={(e) => setMax(e.target.value)} /></td>
      <td className="px-2 py-2.5"><Switch checked={enabled} onChange={setEnabled} label={`${a.name} enabled`} disabled={required} /></td>
      <td className="px-4 py-2.5 text-right"><Button size="sm" variant="primary" disabled={!dirty || bad} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></td>
    </tr>
  );
}

export default function SettingsPage() {
  const s = useSettings(); const h = useHealth(); const agents = useAgents(); const qc = useQueryClient();
  const motion = useUiStore((x) => x.motion); const setMotion = useUiStore((x) => x.setMotion);
  const verbosity = useUiStore((x) => x.verbosity); const setVerbosity = useUiStore((x) => x.setVerbosity);
  const theme = useUiStore((x) => x.theme); const setTheme = useUiStore((x) => x.setTheme);
  const savePref = useMutation({ mutationFn: api.savePreferences, onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }), onError: (e) => toast.error('Could not save preference', errorMessage(e)) });
  const tools = useQuery({ queryKey: ['tools'], queryFn: api.tools });
  const d = s.data;
  if (s.isError) return <div className="p-6"><Panel><ErrorState message={errorMessage(s.error)} onRetry={() => s.refetch()} /></Panel></div>;
  return (
    <div className="p-3 sm:p-5 max-w-[1100px] mx-auto grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="AI provider" hint="Configured on the server with environment variables. Keys are never shown or stored in the browser." actions={d?.mode === 'demo' ? <DemoBadge /> : <Badge tone="ok">live</Badge>} />
        <div className="px-4 pb-4">{!d ? <Skeleton className="h-32" /> : (<>
          <Row k="Mode">{d.mode === 'demo' ? 'Demo (simulated model output)' : 'Live'}</Row>
          <Row k="API key"><Flag on={d.provider.configured} yes="Configured" no="Not set" /></Row>
          <Row k="Model"><span className="font-mono text-[13px]">{d.provider.model}</span></Row>
          <Row k="Endpoint host"><span className="font-mono text-[13px]">{d.provider.host}</span></Row>
          <Row k="DEMO_MODE setting"><span className="font-mono text-[13px]">{d.demo_mode_setting}</span></Row>
          {!d.provider.configured && <div className="mt-3 rounded-lg border hairline bg-bg/40 p-3 text-xs text-muted space-y-1.5"><p className="text-ink text-sm font-medium">Go live</p><p>Set these on the server (in <span className="font-mono">.env</span> or your host's dashboard), then restart:</p><pre className="font-mono text-[12px] text-ink/90">AI_API_KEY=your-key{'\n'}AI_BASE_URL=https://api.openai.com/v1{'\n'}AI_MODEL=gpt-4o-mini{'\n'}DEMO_MODE=auto</pre><p>Any OpenAI-compatible endpoint works. Set <span className="font-mono">DEMO_MODE=false</span> to make missing credentials an explicit error.</p></div>}
        </>)}</div>
      </Panel>

      <Panel>
        <PanelHeader title="Backend health" actions={<Badge tone={h.data?.status === 'ok' ? 'ok' : 'bad'}>{h.data?.status ?? (h.isError ? 'unreachable' : '…')}</Badge>} />
        <div className="px-4 pb-4">{h.data ? (<>
          <Row k="Version">{h.data.version}</Row><Row k="Database">{h.data.database === 'ok' ? `connected (${d?.database ?? ''})` : 'unavailable'}</Row><Row k="Server time">{fmtDateTime(h.data.time)}</Row>
          <Row k="Access token required"><Flag on={h.data.auth_required} yes="Yes" no="No (local use)" /></Row>
        </>) : h.isError ? <p className="text-sm text-bad py-3">The API is not reachable. Start it with <span className="font-mono">npm run dev</span>.</p> : <Skeleton className="h-24" />}</div>
      </Panel>

      <Panel>
        <PanelHeader title="Features" />
        <div className="px-4 pb-4">{d && (<>
          <Row k="Web search (Brave)"><Flag on={d.search.configured} no="Needs SEARCH_API_KEY" /></Row>
          <Row k="Knowledge search"><Badge tone="cyan">keyword matching</Badge></Row>
          <Row k="Semantic / vector search"><Badge>not implemented</Badge></Row>
          <Row k="Workflow builder"><Flag on yes="Enabled" /></Row>
        </>)}</div>
      </Panel>

      <Panel>
        <PanelHeader title="Execution limits" hint="Set by the server environment." />
        <div className="px-4 pb-4">{d && Object.entries(d.limits).map(([k, v]) => <Row key={k} k={k.replace(/_/g, ' ')}><span className="num">{v}</span></Row>)}</div>
      </Panel>

      <Panel className="lg:col-span-2">
        <PanelHeader title="Interface preferences" hint="Stored on the server; no secrets." />
        <div className="px-4 pb-4 grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm"><span className="text-muted">Animations</span>
            <Select value={motion} onChange={(e) => { const v = e.target.value as MotionLevel; setMotion(v); savePref.mutate({ animation_level: v }); }}><option value="full">Full (particles, glows)</option><option value="reduced">Reduced (static highlights)</option><option value="off">Off</option></Select>
            <span className="block text-xs text-faint">Your OS "reduce motion" setting always takes precedence.</span></label>
          <label className="space-y-1.5 text-sm"><span className="text-muted">Execution log detail</span>
            <Select value={verbosity} onChange={(e) => { const v = e.target.value as 'normal' | 'verbose'; setVerbosity(v); savePref.mutate({ log_verbosity: v }); }}><option value="normal">Normal</option><option value="verbose">Verbose (handoffs, tool output)</option></Select></label>
          <label className="space-y-1.5 text-sm"><span className="text-muted">Theme</span><Select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}><option value="dark">Dark</option><option value="light">Light</option></Select></label>
        </div>
      </Panel>

      <Panel className="lg:col-span-2 overflow-hidden">
        <PanelHeader title="Agent configuration" hint="Give any model-backed agent its own model, temperature and token cap. Leave the model blank to use the default." />
        {agents.isLoading ? <Skeleton className="h-48 m-4" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="text-left text-xs text-faint"><th className="px-4 py-2 font-medium">Agent</th><th className="px-2 py-2 font-medium">Model</th><th className="px-2 py-2 font-medium">Temp</th><th className="px-2 py-2 font-medium">Max tokens</th><th className="px-2 py-2 font-medium">Enabled</th><th /></tr></thead>
            <tbody>{agents.data?.map((a) => <AgentRow key={a.key} a={a} />)}</tbody></table></div>)}
      </Panel>

      <Panel className="lg:col-span-2">
        <PanelHeader title="Tool registry" hint="Allow-listed tools. No shell, arbitrary code or filesystem access exists." />
        <ul className="px-4 pb-4 grid gap-2 sm:grid-cols-2">{tools.data?.map((t) => (
          <li key={t.name} className={clsx('rounded-lg border hairline p-3', !t.available && 'opacity-60')}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[13px]">{t.name}</span><Badge tone={t.available ? 'ok' : 'neutral'}>{t.available ? 'available' : 'not configured'}</Badge></div><p className="text-xs text-muted mt-1">{t.description}</p><p className="text-[11px] text-faint mt-1.5 font-mono">needs: {t.permissions.join(', ')}</p></li>))}</ul>
      </Panel>
    </div>
  );
}
