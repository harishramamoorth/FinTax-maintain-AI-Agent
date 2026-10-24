import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-cyan text-bg font-semibold hover:brightness-105',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5',
  outline: 'border hairline text-ink hover:bg-ink/5 hover:border-cyan/40',
  danger: 'border border-bad/40 text-bad hover:bg-bad/10',
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'outline', size = 'md', loading, icon, className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading} {...p}
    className={clsx('inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed select-none whitespace-nowrap',
      size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm', variants[variant], className)}>
    {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
    {children}
  </button>
));
Button.displayName = 'Button';

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...p}
      className={clsx('inline-grid place-items-center size-9 rounded-lg text-muted hover:text-ink hover:bg-ink/5 transition-colors disabled:opacity-40', className)}>
      {children}
    </button>
  );
}

export function Panel({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={clsx('glass rounded-xl2', className)}>{children}</div>;
}

export function PanelHeader({ title, hint, actions }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'ok' | 'bad' | 'warn' | 'cyan' | 'violet';
const tones: Record<Tone, string> = {
  neutral: 'text-muted bg-ink/5 border-ink/10', ok: 'text-ok bg-ok/10 border-ok/25', bad: 'text-bad bg-bad/10 border-bad/25',
  warn: 'text-warn bg-warn/10 border-warn/25', cyan: 'text-cyan bg-cyan/10 border-cyan/25', violet: 'text-violet bg-violet/10 border-violet/25',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5', tones[tone], className)}>{children}</span>;
}

export const statusTone = (s: string): Tone => ({ completed: 'ok', failed: 'bad', running: 'cyan', queued: 'warn', cancelled: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)}>
      <span className="relative inline-block size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </Badge>
  );
}
export const DemoBadge = ({ className }: { className?: string }) => <Badge tone="warn" className={className}>DEMO · simulated model</Badge>;

export function Spinner({ className }: { className?: string }) { return <Loader2 className={clsx('size-4 animate-spin text-muted', className)} aria-label="Loading" />; }

export function Skeleton({ className }: { className?: string }) { return <div className={clsx('animate-pulse rounded-md bg-ink/8', className)} aria-hidden />; }

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
      {icon && <div className="grid place-items-center size-12 rounded-xl border hairline text-cyan bg-cyan/5">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="text-sm text-muted max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-bad font-medium">Couldn't load this</p>
      <p className="text-sm text-muted max-w-md">{message}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

const field = 'w-full rounded-lg bg-bg/60 border hairline px-3 text-sm text-ink placeholder:text-faint focus:border-cyan/60 focus:outline-none focus:ring-2 focus:ring-cyan/20 transition-colors disabled:opacity-50';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={clsx(field, 'h-10', className)} />);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} {...p} className={clsx(field, 'py-2.5 resize-y', className)} />);
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} {...p} className={clsx(field, 'h-10 pr-8', className)} />);
Select.displayName = 'Select';

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string | null; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink/90">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={clsx('relative h-6 w-11 rounded-full border transition-colors disabled:opacity-40', checked ? 'bg-cyan/80 border-cyan' : 'bg-ink/10 hairline')}>
      <span className={clsx('absolute top-0.5 size-4.5 rounded-full bg-white transition-all', checked ? 'left-[22px]' : 'left-0.5')} style={{ width: 18, height: 18 }} />
    </button>
  );
}

export function ProgressBar({ value, active, tone = 'cyan' }: { value: number; active?: boolean; tone?: 'cyan' | 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'bg-ok' : tone === 'bad' ? 'bg-bad' : 'bg-gradient-to-r from-blue via-cyan to-violet';
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
      <div className={clsx('relative h-full rounded-full transition-[width] duration-500 ease-out overflow-hidden', color, active && 'progress-sheen')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
