import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface StatItem {
  key: string;
  label: string;
  compactLabel: string;
  hint: string;
  value: ReactNode;
  icon: LucideIcon;
  from: string;
  to: string;
  actionLabel?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function StatFlow({
  items,
  activeKey,
  onSelect,
  surface = 'white',
  variant = 'flow',
}: {
  items: StatItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  surface?: 'white' | 'panel';
  variant?: 'flow' | 'sidebar' | 'staffTiles';
}) {
  const reduce = useReducedMotion();

  return (
   <ol className={`stat-flow grid ${variant === 'staffTiles' ? 'grid-cols-2 gap-3 sm:gap-4 lg:gap-5' : 'grid-cols-4 gap-2 sm:gap-4 lg:gap-6'} ${surface === 'panel' ? 'stat-flow--panel' : ''} ${variant === 'sidebar' ? 'stat-flow--sidebar' : ''} ${variant === 'staffTiles' ? 'stat-flow--staff-tiles' : ''}`}>
      {items.map((item, index) => {
        const active = item.key === activeKey;
        const last = index === items.length - 1;

        const gradient = `linear-gradient(135deg, ${item.from}, ${item.to})`;

        return (
          <motion.li
            key={item.key}
            className="stat-flow__item relative min-w-0"
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.55,
              delay: index * 0.12,
              ease: EASE,
            }}
          >
            {/* Main card */}
            <motion.button
              type="button"
              onClick={() => onSelect(item.key)}
              aria-pressed={variant === 'staffTiles' ? undefined : active}
              aria-label={variant === 'staffTiles'
                ? `${item.label}: ${item.hint}. ${item.actionLabel ?? 'View details'}`
                : `${item.label}: ${item.hint}. ${active ? 'Active filter' : `Filter by ${item.label}`}`}
              title={item.hint}
              whileHover={reduce ? undefined : { y: -3 }}
              whileTap={reduce ? undefined : { scale: 0.985 }}
              className={`stat-flow__button group relative block w-full text-center ${
                active ? 'is-active' : ''
              }`}
              style={
                {
                  '--flow-from': item.from,
                  '--flow-to': item.to,
                  '--flow-gradient': gradient,
                } as React.CSSProperties
              }
            >
                {variant === 'staffTiles' ? (
                  <span className={`stat-flow__tile ${index === 0 ? 'stat-flow__tile--featured' : ''}`}>
                    <span className="stat-flow__tile-top">
                      <span className="stat-flow__tile-step">STEP {String(index + 1).padStart(2, '0')}</span>
                      <span className="stat-flow__tile-icon"><item.icon size={19} strokeWidth={1.9} /></span>
                    </span>
                    <span className="stat-flow__tile-live"><span className="stat-flow__live-dot" />Live demo data</span>
                    <span className="stat-flow__tile-title">{item.label}</span>
                    <span className="stat-flow__tile-compact-label">{item.compactLabel}</span>
                    <span className="stat-flow__tile-hint">{item.hint}</span>
                    <span className="stat-flow__tile-value">{item.value}</span>
                    <span className="stat-flow__tile-action"><span>{item.actionLabel ?? 'View details'}</span><ArrowRight size={17} /></span>
                    <motion.span
                      className={`stat-flow__tile-art stat-flow__tile-art--${index + 1}`}
                      aria-hidden="true"
                      animate={reduce ? undefined : { y: [0, -5, 0], rotate: [0, index % 2 ? 3 : -3, 0] }}
                      transition={{ duration: 4 + index * 0.6, repeat: Infinity, ease: 'easeInOut', delay: index * 0.25 }}
                    >
                      <span /><span /><span />
                    </motion.span>
                  </span>
                ) : (
                <>
                {/* Top indicator dots */}
                <span className="stat-flow__dots" aria-hidden="true">
                {Array.from({
                  length: index + 1,
                }).map((_, dotIndex) => (
                  <motion.span
                    key={dotIndex}
                    className="stat-flow__dot"
                    initial={
                      reduce
                        ? false
                        : { scale: 0, opacity: 0 }
                    }
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: 0.25 + index * 0.1 + dotIndex * 0.07,
                      duration: 0.3,
                    }}
                  />
                ))}
              </span>

              {/* Animated gradient outline */}
              <span className="stat-flow__border" aria-hidden="true" />

              {/* Card content */}
              <span className="stat-flow__content">
                {/* Icon */}
                <span className="stat-flow__icon">
                  <item.icon size={19} strokeWidth={1.9} />
                </span>

                {/* Main metric */}
                <span className="stat-flow__value">
                  {item.value}
                </span>

                {/* Stage title */}
                <span className="stat-flow__label">
                  <span className="stat-flow__full-label">{item.label}</span>
                  <span className="stat-flow__compact-label">{item.compactLabel}</span>
                </span>

                {/* Description */}
                <span className="stat-flow__hint">
                  {item.hint}
                </span>

                {/* Moving light inside the card */}
                {!reduce && (
                  <motion.span
                    aria-hidden="true"
                    className="stat-flow__light"
                    animate={{
                      x: ['-140%', '340%'],
                    }}
                    transition={{
                      duration: 2.8,
                      ease: 'linear',
                      repeat: Infinity,
                      repeatDelay: 1.8,
                      delay: index * 0.45,
                    }}
                  />
                )}

                {/* Active indicator */}
                <span className="stat-flow__status">
                  {active ? 'ACTIVE' : variant === 'sidebar'
                    ? <><span className="stat-flow__step-full">STEP {String(index + 1).padStart(2, '0')}</span><span className="stat-flow__step-compact">{String(index + 1).padStart(2, '0')}</span></>
                    : `STEP ${index + 1}`}
                </span>
              </span>

              {/* Soft colored glow */}
              <span
                className="stat-flow__glow"
                aria-hidden="true"
              />
              </>
              )}
            </motion.button>

            {/* Connector between cards on desktop */}
            {!last && (
              <div
                className="stat-flow__connector"
                aria-hidden="true"
                style={
                  {
                    '--connector-color': item.to,
                  } as React.CSSProperties
                }
              >
                <svg
                  viewBox="0 0 48 32"
                  fill="none"
                  className="stat-flow__connector-svg"
                >
                  <path
                    d="M14 16 H34 M28 9 L35 16 L28 23"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {!reduce && (
                    <motion.circle
                      cx="13"
                      cy="16"
                      r="1.8"
                      fill="var(--connector-color)"
                      animate={{ x: [0, 12], opacity: [0.35, 1, 0.35] }}
                      transition={{
                        duration: 1.4,
                        ease: 'easeInOut',
                        repeat: Infinity,
                        repeatDelay: 0.4,
                        delay: index * 0.3,
                      }}
                    />
                  )}
                </svg>
              </div>
            )}

          </motion.li>
        );
      })}
    </ol>
  );
}