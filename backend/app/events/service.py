"""Event persistence + wake-up bus.

Events are the source of truth (stored in `task_events` with a per-task `seq`).
The in-memory bus only wakes SSE listeners; listeners always read from the database,
so ordering is guaranteed and a missed wake-up cannot lose events.
"""
from __future__ import annotations

import asyncio
import threading
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select

from app.db.session import session_scope
from app.models import TaskEvent


class EventBus:
    def __init__(self) -> None:
        self._waiters: dict[str, set[asyncio.Event]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def register(self, task_id: str) -> asyncio.Event:
        ev = asyncio.Event()
        with self._lock:
            self._waiters[task_id].add(ev)
        return ev

    def unregister(self, task_id: str, ev: asyncio.Event) -> None:
        with self._lock:
            self._waiters[task_id].discard(ev)
            if not self._waiters[task_id]:
                self._waiters.pop(task_id, None)

    def notify(self, task_id: str) -> None:
        with self._lock:
            waiters = list(self._waiters.get(task_id, ()))
        if not waiters:
            return
        loop = self._loop
        for ev in waiters:
            if loop is not None and loop.is_running():
                loop.call_soon_threadsafe(ev.set)
            else:  # pragma: no cover
                ev.set()


bus = EventBus()


def event_to_dict(e: TaskEvent) -> dict[str, Any]:
    return {
        "id": e.id,
        "task_id": e.task_id,
        "seq": e.seq,
        "type": e.type,
        "agent": e.agent,
        "node": e.node,
        "tool": e.tool,
        "message": e.message,
        "data": e.data or {},
        "simulated": e.simulated,
        "created_at": e.created_at.isoformat(),
    }


def append_event(
    task_id: str,
    type_: str,
    message: str = "",
    *,
    agent: str | None = None,
    node: str | None = None,
    tool: str | None = None,
    data: dict[str, Any] | None = None,
    simulated: bool = False,
) -> dict[str, Any]:
    """Persist one event (single writer per task) and wake listeners."""
    with session_scope() as s:
        last = s.execute(select(func.max(TaskEvent.seq)).where(TaskEvent.task_id == task_id)).scalar() or 0
        ev = TaskEvent(
            task_id=task_id,
            seq=last + 1,
            type=type_,
            agent=agent,
            node=node,
            tool=tool,
            message=message[:2000],
            data=data or {},
            simulated=simulated,
        )
        s.add(ev)
        s.flush()
        out = event_to_dict(ev)
    bus.notify(task_id)
    return out


def fetch_events(task_id: str, after_seq: int = 0, limit: int = 1000) -> list[dict[str, Any]]:
    with session_scope() as s:
        rows = s.execute(
            select(TaskEvent).where(TaskEvent.task_id == task_id, TaskEvent.seq > after_seq).order_by(TaskEvent.seq).limit(limit)
        ).scalars()
        return [event_to_dict(r) for r in rows]
