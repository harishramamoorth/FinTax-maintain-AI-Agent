# REST API

Interactive docs: `GET /api/docs` (Swagger UI), schema: `/api/openapi.json`. All errors use
`{"error": {"code", "message", "details"}, "request_id"}`. When `ACCESS_TOKEN` is set send `Authorization: Bearer <token>` (all routes except `/api/health`).

| Method & path | Notes |
|---|---|
| `GET /api/health` | status, version, database, `mode` (`demo`/`live`), whether provider/search/auth are configured (no secrets) |
| `GET /api/dashboard/stats` | totals, success rate, running, recent tasks/events, per-agent activity |
| `POST /api/tasks` | `{prompt, workflow_id?, allow_web_search?}` → 201 task. 422 validation, 503 `provider_not_configured`, 429 rate limit |
| `GET /api/tasks` | `page, page_size, status, mode, q` |
| `GET /api/tasks/{id}` | full task incl. `result`, `result_data`, `error` |
| `POST /api/tasks/{id}/cancel` | 202; 409 if already finished |
| `POST /api/tasks/{id}/retry` | failed/cancelled only → new task (`retry_of`) |
| `GET /api/tasks/{id}/events` | persisted events (`after_seq`, `limit`) |
| `GET /api/tasks/{id}/stream` | **SSE**; replay + live; honours `Last-Event-ID` |
| `GET /api/agents`, `PUT /api/agents/{key}` | agent catalogue, stats, per-agent model/temperature/max_tokens/enabled |
| `GET /api/tools` | tool registry (schemas, permissions, availability) |
| `GET/POST /api/workflows`, `GET/PUT/DELETE /api/workflows/{id}` | persisted, versioned; server validates every write |
| `GET /api/workflows/meta`, `POST /api/workflows/validate` | builder metadata, dry-run validation |
| `POST /api/workflows/{id}/execute` | `{prompt, allow_web_search?}` → task |
| `GET/POST /api/knowledge`, `GET/PUT/DELETE /api/knowledge/{id}` | `q` keyword search, `tag`; `agent_accessible` access flag |
| `GET /api/analytics/summary?days=` | per-day counts, durations, agent and tool usage |
| `GET /api/settings`, `PUT /api/settings/preferences` | read-only provider/limit status; safe preferences |

SSE example: `curl -N http://localhost:8000/api/tasks/<id>/stream`
