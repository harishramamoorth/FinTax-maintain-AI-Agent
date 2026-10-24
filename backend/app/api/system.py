"""Agents, tools, dashboard, analytics and settings endpoints."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.definitions import AGENT_ORDER, AGENTS
from app.api.deps import protected_router
from app.core.config import Settings, get_settings
from app.core.errors import AppError, not_found
from app.db.session import get_db
from app.events import types as ev
from app.events.service import event_to_dict
from app.models import AgentConfig, AppSetting, KnowledgeDocument, Task, TaskEvent, Workflow
from app.schemas.common import AgentConfigIn, PreferencesIn
from app.services.tasks import task_to_dict
from app.tools.registry import registry

router = protected_router(tags=["system"])

DEFAULT_PREFS = {"animation_level": "full", "log_verbosity": "normal"}


def seed_agent_configs(db: Session) -> None:
    existing = {k for (k,) in db.execute(select(AgentConfig.key))}
    for key in AGENT_ORDER:
        if key not in existing:
            a = AGENTS[key]
            db.add(AgentConfig(key=key, name=a.name, description=a.description, temperature=a.default_temperature, max_tokens=a.default_max_tokens))
    db.commit()


def _agent_stats(db: Session) -> dict[str, dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = {k: {"runs": 0, "completed": 0, "failed": 0, "avg_duration_ms": None} for k in AGENT_ORDER}
    rows = db.execute(select(TaskEvent.agent, TaskEvent.type, func.count()).where(TaskEvent.type.in_((ev.AGENT_STARTED, ev.AGENT_COMPLETED, ev.AGENT_FAILED)), TaskEvent.agent.is_not(None)).group_by(TaskEvent.agent, TaskEvent.type)).all()
    for agent, typ, n in rows:
        if agent in stats:
            key = {ev.AGENT_STARTED: "runs", ev.AGENT_COMPLETED: "completed", ev.AGENT_FAILED: "failed"}[typ]
            stats[agent][key] = n
    durations: dict[str, list[int]] = defaultdict(list)
    for agent, data in db.execute(select(TaskEvent.agent, TaskEvent.data).where(TaskEvent.type == ev.AGENT_COMPLETED).order_by(TaskEvent.id.desc()).limit(1000)):
        if agent and isinstance(data, dict) and isinstance(data.get("duration_ms"), (int, float)):
            durations[agent].append(int(data["duration_ms"]))
    for agent, ds in durations.items():
        if agent in stats and ds:
            stats[agent]["avg_duration_ms"] = int(sum(ds) / len(ds))
    return stats


@router.get("/agents")
def list_agents(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    seed_agent_configs(db)
    cfgs = {c.key: c for c in db.execute(select(AgentConfig)).scalars()}
    stats = _agent_stats(db)
    out = []
    for key in AGENT_ORDER:
        a, c = AGENTS[key], cfgs[key]
        out.append({"key": key, "name": a.name, "description": a.description, "uses_model": a.uses_model, "model": c.model, "effective_model": c.model or settings.ai_model,
                    "temperature": c.temperature, "max_tokens": c.max_tokens, "enabled": c.enabled, "stats": stats[key]})
    return out


@router.put("/agents/{key}")
def update_agent(key: str, body: AgentConfigIn, db: Session = Depends(get_db)):
    if key not in AGENTS:
        raise not_found("Agent")
    if not body.enabled and key in ("planner", "response"):
        raise AppError(422, "agent_required", "The planner and response agents cannot be disabled")
    seed_agent_configs(db)
    c = db.get(AgentConfig, key)
    assert c is not None
    c.model = (body.model or "").strip() or None
    c.temperature, c.max_tokens, c.enabled = body.temperature, body.max_tokens, body.enabled
    db.commit()
    return {"key": key, "model": c.model, "temperature": c.temperature, "max_tokens": c.max_tokens, "enabled": c.enabled}


@router.get("/tools")
def list_tools(settings: Settings = Depends(get_settings)):
    return registry.describe_all(settings)


@router.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Task.status, func.count()).group_by(Task.status)).all())
    total = sum(counts.values())
    completed, failed = counts.get("completed", 0), counts.get("failed", 0)
    finished = completed + failed
    recent = db.execute(select(Task).order_by(Task.created_at.desc()).limit(6)).scalars().all()
    recent_dicts = []
    for t in recent:
        d = task_to_dict(t)
        d["result_data"] = d["workflow_snapshot"] = None
        recent_dicts.append(d)
    sys_types = (ev.TASK_CREATED, ev.TASK_COMPLETED, ev.TASK_FAILED, ev.TASK_CANCELLED, ev.AGENT_FAILED, ev.TOOL_FAILED)
    events = db.execute(select(TaskEvent).where(TaskEvent.type.in_(sys_types)).order_by(TaskEvent.id.desc()).limit(10)).scalars().all()
    avg = db.execute(select(func.avg(Task.duration_ms)).where(Task.status == "completed")).scalar()
    return {
        "total_tasks": total, "completed": completed, "failed": failed, "cancelled": counts.get("cancelled", 0),
        "running": counts.get("running", 0), "queued": counts.get("queued", 0),
        "success_rate": round(completed / finished, 4) if finished else None,
        "avg_duration_ms": int(avg) if avg else None,
        "documents": db.execute(select(func.count(KnowledgeDocument.id))).scalar() or 0,
        "workflows": db.execute(select(func.count(Workflow.id))).scalar() or 0,
        "recent_tasks": recent_dicts, "recent_events": [event_to_dict(e) for e in events], "agents": _agent_stats(db),
    }


@router.get("/analytics/summary")
def analytics_summary(days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    since = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
    buckets: dict[str, dict[str, Any]] = {(start + timedelta(days=i)).isoformat(): {"total": 0, "completed": 0, "failed": 0, "cancelled": 0, "durations": []} for i in range(days)}
    for status, created, dur in db.execute(select(Task.status, Task.created_at, Task.duration_ms).where(Task.created_at >= since)):
        b = buckets.get(created.date().isoformat())
        if b is None:
            continue
        b["total"] += 1
        if status in ("completed", "failed", "cancelled"):
            b[status] += 1
        if status == "completed" and dur is not None:
            b["durations"].append(dur)
    series = []
    all_dur: list[int] = []
    for day, b in buckets.items():
        all_dur += b["durations"]
        series.append({"date": day, "total": b["total"], "completed": b["completed"], "failed": b["failed"], "cancelled": b["cancelled"],
                       "avg_duration_ms": int(sum(b["durations"]) / len(b["durations"])) if b["durations"] else None})
    tool_rows = db.execute(select(TaskEvent.tool, TaskEvent.type, func.count()).where(TaskEvent.type.in_((ev.TOOL_COMPLETED, ev.TOOL_FAILED)), TaskEvent.tool.is_not(None), TaskEvent.created_at >= since).group_by(TaskEvent.tool, TaskEvent.type)).all()
    tools: dict[str, dict[str, int]] = defaultdict(lambda: {"calls": 0, "failed": 0})
    for tool, typ, n in tool_rows:
        tools[tool]["calls"] += n
        if typ == ev.TOOL_FAILED:
            tools[tool]["failed"] += n
    agent_rows = db.execute(select(TaskEvent.agent, func.count()).where(TaskEvent.type == ev.AGENT_STARTED, TaskEvent.created_at >= since).group_by(TaskEvent.agent)).all()
    total = sum(s["total"] for s in series)
    done = sum(s["completed"] + s["failed"] for s in series)
    return {
        "days": days, "series": series, "total_tasks": total,
        "success_rate": round(sum(s["completed"] for s in series) / done, 4) if done else None,
        "avg_duration_ms": int(sum(all_dur) / len(all_dur)) if all_dur else None,
        "max_duration_ms": max(all_dur) if all_dur else None,
        "agent_usage": [{"agent": a, "runs": n} for a, n in sorted(agent_rows, key=lambda r: -r[1]) if a],
        "tool_usage": [{"tool": t, **v} for t, v in sorted(tools.items(), key=lambda kv: -kv[1]["calls"])],
    }


def _prefs(db: Session) -> dict[str, Any]:
    prefs = dict(DEFAULT_PREFS)
    for row in db.execute(select(AppSetting)).scalars():
        if row.key in DEFAULT_PREFS:
            prefs[row.key] = row.value
    return prefs


@router.get("/settings")
def get_app_settings(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    host = urlparse(settings.ai_base_url).netloc or settings.ai_base_url
    return {
        "mode": "demo" if settings.demo_active else "live",
        "demo_mode_setting": settings.demo_mode,
        "provider": {"configured": settings.provider_configured, "model": settings.ai_model, "host": host, "api_key": "configured" if settings.provider_configured else "not set"},
        "search": {"configured": settings.search_configured, "provider": "brave"},
        "features": {"web_search": settings.search_configured, "knowledge_search": "keyword", "semantic_search": False, "workflows": True, "access_token_required": settings.auth_required},
        "limits": {"max_prompt_chars": settings.max_prompt_chars, "max_tokens_per_task": settings.max_tokens_per_task, "max_llm_calls_per_task": settings.max_llm_calls_per_task,
                   "max_tool_calls_per_task": settings.max_tool_calls_per_task, "task_timeout_seconds": settings.task_timeout_seconds, "tool_timeout_seconds": settings.tool_timeout_seconds,
                   "max_concurrent_tasks": settings.max_concurrent_tasks, "rate_limit_per_minute": settings.rate_limit_per_minute},
        "database": "sqlite" if settings.is_sqlite else "postgresql",
        "preferences": _prefs(db),
    }


@router.put("/settings/preferences")
def update_preferences(body: PreferencesIn, db: Session = Depends(get_db)):
    for key, value in body.model_dump(exclude_none=True).items():
        row = db.get(AppSetting, key)
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    db.commit()
    return _prefs(db)
