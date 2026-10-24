from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import Depends, Header, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import protected_router
from app.core.config import Settings, get_settings
from app.core.errors import AppError, conflict, not_found
from app.core.security import rate_limited
from app.db.session import get_db, session_scope
from app.events import types as ev
from app.events.service import append_event, bus, fetch_events
from app.models import Task, Workflow
from app.orchestration.manager import manager
from app.orchestration.workflow import parse_and_validate
from app.schemas.common import EventOut, Page, TaskCreate, TaskOut
from app.services.llm import provider_not_configured_error
from app.services.tasks import TERMINAL_STATUSES, task_to_dict
from app.tools.base import DEFAULT_PERMISSIONS, PERM_NET_SEARCH
from app.tools.registry import registry

router = protected_router(tags=["tasks"])


def create_task_record(db: Session, settings: Settings, prompt: str, *, workflow: Workflow | dict | None, allow_web_search: bool, retry_of: str | None = None) -> Task:
    """Validates and persists a task, emits task.created, and hands it to the runner."""
    if len(prompt) > settings.max_prompt_chars:
        raise AppError(422, "prompt_too_long", f"Prompt exceeds {settings.max_prompt_chars} characters")
    if not settings.demo_active and not settings.provider_configured:
        raise provider_not_configured_error()
    snapshot: dict[str, Any] | None = None
    workflow_id: str | None = None
    if workflow is not None:
        definition = workflow.definition if isinstance(workflow, Workflow) else workflow
        workflow_id = workflow.id if isinstance(workflow, Workflow) else None
        defn, verdict = parse_and_validate(definition, registry)
        if defn is None or not verdict.valid:
            raise AppError(422, "invalid_workflow", "Workflow failed server-side validation", [i.model_dump() for i in verdict.issues])
        snapshot = defn.model_dump()
    perms = list(DEFAULT_PERMISSIONS)
    if allow_web_search:
        if not settings.search_configured:
            raise AppError(422, "search_not_configured", "Web search was requested but SEARCH_API_KEY is not configured on the server")
        perms.append(PERM_NET_SEARCH)
    task = Task(prompt=prompt, status="queued", mode="demo" if settings.demo_active else "live", workflow_id=workflow_id,
                workflow_snapshot=snapshot, permissions=perms, retry_of=retry_of)
    db.add(task)
    db.commit()
    append_event(task.id, ev.TASK_CREATED, "Task created and queued",
                 data={"mode": task.mode, "workflow_id": workflow_id, "permissions": perms, "progress": 0}, simulated=task.mode == "demo")
    manager.submit(task.id)
    return task


@router.post("/tasks", response_model=TaskOut, status_code=201, dependencies=[Depends(rate_limited)])
def create_task(body: TaskCreate, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    wf = None
    if body.workflow_id:
        wf = db.get(Workflow, body.workflow_id)
        if wf is None:
            raise not_found("Workflow")
    task = create_task_record(db, settings, body.prompt, workflow=wf, allow_web_search=body.allow_web_search)
    return task_to_dict(task)


@router.get("/tasks", response_model=Page[TaskOut])
def list_tasks(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), status: str | None = Query(None, pattern="^(queued|running|completed|failed|cancelled)$"),
    q: str | None = Query(None, max_length=200), mode: str | None = Query(None, pattern="^(live|demo)$"), db: Session = Depends(get_db),
):
    stmt = select(Task)
    if status:
        stmt = stmt.where(Task.status == status)
    if mode:
        stmt = stmt.where(Task.mode == mode)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Task.prompt.ilike(like), Task.id.ilike(like), Task.result.ilike(like)))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    rows = db.execute(stmt.order_by(Task.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    # The list omits large blobs to stay light; the detail endpoint returns everything.
    items = []
    for t in rows:
        d = task_to_dict(t)
        d["result_data"] = None
        d["workflow_snapshot"] = None
        items.append(d)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: str, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if t is None:
        raise not_found("Task")
    return task_to_dict(t)


@router.post("/tasks/{task_id}/cancel", response_model=TaskOut, status_code=202)
def cancel_task(task_id: str, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if t is None:
        raise not_found("Task")
    if t.status in TERMINAL_STATUSES:
        raise conflict(f"Task is already {t.status}", "task_not_cancellable")
    if not manager.cancel(task_id):
        # No runner in this process (orphaned task): close it out explicitly.
        from app.services.tasks import finish_task

        if finish_task(task_id, "cancelled", error={"code": "cancelled", "message": "Cancelled by user"}):
            append_event(task_id, ev.TASK_CANCELLED, "Task cancelled")
    db.expire_all()
    return task_to_dict(db.get(Task, task_id))  # type: ignore[arg-type]


@router.post("/tasks/{task_id}/retry", response_model=TaskOut, status_code=201, dependencies=[Depends(rate_limited)])
def retry_task(task_id: str, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    old = db.get(Task, task_id)
    if old is None:
        raise not_found("Task")
    if old.status not in ("failed", "cancelled"):
        raise conflict("Only failed or cancelled tasks can be retried", "task_not_retryable")
    wf: Workflow | dict | None = None
    if old.workflow_id:
        wf = db.get(Workflow, old.workflow_id) or old.workflow_snapshot
    elif old.workflow_snapshot:
        wf = old.workflow_snapshot
    task = create_task_record(db, settings, old.prompt, workflow=wf, allow_web_search=PERM_NET_SEARCH in (old.permissions or []) and settings.search_configured, retry_of=old.id)
    return task_to_dict(task)


@router.get("/tasks/{task_id}/events", response_model=list[EventOut])
def list_events(task_id: str, after_seq: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=5000), db: Session = Depends(get_db)):
    if db.get(Task, task_id) is None:
        raise not_found("Task")
    return fetch_events(task_id, after_seq, limit)


@router.get("/tasks/{task_id}/stream")
async def stream_events(task_id: str, request: Request, after_seq: int = Query(0, ge=0), last_event_id: str | None = Header(default=None)):
    """Server-Sent Events. Events are replayed from the database (so reconnects never lose events)
    and then streamed live. `id:` is the per-task sequence number; send it back as Last-Event-ID."""
    def status_of() -> str | None:
        with session_scope() as s:
            return s.execute(select(Task.status).where(Task.id == task_id)).scalar()

    if await asyncio.to_thread(status_of) is None:
        raise not_found("Task")
    try:
        last = max(after_seq, int(last_event_id)) if last_event_id else after_seq
    except ValueError:
        last = after_seq

    async def gen():
        nonlocal last
        waiter = bus.register(task_id)
        idle_ticks = 0
        try:
            yield "retry: 2000\n\n"
            while True:
                waiter.clear()
                events = await asyncio.to_thread(fetch_events, task_id, last)
                for e in events:
                    last = e["seq"]
                    yield f"id: {e['seq']}\nevent: {e['type']}\ndata: {json.dumps(e)}\n\n"
                if any(e["type"] in ev.TERMINAL for e in events):
                    return
                if not events:
                    if await asyncio.to_thread(status_of) in TERMINAL_STATUSES:
                        await asyncio.sleep(0.3)
                        if not await asyncio.to_thread(fetch_events, task_id, last, 1):
                            return
                        continue
                    idle_ticks += 1
                    if idle_ticks % 15 == 0:
                        yield ": keep-alive\n\n"
                    try:
                        await asyncio.wait_for(waiter.wait(), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass
                else:
                    idle_ticks = 0
                if await request.is_disconnected():
                    return
        finally:
            bus.unregister(task_id, waiter)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
