"""Agent implementations. Each agent is a functional capability driven by the orchestrator.
An agent only reports tool/model activity when the corresponding operation really happened."""
from __future__ import annotations

import json
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, Field

from app.events import types as ev
from app.orchestration.context import (
    UNTRUSTED_NOTICE,
    ExecutionError,
    Observation,
    TaskContext,
    wrap_untrusted,
)


class PlanStep(BaseModel):
    title: str = Field(max_length=200)
    kind: Literal["research", "execution"]
    tool: str = Field(max_length=64)
    input: dict[str, Any] = Field(default_factory=dict)


class Plan(BaseModel):
    objective: str = Field(default="", max_length=500)
    steps: list[PlanStep] = Field(default_factory=list, max_length=6)
    notes: str = Field(default="", max_length=1000)


class ValidationReport(BaseModel):
    passed: bool
    score: float = Field(default=0.0, ge=0.0, le=1.0)
    issues: list[str] = Field(default_factory=list, max_length=10)
    summary: str = Field(default="", max_length=600)


class NodeSpec(BaseModel):
    id: str
    type: str
    config: dict[str, Any] = Field(default_factory=dict)


def observations_block(ctx: TaskContext) -> str:
    if not ctx.observations:
        return "(no tool observations)"
    parts = []
    for o in ctx.observations:
        body = json.dumps(o.output if o.ok else {"error": o.error, "code": o.error_code}, ensure_ascii=False, default=str)
        label = f"tool:{o.tool}"
        parts.append(wrap_untrusted(label, body) if o.untrusted else f"[{label}] ok={o.ok}\n{body[:4000]}")
    return "\n\n".join(parts)


class Agent:
    key: ClassVar[str]
    name: ClassVar[str]
    description: ClassVar[str]
    default_temperature: ClassVar[float] = 0.2
    default_max_tokens: ClassVar[int] = 1024
    uses_model: ClassVar[bool] = False

    async def run(self, ctx: TaskContext, node: NodeSpec, steps: list[PlanStep] | None = None) -> dict[str, Any]:  # pragma: no cover
        raise NotImplementedError


class PlannerAgent(Agent):
    key, name = "planner", "Planner Agent"
    description = "Decomposes the request into a short, tool-backed plan. Chooses only from allow-listed tools."
    default_temperature = 0.1
    uses_model = True

    async def run(self, ctx, node, steps=None):
        tools = ctx.registry.usable(ctx.settings, ctx.permissions)
        catalogue = [{"name": t.name, "description": t.description, "input_schema": t.InputModel.model_json_schema().get("properties", {})} for t in tools]
        system = (
            "You are the planning component of an agent system. Decompose the user's task into at most 6 steps. "
            "Each step must use exactly one tool from the catalogue (kind 'research' for knowledge_search/web_search, 'execution' for the rest). "
            "If no tool is needed, return an empty steps list. Reply with ONLY a JSON object: "
            '{"objective": str, "steps": [{"title": str, "kind": "research"|"execution", "tool": str, "input": object}], "notes": str}.\n'
            f"Tool catalogue: {json.dumps(catalogue)}\n{UNTRUSTED_NOTICE}"
        )
        if node.config.get("instruction"):
            system += f"\nAdditional operator instruction: {str(node.config['instruction'])[:500]}"
        plan = await ctx.llm_json(self.key, node.id, "planner", system, f"<user_task>\n{ctx.prompt}\n</user_task>", Plan,
                                  {"prompt": ctx.prompt, "tools": [t.name for t in tools]})
        assert isinstance(plan, Plan)
        valid: list[PlanStep] = []
        allowed = {t.name for t in tools}
        for st in plan.steps:
            if st.tool not in allowed:
                ctx.warnings.append(f"Planner proposed unavailable tool '{st.tool}'; step dropped.")
                await ctx.emit(ev.AGENT_PROGRESS, f"Dropped plan step with unavailable tool '{st.tool}'", agent=self.key, node=node.id, data={"stage": "plan_filter"})
                continue
            valid.append(st)
        plan.steps = valid
        ctx.plan = plan.model_dump()
        await ctx.emit(ev.AGENT_PROGRESS, f"Plan ready: {len(valid)} step(s)", agent=self.key, node=node.id, simulated=ctx.simulated, data={"stage": "plan", "plan": ctx.plan})
        return {"plan": ctx.plan}


