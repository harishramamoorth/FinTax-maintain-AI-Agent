"""Task persistence helpers (each opens its own short-lived session)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.db.session import session_scope
from app.models import AgentConfig, Task

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


def task_to_dict(t: Task) -> dict[str, Any]:
    return {
        "id": t.id, "prompt": t.prompt, "status": t.status, "mode": t.mode, "workflow_id": t.workflow_id,
        "workflow_snapshot": t.workflow_snapshot, "permissions": t.permissions or [], "result": t.result,
        "result_data": t.result_data, "error": t.error, "retry_of": t.retry_of, "tokens_used": t.tokens_used,
        "llm_calls": t.llm_calls, "tool_calls": t.tool_calls, "duration_ms": t.duration_ms,
        "created_at": t.created_at.isoformat(), "started_at": t.started_at.isoformat() if t.started_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


def get_task(task_id: str) -> Task | None:
    with session_scope() as s:
        return s.get(Task, task_id)


def mark_running(task_id: str) -> None:
    with session_scope() as s:
        t = s.get(Task, task_id)
        if t and t.status == "queued":
            t.status = "running"
            t.started_at = datetime.now(timezone.utc)


def finish_task(task_id: str, status: str, *, result: str | None = None, result_data: dict | None = None,
                error: dict | None = None, tokens: int = 0, llm_calls: int = 0, tool_calls: int = 0) -> bool:
    """Atomically move a task to a terminal state. Returns False if it was already terminal."""
    with session_scope() as s:
        t = s.get(Task, task_id)
        if t is None or t.status in TERMINAL_STATUSES:
            return False
        now = datetime.now(timezone.utc)
        t.status = status
        t.result, t.result_data, t.error = result, result_data, error
        t.tokens_used, t.llm_calls, t.tool_calls = tokens, llm_calls, tool_calls
        t.completed_at = now
        start = t.started_at or t.created_at
        t.duration_ms = max(0, int((now - start).total_seconds() * 1000))
        return True


def load_agent_configs(default_model: str) -> dict[str, dict[str, Any]]:
    with session_scope() as s:
        rows = s.execute(select(AgentConfig)).scalars().all()
        return {r.key: {"model": r.model or default_model, "temperature": r.temperature, "max_tokens": r.max_tokens, "enabled": r.enabled} for r in rows}
