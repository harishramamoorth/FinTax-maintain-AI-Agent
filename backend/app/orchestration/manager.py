"""Task supervisor: concurrency limit, timeout, cancellation and terminal-state bookkeeping."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import session_scope
from app.events import types as ev
from app.events.service import append_event
from app.models import Task
from app.orchestration.context import ExecutionError
from app.orchestration.orchestrator import run_task
from app.services import tasks as task_svc

log = logging.getLogger("nexus.manager")


class TaskManager:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._sem: asyncio.Semaphore | None = None
        self._runners: dict[str, asyncio.Task] = {}

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._sem = asyncio.Semaphore(max(1, get_settings().max_concurrent_tasks))
        self._runners = {}

    async def shutdown(self) -> None:
        for t in list(self._runners.values()):
            t.cancel()
        if self._runners:
            await asyncio.gather(*self._runners.values(), return_exceptions=True)

    # thread-safe: callable from FastAPI's threadpool
    def submit(self, task_id: str) -> None:
        assert self._loop is not None, "TaskManager not started"
        self._loop.call_soon_threadsafe(self._spawn, task_id)

    def _spawn(self, task_id: str) -> None:
        runner = asyncio.create_task(self._supervise(task_id), name=f"task-{task_id}")
        self._runners[task_id] = runner
        runner.add_done_callback(lambda _t, tid=task_id: self._runners.pop(tid, None))

    def is_running_here(self, task_id: str) -> bool:
        return task_id in self._runners

    def cancel(self, task_id: str) -> bool:
        runner = self._runners.get(task_id)
        if runner is None or self._loop is None:
            return False
        self._loop.call_soon_threadsafe(runner.cancel)
        return True

    async def _emit(self, task_id: str, type_: str, message: str, data: dict[str, Any] | None = None, **kw: Any) -> None:
        await asyncio.to_thread(append_event, task_id, type_, message, data=data, **kw)

    async def _supervise(self, task_id: str) -> None:
        settings = get_settings()
        assert self._sem is not None
        started = time.monotonic()
        acquired = False
        try:
            await self._sem.acquire()
            acquired = True
            task = await asyncio.to_thread(task_svc.get_task, task_id)
            if task is None or task.status != "queued":
                return
            await asyncio.to_thread(task_svc.mark_running, task_id)
            await self._emit(task_id, ev.TASK_STARTED, "Orchestrator started the task", {"progress": 2, "mode": task.mode}, simulated=task.mode == "demo")
            outcome = await asyncio.wait_for(
                run_task(task_id, task.prompt, task.mode, list(task.permissions or []), task.workflow_snapshot, settings),
                timeout=settings.task_timeout_seconds,
            )
            done = await asyncio.to_thread(
                task_svc.finish_task, task_id, "completed", result=outcome["result"], result_data=outcome["result_data"],
                tokens=outcome["tokens"], llm_calls=outcome["llm_calls"], tool_calls=outcome["tool_calls"],
            )
            if done:
                validation = outcome["result_data"].get("validation") or {}
                await self._emit(task_id, ev.TASK_COMPLETED, "Task completed", {"progress": 100, "duration_ms": int((time.monotonic() - started) * 1000),
                                                                                 "validation_passed": validation.get("passed"), "tokens": outcome["tokens"]}, simulated=task.mode == "demo")
        except asyncio.CancelledError:
            if await asyncio.to_thread(task_svc.finish_task, task_id, "cancelled", error={"code": "cancelled", "message": "Cancelled by user"}):
                await self._emit(task_id, ev.TASK_CANCELLED, "Task cancelled", {"duration_ms": int((time.monotonic() - started) * 1000)})
        except asyncio.TimeoutError:
            await self._fail(task_id, "task_timeout", f"Task exceeded the {settings.task_timeout_seconds:.0f}s time limit", None)
        except ExecutionError as exc:
            await self._fail(task_id, exc.code, exc.message, exc.agent)
        except Exception:
            log.exception("Task %s crashed", task_id)
            await self._fail(task_id, "internal_error", "The task hit an unexpected internal error", None)
        finally:
            if acquired:
                self._sem.release()

    async def _fail(self, task_id: str, code: str, message: str, agent: str | None) -> None:
        err = {"code": code, "message": message, "agent": agent}
        if await asyncio.to_thread(task_svc.finish_task, task_id, "failed", error=err):
            await self._emit(task_id, ev.TASK_FAILED, message, {"code": code, "agent": agent})


def recover_interrupted() -> int:
    """Tasks left queued/running by a previous process can never finish; fail them explicitly."""
    with session_scope() as s:
        ids = [t for t in s.execute(select(Task.id).where(Task.status.in_(("queued", "running")))).scalars()]
    for tid in ids:
        err = {"code": "interrupted", "message": "The server restarted before this task finished", "agent": None}
        if task_svc.finish_task(tid, "failed", error=err):
            append_event(tid, ev.TASK_FAILED, err["message"], data={"code": "interrupted"})
    return len(ids)


manager = TaskManager()
