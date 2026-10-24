import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import type * as T from '@/types/api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export const authHeaders = (): Record<string, string> => {
  const t = useAuthStore.getState().token;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function request<R>(method: string, path: string, body?: unknown, params?: Record<string, unknown>): Promise<R> {
  const qs = params ? Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, {
      method, headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the backend. Is the API server running?');
  }
  if (res.status === 204) return undefined as R;
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401) useUiStore.getState().setAccessNeeded(true);
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json as R;
}

const get = <R,>(p: string, params?: Record<string, unknown>) => request<R>('GET', p, undefined, params);
const post = <R,>(p: string, b?: unknown) => request<R>('POST', p, b ?? {});
const put = <R,>(p: string, b: unknown) => request<R>('PUT', p, b);
const del = (p: string) => request<void>('DELETE', p);

export const api = {
  login: (identifier: string, password: string) => post<{ user: import('@/types/api').FinTaxUser }>('/auth/login', { identifier, password }),
  me: () => get<{ user: import('@/types/api').FinTaxUser }>('/auth/me'),
  logout: () => post<void>('/auth/logout'),
  changePassword: (current_password: string, new_password: string) => post<{ user: import('@/types/api').FinTaxUser }>('/auth/change-password', { current_password, new_password }),
  clients: () => get<import('@/types/api').FinTaxClient[]>('/clients'),
  clientHome: () => get<{ client_number: string; company_name: string }>('/client/home'),
  createAccount: (body: { role: 'staff' | 'client'; username: string; initial_password?: string; email?: string; company_name?: string; client_number?: string }) => post<{ user: import('@/types/api').FinTaxUser; temporary_password: string }>('/accounts', body),
  accounts: () => get<import('@/types/api').FinTaxUser[]>('/accounts'),
  assignClient: (userId: string, clientId: string) => put<void>(`/accounts/${encodeURIComponent(userId)}/clients/${encodeURIComponent(clientId)}`, {}),
  resetAccountPassword: (userId: string) => post<{ temporary_password: string }>(`/accounts/${encodeURIComponent(userId)}/reset-password`),
  disableAccount: (userId: string) => request<{ id: string; enabled: boolean }>('PATCH', `/accounts/${encodeURIComponent(userId)}/disable`),
  auditEvents: () => get<Array<{ id: number; action: string; user_id: string | null; client_id: string | null; target_id: string | null; created_at: string }>>('/audit'),
  documents: () => get<import('@/types/api').FinTaxDocument[]>('/documents'),
  uploadDocument: async (file: File, category: string, clientId?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    if (clientId) form.append('client_id', clientId);
    let response: Response;
    try {
      response = await fetch('/api/documents', { method: 'POST', headers: authHeaders(), body: form });
    } catch {
      throw new ApiError(0, 'network_error', 'Cannot reach the backend. Is the API server running?');
    }
    const text = await response.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
    if (!response.ok) {
      const error = json?.error;
      throw new ApiError(response.status, error?.code ?? 'http_error', error?.message ?? `Upload failed (${response.status})`, error?.details);
    }
    return json as import('@/types/api').FinTaxDocument;
  },
  health: () => get<T.Health>('/health'),
  settings: () => get<T.AppSettings>('/settings'),
  savePreferences: (p: Partial<T.AppSettings['preferences']>) => put<T.AppSettings['preferences']>('/settings/preferences', p),
  dashboard: () => get<T.DashboardStats>('/dashboard/stats'),
  analytics: (days: number) => get<T.AnalyticsSummary>('/analytics/summary', { days }),
  agents: () => get<T.AgentInfo[]>('/agents'),
  updateAgent: (key: string, b: { model: string | null; temperature: number; max_tokens: number; enabled: boolean }) => put(`/agents/${key}`, b),
  tools: () => get<T.ToolInfo[]>('/tools'),

  tasks: (p: { page?: number; page_size?: number; status?: string; q?: string; mode?: string }) => get<T.Page<T.Task>>('/tasks', p),
  task: (id: string) => get<T.Task>(`/tasks/${id}`),
  createTask: (b: { prompt: string; workflow_id?: string | null; allow_web_search?: boolean }) => post<T.Task>('/tasks', b),
  cancelTask: (id: string) => post<T.Task>(`/tasks/${id}/cancel`),
  retryTask: (id: string) => post<T.Task>(`/tasks/${id}/retry`),
  taskEvents: (id: string) => get<T.TaskEvent[]>(`/tasks/${id}/events`),

  workflows: () => get<T.Page<T.Workflow>>('/workflows'),
  workflowMeta: () => get<T.WorkflowMeta>('/workflows/meta'),
  validateWorkflow: (d: T.WorkflowDefinition) => post<T.ValidationResult>('/workflows/validate', d),
  createWorkflow: (b: { name: string; description: string; definition: T.WorkflowDefinition }) => post<T.Workflow>('/workflows', b),
  updateWorkflow: (id: string, b: { name: string; description: string; definition: T.WorkflowDefinition }) => put<T.Workflow>(`/workflows/${id}`, b),
  deleteWorkflow: (id: string) => del(`/workflows/${id}`),
  executeWorkflow: (id: string, b: { prompt: string; allow_web_search?: boolean }) => post<T.Task>(`/workflows/${id}/execute`, b),

  knowledge: (p: { q?: string; tag?: string; page?: number; page_size?: number }) => get<T.Page<T.KnowledgeItem>>('/knowledge', p),
  document: (id: string) => get<T.KnowledgeDoc>(`/knowledge/${id}`),
  createDocument: (b: Partial<T.KnowledgeDoc>) => post<T.KnowledgeDoc>('/knowledge', b),
  updateDocument: (id: string, b: Partial<T.KnowledgeDoc>) => put<T.KnowledgeDoc>(`/knowledge/${id}`, b),
  deleteDocument: (id: string) => del(`/knowledge/${id}`),
};

export const errorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details) && e.details.length) {
      const first = e.details[0] as any;
      if (first?.message) return `${e.message}: ${first.field ? first.field + ' - ' : ''}${first.message}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
};
