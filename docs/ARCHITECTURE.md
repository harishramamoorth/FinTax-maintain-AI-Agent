# Architecture

```
React (Vite) ── fetch /api ───────────────┐
   │  SSE  /api/tasks/{id}/stream         ▼
   │                              FastAPI (app/main.py)
   │                     ┌───────────────┼──────────────────┐
   │                api/ routers     TaskManager        EventBus (wake-ups)
   │                     │          (asyncio runner,         │
   │                     ▼           semaphore, timeout,     │
   │               SQLAlchemy ◄──── cancellation)            │
   │                     ▲                 │                 │
   │                     └── task_events ◄─┴─ Orchestrator ──┘
   │                                         │  agents: planner research execution analysis validation response
   │                                         ├─ ToolRunner (permissions → schema → timeout → output schema)
   │                                         └─ LLM provider (OpenAI-compatible | demo simulator)
```

## Execution pipeline
1. `POST /api/tasks` validates input (length, workflow, permissions, provider configuration), stores the task, writes `task.created`, and hands it to the **TaskManager**.
2. The manager waits for a concurrency slot (`MAX_CONCURRENT_TASKS`), marks the task running and emits `task.started`, then runs the **Orchestrator** under `wait_for(TASK_TIMEOUT_SECONDS)`.
3. **Default pipeline**: Planner (model call → JSON plan validated with pydantic, only allow-listed/available tools survive) → Research agent (read-only tools) and/or Execution agent (compute tools) for the planned steps → Analysis (model) → Validation (model JSON + deterministic checks that the model cannot overrule, e.g. failed tool calls) → Response (model). Agents the plan does not need never run and are shown as "not needed".
4. **Workflow pipeline**: the saved graph is re-validated on the server, snapshotted into the task, and executed in topological order with the same agents.
5. Terminal states are written atomically (`finish_task` refuses to overwrite a terminal state): `completed`, `failed` (structured `{code, message, agent}`), or `cancelled` (the runner's `CancelledError` is turned into `task.cancelled`).

On start-up, tasks left `queued`/`running` by a previous process are failed with code `interrupted`.

## Events = the single source of truth for the UI
Every event is a row in `task_events` with a per-task increasing `seq`.

| Type | Emitted when |
|---|---|
| `task.created / started / completed / failed / cancelled` | task lifecycle |
| `agent.handoff` | the orchestrator dispatches an agent; `data.edges` lists the control (orchestrator→agent) and data (upstream→agent) edges that become active |
| `agent.started / progress / completed / failed` | an agent begins, reports a stage (model call, plan, validation), finishes (with `duration_ms`, `summary`, `progress`) or fails |
| `tool.started / completed / failed` | a tool call really happens (failures include a code: `invalid_input`, `permission_denied`, `timeout`, …) |

`events.simulated=true` marks events produced with the demo model. The SSE endpoint **replays from the database** and then follows live (`id:` = `seq`, `Last-Event-ID` resumes), so reconnecting never loses or duplicates events, and an in-memory wake-up is only an optimisation (the loop also polls once a second, so correctness does not depend on it).

The frontend `executionStore` is a pure reducer over these events (`applyEvent`, unit-tested): it ignores already-seen `seq`s, orders out-of-order delivery, lights an edge on `agent.handoff`, turns it `done` when its target completes, `error` when the target fails, and marks nodes that never ran as skipped when the task completes. Nothing animates randomly.

## Safety model
* **Tools**: allow-list registry; each tool has a pydantic input model, output model, timeout and permission set. Tasks carry granted permissions (`compute`, `read:knowledge`, optional `network:search`). Tools with `side_effects` additionally need `write:external` (none are shipped). The calculator uses an AST allow-list (no `eval`). No shell, no arbitrary code, no filesystem tools.
* **Prompt injection**: user text, documents and web results are wrapped in delimiters; system prompts say delimited content is data; the planner runs *before* any retrieved content exists and may only pick allow-listed tools; suspicious retrieved text is flagged (`warnings`, event data). This reduces but cannot eliminate injection risk.
* **Limits**: prompt length, request body size (413), tokens / model calls / tool calls per task, task and tool timeouts, per-IP rate limit on task creation (in-memory, per process).
* **Secrets**: `SecretStr` settings, never in responses; log filter redacts keys/tokens (tested).
* **Access**: optional shared `ACCESS_TOKEN` (constant-time compare). Not user accounts.

## Data model
`tasks`, `task_events`, `workflows`, `workflow_versions`, `agent_configs`, `knowledge_documents`, `app_settings` (see `app/models/entities.py` and `alembic/versions/0001_initial_schema.py`). Datetimes are stored as timezone-aware UTC on both SQLite and PostgreSQL. Each unit of work uses its own short session (`session_scope`); SQLite runs in WAL mode.

## Known limits
* One API worker per deployment (runners and the event bus are in-process; with several workers SSE still works via DB polling but cancellation and rate limiting are per-process).
* Rate limiting is per process / per IP.
* Keyword search only.
