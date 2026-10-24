import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine, ArrowRight, Banknote, ClipboardCheck, FileSearch,
  MessageSquareText, ShieldCheck, Upload, type LucideIcon,
} from 'lucide-react';

type Counts = {
  upload: number;
  extract: number;
  validate: number;
  review: number;
  export: number;
};

type Target = 'documents' | 'review' | 'exports';

const STEPS: {
  number: number;
  title: string;
  detail: string;
  screen: Target;
  icon: LucideIcon;
  tag: (counts: Counts) => string;
}[] = [
  { number: 1, title: 'Client upload', detail: 'Files received in this browser', screen: 'documents', icon: Upload, tag: (counts) => `${counts.upload} received` },
  { number: 2, title: 'Classify & extract', detail: 'Selectable PDF text parsed locally', screen: 'documents', icon: FileSearch, tag: (counts) => `${counts.extract} processing` },
  { number: 3, title: 'Validate', detail: 'Check totals, dates and fields', screen: 'review', icon: ShieldCheck, tag: (counts) => `${counts.validate} flagged` },
  { number: 4, title: 'Staff review', detail: 'Approve or request a correction', screen: 'review', icon: ClipboardCheck, tag: (counts) => `${counts.review} waiting` },
  { number: 5, title: 'Export', detail: 'Download approved demo records', screen: 'exports', icon: ArrowDownToLine, tag: (counts) => `${counts.export} approved` },
];

const cardStyle = 'rounded-3xl border border-white/90 bg-white/90 shadow-[0_18px_48px_-32px_rgba(40,70,140,.4)] backdrop-blur';

