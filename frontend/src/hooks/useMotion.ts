import { useEffect, useState } from 'react';
import { useUiStore, type MotionLevel } from '@/stores/uiStore';

/** Effective animation level: the user's preference, downgraded when the OS asks for reduced motion. */
export function useMotion(): MotionLevel {
  const pref = useUiStore((s) => s.motion);
  const [osReduced, setOsReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const fn = () => setOsReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  if (pref === 'off') return 'off';
  if (osReduced) return 'reduced';
  return pref;
}
