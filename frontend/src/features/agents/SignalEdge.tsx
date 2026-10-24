import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { useMotion } from '@/hooks/useMotion';

/** Edge whose glow and travelling particles are driven only by the execution store (i.e. real backend events). */
function SignalEdgeImpl(p: EdgeProps) {
  const [path] = getBezierPath({ sourceX: p.sourceX, sourceY: p.sourceY, sourcePosition: p.sourcePosition, targetX: p.targetX, targetY: p.targetY, targetPosition: p.targetPosition, curvature: 0.28 });
  const status = useExecutionStore((s) => s.edges[p.id]);
  const motion = useMotion();
  const kind = (p.data as { kind?: string } | undefined)?.kind ?? 'data';
  const color = status === 'error' ? 'rgb(var(--red))' : kind === 'control' ? 'rgb(var(--violet))' : 'rgb(var(--cyan))';

  const base = kind === 'control' ? { stroke: 'rgb(var(--violet) / .16)', strokeWidth: 1, strokeDasharray: '3 6' } : { stroke: 'rgb(var(--line) / .3)', strokeWidth: 1.5 };
  const lit = status === 'active'
    ? { stroke: color, strokeWidth: 2.2, filter: `drop-shadow(0 0 5px ${color})` }
    : status === 'done' ? { stroke: color, strokeWidth: 1.8, opacity: 0.55 }
    : status === 'error' ? { stroke: color, strokeWidth: 2, strokeDasharray: '4 5' } : null;

  return (
    <g>
      <BaseEdge id={p.id} path={path} style={lit ?? base} className={status === 'active' && motion === 'full' ? 'edge-flow' : undefined} />
      {status === 'active' && motion === 'full' && [0, 0.55, 1.1].map((delay) => (
        <circle key={delay} r={3.2} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
          <animateMotion dur="1.7s" begin={`${delay}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </g>
  );
}
export const SignalEdge = memo(SignalEdgeImpl);
