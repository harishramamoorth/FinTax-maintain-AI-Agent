export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentKey = 'planner' | 'research' | 'execution' | 'analysis' | 'validation' | 'response';

export interface Page<T> { items: T[]; total: number; page: number; page_size: number }

export interface Task {
  id: string; prompt: string; status: TaskStatus; mode: 'live' | 'demo';
  workflow_id: string | null; workflow_snapshot: WorkflowDefinition | null; permissions: string[];
  result: string | null; result_data: ResultData | null; error: { code: string; message: string; agent?: string | null } | null;
  retry_of: string | null; tokens_used: number; llm_calls: number; tool_calls: number; duration_ms: number | null;
  created_at: string; started_at: string | null; completed_at: string | null;
}

export interface Observation { agent: string; node: string; tool: string; input: Record<string, unknown>; ok: boolean; output: Record<string, unknown> | null; error: string | null; error_code: string | null }
export interface ResultData {
  plan: { objective: string; steps: { title: string; kind: string; tool: string; input: Record<string, unknown> }[]; notes: string } | null;
  observations: Observation[]; analysis: string | null;
  validation: { passed: boolean; score: number; issues: string[]; summary: string } | null;
  sources: { type: 'web' | 'knowledge'; title: string; url?: string; id?: string }[];
  warnings: string[]; simulated: boolean; model: string;
}

export type EventType =
  | 'task.created' | 'task.started' | 'task.completed' | 'task.failed' | 'task.cancelled'
  | 'agent.started' | 'agent.progress' | 'agent.handoff' | 'agent.completed' | 'agent.failed'
  | 'tool.started' | 'tool.completed' | 'tool.failed';

export interface TaskEvent {
  id: number; task_id: string; seq: number; type: EventType; agent: string | null; node: string | null; tool: string | null;
  message: string; data: Record<string, any>; simulated: boolean; created_at: string;
}

export interface WfNode { id: string; type: string; label?: string | null; position: { x: number; y: number }; config: Record<string, any> }
export interface WfEdge { id?: string | null; source: string; target: string }
export interface WorkflowDefinition { nodes: WfNode[]; edges: WfEdge[] }
export interface Workflow { id: string; name: string; description: string; definition: WorkflowDefinition; version: number; created_at: string; updated_at: string }
export interface ValidationIssue { code: string; message: string; node?: string | null }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[]; order: string[] }
export interface WorkflowMeta { node_types: string[]; tools_by_type: Record<string, string[]>; starter: WorkflowDefinition; tool_schemas: Record<string, any> }

export interface KnowledgeItem { id: string; title: string; snippet: string; tags: string[]; agent_accessible: boolean; updated_at: string; score?: number | null }
export interface KnowledgeDoc { id: string; title: string; content: string; tags: string[]; agent_accessible: boolean; owner: string; created_at: string; updated_at: string }

export interface FinTaxUser {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'staff' | 'client';
  client_id: string | null;
  client_number: string | null;
  company_name: string | null;
  must_change_password: boolean;
  enabled: boolean;
  assigned_client_ids: string[];
}

export interface FinTaxClient {
  id: string;
  client_number: string;
  company_name: string;
  email: string | null;
  created_at: string;
}

export interface FinTaxDocument {
  id: string;
  client_id: string;
  original_filename: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  category: string;
  page_count: number | null;
  status: 'received' | 'password_required' | 'duplicate';
  created_at: string;
}

export interface Health { status: string; version: string; time: string; database: string; mode: 'demo' | 'live'; provider_configured: boolean; search_configured: boolean; auth_required: boolean }

export interface AgentInfo {
  key: AgentKey; name: string; description: string; uses_model: boolean; model: string | null; effective_model: string; temperature: number; max_tokens: number; enabled: boolean;
  stats: { runs: number; completed: number; failed: number; avg_duration_ms: number | null };
}
export interface DashboardStats {
  total_tasks: number; completed: number; failed: number; cancelled: number; running: number; queued: number; success_rate: number | null; avg_duration_ms: number | null;
  documents: number; workflows: number; recent_tasks: Task[]; recent_events: TaskEvent[]; agents: Record<string, AgentInfo['stats']>;
}
export interface AnalyticsSummary {
  days: number; total_tasks: number; success_rate: number | null; avg_duration_ms: number | null; max_duration_ms: number | null;
  series: { date: string; total: number; completed: number; failed: number; cancelled: number; avg_duration_ms: number | null }[];
  agent_usage: { agent: string; runs: number }[]; tool_usage: { tool: string; calls: number; failed: number }[];
}
export interface AppSettings {
  mode: 'demo' | 'live'; demo_mode_setting: string;
  provider: { configured: boolean; model: string; host: string; api_key: string };
  search: { configured: boolean; provider: string };
  features: Record<string, boolean | string>; limits: Record<string, number>; database: string;
  preferences: { animation_level: 'full' | 'reduced' | 'off'; log_verbosity: 'normal' | 'verbose' };
}
export interface ToolInfo { name: string; description: string; permissions: string[]; side_effects: boolean; available: boolean }
