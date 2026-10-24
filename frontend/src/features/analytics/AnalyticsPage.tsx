import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '@/services/api';
import { EmptyState, ErrorState, Panel, PanelHeader, Select, Skeleton } from '@/components/ui/primitives';
import { AGENT_LABEL } from '@/features/agents/topology';
import { fmtDuration, fmtPercent } from '@/utils/format';

const axis = { stroke: 'rgb(var(--faint))', fontSize: 11 } as const;
const tip = { contentStyle: { background: 'rgb(var(--bg2))', border: '1px solid rgb(var(--line) / .3)', borderRadius: 10, fontSize: 12, color: 'rgb(var(--text))' }, cursor: { fill: 'rgb(var(--line) / .08)' } };
const short = (d: string) => d.slice(5);

function Kpi({ label, value }: { label: string; value: string }) { return <Panel className="p-4"><p className="text-[13px] text-muted">{label}</p><p className="text-2xl font-semibold mt-1 num">{value}</p></Panel>; }

export default function AnalyticsPage() {
  const [days, setDays] = useState(14);
  const q = useQuery({ queryKey: ['analytics', days], queryFn: () => api.analytics(days), refetchInterval: 15000 });
  const a = q.data;
  return (
    <div className="p-3 sm:p-5 max-w-[1300px] mx-auto space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted">All figures are computed from stored tasks and events.</p>
        <Select aria-label="Time range" className="w-36" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</Select></div>
      {q.isError ? <Panel><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></Panel> : q.isLoading ? <Skeleton className="h-80 rounded-xl2" /> : a && a.total_tasks === 0 ? (
        <Panel><EmptyState icon={<BarChart3 className="size-6" />} title="No data in this period" body="Run some tasks and charts will appear here: volume, success rate, durations, agent and tool usage." /></Panel>
      ) : a && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi label="Tasks" value={String(a.total_tasks)} /><Kpi label="Success rate" value={fmtPercent(a.success_rate)} /><Kpi label="Avg duration" value={fmtDuration(a.avg_duration_ms)} /><Kpi label="Slowest run" value={fmtDuration(a.max_duration_ms)} /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel><PanelHeader title="Tasks per day" hint="Completed vs failed vs cancelled" />
            <div className="h-64 px-2 pb-3" role="img" aria-label="Stacked bar chart of tasks per day"><ResponsiveContainer><BarChart data={a.series} margin={{ left: -18, right: 8 }}><CartesianGrid stroke="rgb(var(--line) / .12)" vertical={false} /><XAxis dataKey="date" tickFormatter={short} {...axis} tickLine={false} /><YAxis allowDecimals={false} {...axis} tickLine={false} axisLine={false} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" stackId="a" fill="rgb(var(--green))" name="Completed" /><Bar dataKey="failed" stackId="a" fill="rgb(var(--red))" name="Failed" /><Bar dataKey="cancelled" stackId="a" fill="rgb(var(--amber))" name="Cancelled" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
          <Panel><PanelHeader title="Execution duration" hint="Average per day, completed tasks (seconds)" />
            <div className="h-64 px-2 pb-3" role="img" aria-label="Line chart of average duration per day"><ResponsiveContainer><LineChart data={a.series.map((s) => ({ ...s, sec: s.avg_duration_ms === null ? null : +(s.avg_duration_ms / 1000).toFixed(2) }))} margin={{ left: -18, right: 8 }}><CartesianGrid stroke="rgb(var(--line) / .12)" vertical={false} /><XAxis dataKey="date" tickFormatter={short} {...axis} tickLine={false} /><YAxis {...axis} tickLine={false} axisLine={false} /><Tooltip {...tip} formatter={(v) => [`${v} s`, 'Avg duration']} />
              <Line type="monotone" dataKey="sec" stroke="rgb(var(--cyan))" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Avg duration" /></LineChart></ResponsiveContainer></div></Panel>
          <Panel><PanelHeader title="Agent usage" hint="Runs started" />
            <div className="h-60 px-2 pb-3">{a.agent_usage.length ? <ResponsiveContainer><BarChart layout="vertical" data={a.agent_usage.map((x) => ({ ...x, name: AGENT_LABEL[x.agent] ?? x.agent }))} margin={{ left: 20, right: 12 }}><CartesianGrid stroke="rgb(var(--line) / .12)" horizontal={false} /><XAxis type="number" allowDecimals={false} {...axis} tickLine={false} /><YAxis type="category" dataKey="name" width={80} {...axis} tickLine={false} axisLine={false} /><Tooltip {...tip} /><Bar dataKey="runs" fill="rgb(var(--blue))" radius={[0, 4, 4, 0]} name="Runs" /></BarChart></ResponsiveContainer> : <p className="text-sm text-muted p-4">No agent runs yet.</p>}</div></Panel>
          <Panel><PanelHeader title="Tool usage" hint="Calls and failures" />
            {a.tool_usage.length ? <table className="w-full text-sm"><thead><tr className="text-left text-xs text-faint"><th className="px-4 py-2 font-medium">Tool</th><th className="px-3 py-2 font-medium text-right">Calls</th><th className="px-4 py-2 font-medium text-right">Failed</th></tr></thead><tbody>{a.tool_usage.map((t) => <tr key={t.tool} className="border-t hairline"><td className="px-4 py-2 font-mono text-[13px]">{t.tool}</td><td className="px-3 py-2 text-right num">{t.calls}</td><td className={`px-4 py-2 text-right num ${t.failed ? 'text-bad' : 'text-muted'}`}>{t.failed}</td></tr>)}</tbody></table> : <p className="text-sm text-muted px-4 pb-4">No tools have been called in this period.</p>}</Panel>
        </div></>)}
    </div>
  );
}