class _ToolAgent(Agent):
    """Runs the tool steps assigned to it. Never invents results."""

    kind: ClassVar[str]

    async def run(self, ctx, node, steps=None):
        todo = list(steps or [])
        if not todo and node.config.get("tool"):
            tool = str(node.config["tool"])
            cfg_input = node.config.get("tool_input")
            if not isinstance(cfg_input, dict):
                cfg_input = default_tool_input(tool, ctx.prompt)
            todo = [PlanStep(title=f"Run {tool}", kind=self.kind, tool=tool, input=cfg_input)]  # type: ignore[arg-type]
        if not todo and self.key == "research":
            todo = [PlanStep(title="Search the knowledge base", kind="research", tool="knowledge_search", input=default_tool_input("knowledge_search", ctx.prompt))]
        results: list[Observation] = []
        for i, step in enumerate(todo, 1):
            await ctx.emit(ev.AGENT_PROGRESS, f"Step {i}/{len(todo)}: {step.title}", agent=self.key, node=node.id, data={"stage": "step", "tool": step.tool})
            results.append(await ctx.call_tool(self.key, node.id, step.tool, step.input))
        ok = sum(1 for o in results if o.ok)
        return {"tool_runs": len(results), "succeeded": ok, "failed": len(results) - ok}


class ResearchAgent(_ToolAgent):
    key, name, kind = "research", "Research Agent", "research"
    description = "Gathers information using read-only, permitted tools (knowledge-base search, and web search when configured and allowed)."


class ExecutionAgent(_ToolAgent):
    key, name, kind = "execution", "Execution Agent", "execution"
    description = "Performs approved operations with allow-listed tools (calculator, date/time, JSON, summariser). No shell, no file access."


def default_tool_input(tool: str, prompt: str) -> dict[str, Any]:
    if tool in ("knowledge_search", "web_search"):
        return {"query": prompt[:200]}
    if tool == "text_summarizer":
        return {"text": prompt[:20000]}
    if tool == "json_tool":
        return {"json_text": prompt[:50000]}
    if tool == "calculator":
        return {"expression": prompt[:200]}
    return {}


class AnalysisAgent(Agent):
    key, name = "analysis", "Analysis Agent"
    description = "Interprets the collected observations and drafts findings grounded in them."
    uses_model = True

    async def run(self, ctx, node, steps=None):
        system = ("You are the analysis component of an agent system. Using ONLY the tool observations, write concise findings that address the user's task. "
                  "State clearly what is unknown or failed. Do not invent facts, numbers or sources.\n" + UNTRUSTED_NOTICE)
        if node.config.get("instruction"):
            system += f"\nAdditional operator instruction: {str(node.config['instruction'])[:500]}"
        upstream = _upstream_text(ctx, node)
        user = f"<user_task>\n{ctx.prompt}\n</user_task>\n\nObservations:\n{observations_block(ctx)}{upstream}"
        text = await ctx.llm(self.key, node.id, "analysis", [{"role": "system", "content": system}, {"role": "user", "content": user}],
                             {"prompt": ctx.prompt, "observations": [o.as_dict() for o in ctx.observations]})
        ctx.analysis = text.strip()[:8000]
        return {"analysis": ctx.analysis}


