"""The orchestrator coordinates agents and emits the events the UI animates.

Every event corresponds to something that really happened: a handoff is emitted only when the
orchestrator actually dispatches an agent with upstream data, tool events only when a tool call
is made, and statuses only change when an agent finishes or fails.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from app.agents.definitions import AGENTS, NodeSpec, PlanStep
from app.core.config import Settings
from app.events import types as ev
from app.events.service import append_event
from app.orchestration.context import AgentSettings, ExecutionError, TaskContext
from app.orchestration.workflow import parse_and_validate
from app.services.llm import get_provider
from app.services.tasks import load_agent_configs
from app.tools.registry import registry

import asyncio

log = logging.getLogger("nexus.orchestrator")


class Progress:
    def __init__(self, total: int):
        self.total, self.done = total, 0

    def percent(self) -> int:
        return min(95, int(self.done / max(1, self.total) * 95))


def _summary(key: str, out: dict[str, Any]) -> str:
    if key == "planner":
        return f"{len(out.get('plan', {}).get('steps', []))} planned step(s)"
    if key in ("research", "execution"):
        return f"{out.get('succeeded', 0)}/{out.get('tool_runs', 0)} tool run(s) succeeded"
    if key == "analysis":
        return (out.get("analysis") or "")[:140]
    if key == "validation":
        v = out.get("validation", {})
        return "passed" if v.get("passed") else f"{len(v.get('issues', []))} issue(s)"
    return "answer drafted"


async def run_task(task_id: str, prompt: str, mode: str, permissions: list[str], workflow: dict | None, settings: Settings) -> dict[str, Any]:
    """Runs the full pipeline and returns {result, result_data, tokens, llm_calls, tool_calls}."""

    async def emit(type_: str, message: str = "", *, agent: str | None = None, node: str | None = None, tool: str | None = None,
                   data: dict[str, Any] | None = None, simulated: bool = False) -> dict[str, Any]:
        return await asyncio.to_thread(append_event, task_id, type_, message, agent=agent, node=node, tool=tool, data=data, simulated=simulated)

    provider = get_provider(settings)
    cfgs = await asyncio.to_thread(load_agent_configs, settings.ai_model)
    agent_settings = {k: AgentSettings(**v) for k, v in cfgs.items()}
    ctx = TaskContext(task_id=task_id, prompt=prompt, mode=mode, permissions=set(permissions), settings=settings, provider=provider,
                      registry=registry, emit=emit, agent_settings=agent_settings)

    async def run_agent(key: str, node: NodeSpec, edges: list[dict[str, str]], progress: Progress, steps: list[PlanStep] | None = None) -> dict[str, Any]:
        agent = AGENTS[key]
        cfg = agent_settings.get(key)
        if cfg and not cfg.enabled and key not in ("planner", "response"):
            raise ExecutionError("agent_disabled", f"{agent.name} is disabled in its configuration", key)
        override = node.config.get("model")
        if override:
            base = agent_settings.get(key) or AgentSettings(model=settings.ai_model)
            ctx.agent_settings[key] = AgentSettings(model=str(override), temperature=base.temperature, max_tokens=base.max_tokens, enabled=base.enabled)
        await emit(ev.AGENT_HANDOFF, f"Orchestrator dispatches {agent.name}", agent=key, node=node.id, data={"edges": edges, "progress": progress.percent()})
        await emit(ev.AGENT_STARTED, f"{agent.name} started", agent=key, node=node.id,
                   data={"progress": progress.percent(), "uses_model": agent.uses_model, "description": agent.description}, simulated=agent.uses_model and ctx.simulated)
        t0 = time.monotonic()
        try:
            out = await agent.run(ctx, node, steps)
            if key in ("research", "execution") and out.get("tool_runs") and out.get("succeeded") == 0:
                last = next((o for o in reversed(ctx.observations) if o.agent == key and not o.ok), None)
                raise ExecutionError("tool_failed", f"All tool calls failed: {last.error if last else 'unknown error'}", key)
        except ExecutionError as exc:
            await emit(ev.AGENT_FAILED, f"{agent.name} failed: {exc.message}", agent=key, node=node.id, data={"code": exc.code, "duration_ms": int((time.monotonic() - t0) * 1000)})
            exc.agent = exc.agent or key
            raise
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # unexpected bug inside an agent
            log.exception("Agent %s crashed", key)
            await emit(ev.AGENT_FAILED, f"{agent.name} crashed unexpectedly", agent=key, node=node.id, data={"code": "agent_error"})
            raise ExecutionError("agent_error", f"{agent.name} hit an unexpected error", key) from exc
        progress.done += 1
        ctx.outputs[node.id] = out
        await emit(ev.AGENT_COMPLETED, f"{agent.name} completed", agent=key, node=node.id, simulated=agent.uses_model and ctx.simulated,
                   data={"progress": progress.percent(), "duration_ms": int((time.monotonic() - t0) * 1000), "summary": _summary(key, out)})
        return out

    def ctl(node_id: str) -> dict[str, str]:
        return {"from": "orchestrator", "to": node_id, "kind": "control"}

    def data(a: str, b: str) -> dict[str, str]:
        return {"from": a, "to": b, "kind": "data"}

    if workflow:
        defn, verdict = parse_and_validate(workflow, registry)
        if defn is None or not verdict.valid:
            raise ExecutionError("invalid_workflow", "Workflow failed server-side validation: " + "; ".join(i.message for i in verdict.issues[:3]))
        by_id = {n.id: n for n in defn.nodes}
        preds: dict[str, list[str]] = {n.id: [] for n in defn.nodes}
        for e in defn.edges:
            preds[e.target].append(e.source)
        progress = Progress(len(defn.nodes))
        for nid in verdict.order:
            n = by_id[nid]
            spec = NodeSpec(id=n.id, type=n.type, config=n.config)
            await run_agent(n.type, spec, [ctl(nid)] + [data(p, nid) for p in preds[nid]], progress)
    else:
        progress = Progress(6)
        planner = NodeSpec(id="planner", type="planner")
        await run_agent("planner", planner, [ctl("planner")], progress)
        steps = (ctx.plan or {}).get("steps", [])
        groups = {"research": [PlanStep(**s) for s in steps if s["kind"] == "research"], "execution": [PlanStep(**s) for s in steps if s["kind"] == "execution"]}
        progress.total = 4 + sum(1 for g in groups.values() if g)
        upstream = []
        for key in ("research", "execution"):
            if groups[key]:
                await run_agent(key, NodeSpec(id=key, type=key), [ctl(key), data("planner", key)], progress, groups[key])
                upstream.append(key)
        await run_agent("analysis", NodeSpec(id="analysis", type="analysis"), [ctl("analysis")] + [data(u, "analysis") for u in upstream], progress)
        await run_agent("validation", NodeSpec(id="validation", type="validation"), [ctl("validation"), data("analysis", "validation")], progress)
        await run_agent("response", NodeSpec(id="response", type="response"), [ctl("response"), data("validation", "response")], progress)

    final = next((o for o in reversed(list(ctx.outputs.values())) if "answer" in o), None)
    if final is None:
        raise ExecutionError("no_answer", "The workflow finished without producing an answer")
    result_data = {
        "plan": ctx.plan,
        "observations": [o.as_dict() for o in ctx.observations],
        "analysis": ctx.analysis,
        "validation": ctx.validation,
        "sources": final.get("sources", []),
        "warnings": ctx.warnings,
        "simulated": ctx.simulated,
        "model": "demo-simulator" if ctx.simulated else settings.ai_model,
    }
    return {"result": final["answer"], "result_data": result_data, "tokens": ctx.tokens, "llm_calls": ctx.llm_calls, "tool_calls": ctx.tool_calls}
