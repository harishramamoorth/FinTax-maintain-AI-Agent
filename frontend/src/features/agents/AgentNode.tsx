import { Handle, Position, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { AlertTriangle, Check, MinusCircle, Square } from 'lucide-react';
import { memo } from 'react';
import { nodeStatusFor, useExecutionStore } from '@/stores/executionStore';
import { fmtDuration } from '@/utils/format';
import { AGENT_META } from './meta';

export interface AgentNodeData extends Record<string, unknown> { id: string; type: string; label: string; selected?: boolean; builder?: boolean; noStatus?: boolean; config?: Record<string, any> }

const accentText = { cyan: 'text-cyan', violet: 'text-violet', blue: 'text-blue', magenta: 'text-magenta' } as const;
const accentBg = { cyan: 'bg-cyan/10 border-cyan/30', violet: 'bg-violet/10 border-violet/30', blue: 'bg-blue/10 border-blue/30', magenta: 'bg-magenta/10 border-magenta/30' } as const;
const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];

function AgentNodeImpl({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const meta = AGENT_META[d.type] ?? AGENT_META.execution;
  const Icon = meta.icon;
  const status = useExecutionStore((s) => (d.noStatus ? 'idle' : nodeStatusFor(s, d.id)));
  const ns = useExecutionStore((s) => (d.noStatus ? undefined : s.nodes[d.id]));
  const tick = useExecutionStore((s) => s.completionTick);
  const orch = d.id === 'orchestrator';
  const active = status === 'active';

  let line = 'Idle';
  if (active) line = ns?.tool ? `Tool · ${ns.tool}` : orch ? 'Coordinating' : 'Working…';
  else if (status === 'completed') line = orch ? 'Run complete' : `Done · ${fmtDuration(ns?.durationMs)}`;
  else if (status === 'failed') line = orch ? 'Run failed' : 'Failed';
  else if (status === 'skipped') line = 'Not needed';
  else if (status === 'cancelled') line = 'Cancelled';

  return (
    <div
      role="group" aria-label={`${d.label} agent, ${line}`}
      className={clsx('relative rounded-2xl border backdrop-blur-md transition-[opacity,border-color,background-color] duration-300 select-none',
        orch ? 'w-[224px] px-4 py-4' : 'w-[190px] px-3.5 py-3',
        'bg-[rgb(var(--panel)/.82)]',
        status === 'active' && 'node-active border-cyan/70',
        status === 'completed' && 'border-ok/45',
        status === 'failed' && 'border-bad/70 shadow-[0_0_24px_-6px_rgb(var(--red)/.6)]',
        status === 'skipped' && 'opacity-45 border-dashed hairline',
        status === 'cancelled' && 'border-warn/40',
        status === 'idle' && 'hairline',
        selected && 'ring-2 ring-violet/60 ring-offset-2 ring-offset-transparent',
      )}>
      {SIDES.map(([side, pos]) => (
        <span key={side}>
          <Handle id={`in-${side}`} type="target" position={pos} isConnectable={!!d.builder} />
          <Handle id={`out-${side}`} type="source" position={pos} isConnectable={!!d.builder} />
        </span>
      ))}
      {orch && active && <span className="absolute inset-0 rounded-2xl ring-1 ring-violet/50 animate-ping opacity-30" aria-hidden />}
      {d.id === 'response' && status === 'completed' && tick > 0 && <span key={tick} className="burst absolute inset-0 rounded-2xl border-2 border-magenta/60 pointer-events-none" aria-hidden />}
      <div className="flex items-center gap-3">
        <div className={clsx('grid place-items-center rounded-xl border shrink-0', orch ? 'size-11' : 'size-9', accentBg[meta.accent], accentText[meta.accent])}>
          <Icon className={orch ? 'size-5' : 'size-[18px]'} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{d.label}</p>
          <p className={clsx('text-xs mt-0.5 truncate num', active ? 'text-cyan' : status === 'failed' ? 'text-bad' : status === 'completed' ? 'text-ok' : 'text-muted')}>{line}</p>
        </div>
        <span className="ml-auto self-start mt-0.5" aria-hidden>
          {status === 'active' && <span className="relative block size-2 rounded-full bg-cyan text-cyan dot-pulse" />}
          {status === 'completed' && <Check className="size-4 text-ok" />}
          {status === 'failed' && <AlertTriangle className="size-4 text-bad" />}
          {status === 'skipped' && <MinusCircle className="size-3.5 text-faint" />}
          {status === 'cancelled' && <Square className="size-3.5 text-warn" />}
        </span>
      </div>
    </div>
  );
}
export const AgentNode = memo(AgentNodeImpl);