class ValidationAgent(Agent):
    key, name = "validation", "Validation Agent"
    description = "Checks completeness and grounding of the analysis, including failed tool calls, before the answer is written."
    uses_model = True
    default_temperature = 0.0

    async def run(self, ctx, node, steps=None):
        failed = [o for o in ctx.observations if not o.ok]
        system = ("You are the validation component of an agent system. Check whether the analysis fully addresses the user task and is grounded in the observations. "
                  'Reply with ONLY JSON: {"passed": bool, "score": number 0..1, "issues": [str], "summary": str}.\n' + UNTRUSTED_NOTICE)
        user = f"<user_task>\n{ctx.prompt}\n</user_task>\n\nAnalysis:\n{ctx.analysis or '(none)'}\n\nObservations:\n{observations_block(ctx)}"
        report = await ctx.llm_json(self.key, node.id, "validation", system, user, ValidationReport,
                                    {"prompt": ctx.prompt, "observations": [o.as_dict() for o in ctx.observations], "analysis": ctx.analysis})
        assert isinstance(report, ValidationReport)
        # Deterministic checks the model cannot overrule.
        if failed and report.passed:
            report.passed = False
            report.issues.append(f"{len(failed)} tool call(s) failed: " + ", ".join(sorted({o.tool for o in failed})))
        if not (ctx.analysis or "").strip():
            report.passed = False
            report.issues.append("Analysis was empty")
        ctx.validation = report.model_dump()
        level = "passed" if report.passed else "found issues"
        await ctx.emit(ev.AGENT_PROGRESS, f"Validation {level} (score {report.score:.2f})", agent=self.key, node=node.id, simulated=ctx.simulated,
                       data={"stage": "validation", "validation": ctx.validation})
        return {"validation": ctx.validation}


class ResponseAgent(Agent):
    key, name = "response", "Response Agent"
    description = "Writes the final structured answer. Sources are taken from real tool outputs only."
    uses_model = True
    default_temperature = 0.3
    default_max_tokens = 1500

    async def run(self, ctx, node, steps=None):
        issues = (ctx.validation or {}).get("issues", [])
        system = ("You are the response component of an agent system. Write the final answer in Markdown for the user. Be accurate and concise, base claims on the analysis and observations, "
                  "mention limitations or failed steps honestly, and never fabricate citations or sources.\n" + UNTRUSTED_NOTICE)
        if node.config.get("instruction"):
            system += f"\nAdditional operator instruction: {str(node.config['instruction'])[:500]}"
        user = (f"<user_task>\n{ctx.prompt}\n</user_task>\n\nAnalysis:\n{ctx.analysis or '(none)'}\n\nValidation issues: {json.dumps(issues)}\n\n"
                f"Observations:\n{observations_block(ctx)}{_upstream_text(ctx, node)}")
        text = await ctx.llm(self.key, node.id, "response", [{"role": "system", "content": system}, {"role": "user", "content": user}],
                             {"prompt": ctx.prompt, "observations": [o.as_dict() for o in ctx.observations], "analysis": ctx.analysis, "issues": issues})
        answer = text.strip()
        if not answer:
            raise ExecutionError("empty_response", "The model returned an empty answer", self.key)
        return {"answer": answer[:20000], "sources": collect_sources(ctx)}


def _upstream_text(ctx: TaskContext, node: NodeSpec) -> str:
    plan = ctx.plan
    if plan and plan.get("objective") and node.type != "planner":
        return f"\n\nPlan objective: {plan['objective'][:300]}"
    return ""


def collect_sources(ctx: TaskContext) -> list[dict[str, str]]:
    """Sources come exclusively from real tool outputs (never model-generated)."""
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for o in ctx.observations:
        if not o.ok or not o.output:
            continue
        for hit in o.output.get("results", []) or []:
            if o.tool == "web_search" and hit.get("url") and hit["url"] not in seen:
                seen.add(hit["url"])
                out.append({"type": "web", "title": hit.get("title", ""), "url": hit["url"]})
            elif o.tool == "knowledge_search" and hit.get("id") and hit["id"] not in seen:
                seen.add(hit["id"])
                out.append({"type": "knowledge", "title": hit.get("title", ""), "id": hit["id"]})
    return out


AGENTS: dict[str, Agent] = {a.key: a for a in (PlannerAgent(), ResearchAgent(), ExecutionAgent(), AnalysisAgent(), ValidationAgent(), ResponseAgent())}
AGENT_ORDER = ["planner", "research", "execution", "analysis", "validation", "response"]
