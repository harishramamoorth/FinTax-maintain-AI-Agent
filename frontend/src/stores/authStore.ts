import { create } from 'zustand';

// The optional shared ACCESS_TOKEN (not a provider key) lives in sessionStorage only.
const KEY = 'nx.access';
const get = () => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };

interface AuthState { token: string; setToken(t: string): void; clear(): void }
export const useAuthStore = create<AuthState>((set) => ({
  token: get(),
  setToken: (t) => { try { sessionStorage.setItem(KEY, t); } catch { /* ignore */ } set({ token: t }); },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } set({ token: '' }); },
}));
