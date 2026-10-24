import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 10_000, retry: false, staleTime: 5_000 });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 15_000 });
export const useWorkflows = () => useQuery({ queryKey: ['workflows'], queryFn: api.workflows });
export const useAgents = () => useQuery({ queryKey: ['agents'], queryFn: api.agents });