export function PulseHero({
  badge, description, reviewCount, onIntake, onReview,
}: {
  badge: string;
  description: string;
  reviewCount: number;
  onIntake: () => void;
  onReview: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const decorativeTiles: [LucideIcon, string, number, number][] = [
    [Upload, 'start-4 top-5 -rotate-12 sm:start-10 sm:top-8', 5, 0],
    [ClipboardCheck, 'end-4 top-8 rotate-12 sm:end-10 sm:top-10', 6, 0.8],
    [Banknote, 'start-6 bottom-28 rotate-6 max-sm:hidden sm:start-16', 7, 0.4],
    [MessageSquareText, 'end-6 bottom-24 -rotate-6 max-sm:hidden sm:end-16', 5.5, 1.2],
  ];

  return (
    <section aria-label="Admin workspace overview" className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/60 px-4 pb-7 pt-8 text-center shadow-[0_30px_80px_-50px_rgba(40,70,140,.4)] backdrop-blur-xl sm:rounded-[2rem] sm:px-10 sm:pb-16 sm:pt-14">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 overflow-hidden">
        {['w-[150%]', 'w-[110%]', 'w-[72%]'].map((width, index) => (
          <span
            key={width}
            className={`absolute start-1/2 top-[40%] aspect-square -translate-x-1/2 rounded-full border border-blue-200/50 ${width}`}
            style={{ background: `radial-gradient(circle, rgba(59,130,246,${0.04 + index * 0.035}), rgba(255,255,255,0) 70%)` }}
          />
        ))}
      </div>
      {decorativeTiles.map(([Icon, position, duration, delay], index) => (
        <motion.span
          key={index}
          aria-hidden="true"
          className={`absolute hidden size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] text-white shadow-[0_18px_30px_-10px_rgba(37,99,235,.45)] sm:grid sm:size-14 lg:size-16 ${position}`}
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
        >
          <Icon className="size-5 sm:size-6 lg:size-7" />
        </motion.span>
      ))}
      <div className="relative mx-auto max-w-3xl">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white bg-white/85 px-3 py-1.5 text-[10px] text-slate-600 shadow-sm sm:text-xs">
          <ShieldCheck className="size-3.5 shrink-0 text-blue-600" />
          <span className="truncate">{badge}</span>
        </span>
        <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(1.8rem,8vw,3rem)] font-light leading-[1.08] tracking-tight text-slate-800 sm:mt-5 sm:text-5xl lg:text-6xl">
          Client documents, from intake to <strong className="font-bold text-slate-950">validated export</strong>.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[13px] leading-5 text-slate-600 sm:mt-4 sm:text-base sm:leading-6">{description}</p>
        <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:mt-7 sm:flex-row sm:gap-3">
          <motion.button type="button" onClick={onIntake} whileTap={reduceMotion ? undefined : { scale: 0.97 }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-6 text-sm font-medium text-white shadow-[0_14px_30px_-12px_rgba(15,23,42,.5)] transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:px-7">
            <Upload className="size-4" />Open document intake
          </motion.button>
          <motion.button type="button" onClick={onReview} whileTap={reduceMotion ? undefined : { scale: 0.97 }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white bg-white/90 px-6 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto sm:px-7">
            <ClipboardCheck className="size-4" />Review queue ({reviewCount})
          </motion.button>
        </div>
      </div>
    </section>
  );
}

function WorkflowCard({
  step, counts, onSelect, className = '', style,
}: {
  step: typeof STEPS[number];
  counts: Counts;
  onSelect: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = step.icon;
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-label={`Step ${step.number}: ${step.title}. ${step.tag(counts)}`}
      style={style}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      className={`group flex min-w-0 flex-col rounded-2xl border border-white/90 bg-white/90 p-3.5 text-start shadow-[0_12px_32px_-24px_rgba(40,70,140,.42)] backdrop-blur transition-shadow hover:shadow-lg hover:shadow-blue-900/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:rounded-3xl sm:p-4 ${className}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-slate-500 sm:text-[11px]">Step {step.number}</span>
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
          <Icon className="size-4" />
        </span>
      </span>
      <span className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 sm:text-sm">{step.title}</span>
      <span className="mt-0.5 text-[11px] leading-4 text-slate-600">{step.detail}</span>
      <span className="mt-auto pt-2.5">
        <span className="inline-flex max-w-full rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-medium leading-4 text-white">{step.tag(counts)}</span>
      </span>
    </motion.button>
  );
}

export function FlowDiagram({
  counts, onNavigate,
}: {
  counts: Counts;
  onNavigate: (screen: Target) => void;
}) {
  const reduceMotion = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const coordinate = (value: number, mirror = false) => Math.round((mirror ? 1000 - value : value) * width / 1000);
  const sidePath = (mirror: boolean, upper: boolean) => {
    const y = upper ? 82 : 338;
    const bendIn = upper ? 132 : 288;
    const bendOut = upper ? 162 : 258;
    return `M${coordinate(260, mirror)} ${y} H${coordinate(335, mirror)} Q${coordinate(382, mirror)} ${y} ${coordinate(382, mirror)} ${bendIn} V${bendOut} Q${coordinate(382, mirror)} 210 ${coordinate(430, mirror)} 210 H${coordinate(500)}`
  };
  const paths = [sidePath(false, true), sidePath(false, false), sidePath(true, true), sidePath(true, false), `M${coordinate(500)} 210 V350`];
  const wide = width >= 640;
  const steps = STEPS.slice(0, 4);
  const lastStep = STEPS[4];

  return (
    <div ref={container} className="min-w-0">
      {wide ? (
        <div className="relative h-[430px]">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(width, 1)} 430`} fill="none" aria-hidden="true">
            {paths.map((path, index) => (
              <motion.path
                key={path}
                d={path}
                stroke="#b9c7de"
                strokeWidth="1.5"
                strokeLinecap="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
              />
            ))}
            {!reduceMotion && paths.map((path, index) => (
              <circle key={`flow-${index}`} r="3" fill="#2563eb">
                <animateMotion dur="4s" begin={`${index * 0.4}s`} repeatCount="indefinite" path={path} />
              </circle>
            ))}
            <circle cx={coordinate(500)} cy="210" r="10" fill="#2563eb" opacity=".12" />
            <circle cx={coordinate(500)} cy="210" r="4.5" fill="#2563eb" />
          </svg>
          {steps.map((step, index) => {
            const upper = index % 2 === 0;
            const right = index >= 2;
            return (
              <WorkflowCard
                key={step.number}
                step={step}
                counts={counts}
                onSelect={() => onNavigate(step.screen)}
                className="absolute h-[132px] w-[28%] min-w-0"
                style={{ top: upper ? 22 : 276, [right ? 'right' : 'left']: 0 }}
              />
            );
          })}
          <motion.button
            type="button"
            onClick={() => onNavigate(lastStep.screen)}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            className={`absolute left-1/2 top-[356px] flex max-w-[94%] -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-xs sm:px-4 ${cardStyle}`}
          >
            <span className="size-2.5 shrink-0 rounded-full bg-blue-600" />
            <span className="whitespace-nowrap font-semibold text-slate-900">Step 5 · {lastStep.title}</span>
            <span className="truncate rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-white">{lastStep.tag(counts)}</span>
          </motion.button>
        </div>
      ) : (
        <ol className="grid gap-5 p-3 sm:grid-cols-2 sm:gap-6 sm:p-5">
          {STEPS.map((step, index) => (
            <li key={step.number} className="relative min-w-0">
              <WorkflowCard step={step} counts={counts} onSelect={() => onNavigate(step.screen)} className="min-h-[120px] w-full" />
              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className="absolute -bottom-4 start-1/2 z-10 grid size-7 -translate-x-1/2 rotate-90 place-items-center rounded-lg border border-white/80 bg-white text-slate-500 shadow-sm sm:hidden">
                  <ArrowRight className="size-3.5" />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const STAFF_STEPS: {
  number: number;
  title: string;
  detail: string;
  screen: Target;
  icon: LucideIcon;
  color: string;
  tag: (counts: Counts) => string;
}[] = [
  { number: 1, title: 'Client upload', detail: 'Files arrive in the client workspace, ready for staff triage.', screen: 'documents', icon: Upload, color: '#84cc16', tag: (counts) => `${counts.upload} documents` },
  { number: 2, title: 'Classify & extract', detail: 'Review the document type and locally parsed fields.', screen: 'documents', icon: FileSearch, color: '#10b981', tag: (counts) => `${counts.extract} processing` },
  { number: 3, title: 'Validate', detail: 'Check dates, references, totals, and any extraction warnings.', screen: 'review', icon: ShieldCheck, color: '#06b6d4', tag: (counts) => `${counts.validate} need attention` },
  { number: 4, title: 'Staff review', detail: 'Compare with the original, correct fields, then approve or request information.', screen: 'review', icon: ClipboardCheck, color: '#2563eb', tag: (counts) => `${counts.review} awaiting review` },
  { number: 5, title: 'Export', detail: 'Download selected approved accounting records as a demo CSV.', screen: 'exports', icon: ArrowDownToLine, color: '#7c3aed', tag: (counts) => `${counts.export} approved` },
];

const STAFF_NODES = [
  { x: 115, y: 385 },
  { x: 270, y: 235 },
  { x: 435, y: 105 },
  { x: 610, y: 350 },
  { x: 835, y: 220 },
];

const STAFF_LABELS = [
  { x: '20%', y: '76%', width: '25%' },
  { x: '33%', y: '52%', width: '24%' },
  { x: '50%', y: '8%', width: '27%' },
  { x: '67%', y: '67%', width: '27%' },
  { x: '68%', y: '56%', width: '25%' },
];

export function StaffWorkflow({
  counts, reviewCount, onNavigate,
}: {
  counts: Counts;
  reviewCount: number;
  onNavigate: (screen: Target) => void;
}) {
  const reduceMotion = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const path = `M${STAFF_NODES[0].x} ${STAFF_NODES[0].y} C155 372 190 314 ${STAFF_NODES[1].x} ${STAFF_NODES[1].y} S350 112 ${STAFF_NODES[2].x} ${STAFF_NODES[2].y} C520 78 560 214 ${STAFF_NODES[3].x} ${STAFF_NODES[3].y} S760 335 ${STAFF_NODES[4].x} ${STAFF_NODES[4].y} Q850 105 945 55`;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const wide = width >= 700;

  return (
    <div ref={container} className="min-w-0">
      {wide ? (
        <div className="staff-workflow-canvas relative mx-1 my-2 overflow-hidden rounded-2xl bg-gradient-to-br from-white via-slate-50/70 to-cyan-50/50 sm:mx-3">
          <svg viewBox="0 0 1000 470" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none" aria-hidden="true">
            <path d={path} stroke="#cbd5e1" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
            {!reduceMotion && <circle r="5" fill="#0e7490"><animateMotion dur="9s" repeatCount="indefinite" path={path} /></circle>}
            <defs>
              <radialGradient id="staff-workflow-glow"><stop stopColor="#bae6fd" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
            </defs>
            <circle cx="500" cy="235" r="285" fill="url(#staff-workflow-glow)" />
          </svg>

          {STAFF_STEPS.map((step, index) => {
            const Icon = step.icon;
            const circumference = 2 * Math.PI * 37;
            const active = index === 0 ? counts.upload > 0 : index === 1 ? counts.extract > 0 : index === 2 ? counts.validate > 0 : index === 3 ? counts.review > 0 : counts.export > 0;
            return (
              <div key={step.number}>
                <motion.button
                  type="button"
                  aria-label={`Step ${step.number}: ${step.title}. ${step.tag(counts)}`}
                  onClick={() => onNavigate(step.screen)}
                  className="absolute z-10 grid size-[76px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,.32)] ring-1 ring-slate-200/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 sm:size-[84px]"
                  style={{ left: `${STAFF_NODES[index].x / 10}%`, top: `${STAFF_NODES[index].y / 4.7}%` }}
                  whileHover={reduceMotion ? undefined : { scale: 1.08, rotate: index % 2 ? -3 : 3 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.65 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 17, delay: index * 0.12 }}
                >
                  <svg viewBox="0 0 84 84" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
                    <circle cx="42" cy="42" r="37" stroke="#e2e8f0" strokeWidth="5" fill="none" />
                    <motion.circle
                      cx="42" cy="42" r="37" stroke={step.color} strokeWidth="5" strokeLinecap="round" fill="none"
                      strokeDasharray={circumference}
                      initial={reduceMotion ? false : { strokeDashoffset: circumference }}
                      whileInView={{ strokeDashoffset: active ? circumference * 0.12 : circumference * 0.28 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.1, delay: index * 0.1, ease: 'easeOut' }}
                    />
                  </svg>
                  <span className="grid size-12 place-items-center rounded-full bg-white transition-colors" style={{ color: step.color }}>
                    <Icon className="size-6" />
                  </span>
                  <span className="absolute -bottom-2 -right-1 grid size-6 place-items-center rounded-full border-2 border-white bg-slate-900 text-[9px] font-bold text-white">{String(step.number).padStart(2, '0')}</span>
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => onNavigate(step.screen)}
                  className="absolute z-10 rounded-xl p-2 text-left transition-colors hover:bg-white/75 focus-visible:outline-2 focus-visible:outline-blue-600"
                  style={{ left: STAFF_LABELS[index].x, top: STAFF_LABELS[index].y, width: STAFF_LABELS[index].width }}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.45, delay: 0.18 + index * 0.1 }}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[.14em]" style={{ color: step.color }}>Step {String(step.number).padStart(2, '0')}</span>
                  <span className="mt-0.5 block text-[13px] font-bold leading-5 text-slate-900 sm:text-sm">{step.title}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-600 sm:text-[11px]">{step.detail}</span>
                  <span className="mt-2 inline-flex max-w-full rounded-full px-2 py-1 text-[9px] font-semibold sm:text-[10px]" style={{ color: step.color, backgroundColor: `${step.color}14` }}>{step.tag(counts)}</span>
                </motion.button>
              </div>
            );
          })}
        </div>
      ) : (
        <ol className="staff-workflow-steps space-y-1 p-3 sm:p-5">
          {STAFF_STEPS.map((step, index) => {
            const Icon = step.icon;
            const active = index === 0 ? counts.upload > 0 : index === 1 ? counts.extract > 0 : index === 2 ? counts.validate > 0 : index === 3 ? counts.review > 0 : counts.export > 0;
            return (
              <li key={step.number} className="relative">
                {index < STAFF_STEPS.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[27px] top-14 w-px bg-slate-200" />}
                <motion.button
                  type="button"
                  onClick={() => onNavigate(step.screen)}
                  className="staff-workflow-step-button relative flex min-h-[76px] w-full items-center gap-2 rounded-2xl p-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                  initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.08 }}
                >
                  <span className="staff-workflow-step-icon relative grid size-10 shrink-0 place-items-center rounded-full border-[3px] bg-white shadow-sm" style={{ borderColor: active ? step.color : '#e2e8f0', color: step.color }}>
                    <Icon className="size-5" />
                    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-slate-900 text-[8px] font-bold text-white">{String(step.number).padStart(2, '0')}</span>
                  </span>
                  <span className="min-w-0 flex-1 py-1"><span className="block text-sm font-semibold text-slate-900">{step.title}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-600">{step.detail}</span><span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ color: step.color, backgroundColor: `${step.color}14` }}>{step.tag(counts)}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-slate-400" />
                </motion.button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="staff-workflow-footer flex flex-col gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:px-6">
        <motion.button type="button" onClick={() => onNavigate('documents')} whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 sm:w-auto">
          <Upload className="size-4" />Open document intake
        </motion.button>
        <motion.button type="button" onClick={() => onNavigate('review')} whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 sm:w-auto">
          <ClipboardCheck className="size-4" />Review queue ({reviewCount})
        </motion.button>
      </div>
      <p className="staff-workflow-note px-4 pb-4 text-[10px] text-slate-500 sm:px-6">Demo workflow · files are processed in this browser; verify extracted values before approving.</p>
    </div>
  );
}
