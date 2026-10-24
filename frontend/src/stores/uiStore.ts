import { create } from 'zustand';

export type MotionLevel = 'full' | 'reduced' | 'off';
export type Theme = 'dark' | 'light';

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
};
const write = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } };

interface UiState {
  sidebarCollapsed: boolean; mobileNavOpen: boolean; theme: Theme; motion: MotionLevel; verbosity: 'normal' | 'verbose';
  focusTick: number; accessNeeded: boolean;
  toggleSidebar(): void; setMobileNav(v: boolean): void; setTheme(t: Theme): void; setMotion(m: MotionLevel): void;
  setVerbosity(v: 'normal' | 'verbose'): void; requestFocusInput(): void; setAccessNeeded(v: boolean): void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: read('nx.sidebar', ['0', '1'] as const, '0') === '1',
  mobileNavOpen: false,
  theme: read('nx.theme', ['dark', 'light'] as const, 'light'),
  motion: read('nx.motion', ['full', 'reduced', 'off'] as const, 'full'),
  verbosity: read('nx.verbosity', ['normal', 'verbose'] as const, 'normal'),
  focusTick: 0, accessNeeded: false,
  toggleSidebar: () => { const v = !get().sidebarCollapsed; write('nx.sidebar', v ? '1' : '0'); set({ sidebarCollapsed: v }); },
  setMobileNav: (v) => set({ mobileNavOpen: v }),
  setTheme: (t) => { write('nx.theme', t); set({ theme: t }); },
  setMotion: (m) => { write('nx.motion', m); set({ motion: m }); },
  setVerbosity: (v) => { write('nx.verbosity', v); set({ verbosity: v }); },
  requestFocusInput: () => set((s) => ({ focusTick: s.focusTick + 1 })),
  setAccessNeeded: (v) => set({ accessNeeded: v }),
}));
