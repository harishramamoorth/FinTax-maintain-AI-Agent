"""Simulated model for DEMO MODE. It is deterministic rule-based text generation, NOT an AI model.
Everything it returns is labelled as simulated in the UI and in the stored events."""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from app.core.config import Settings
from app.services.llm import LLMRequest, LLMResponse

DEMO_NOTE = "_Demo mode: this answer was assembled by a rule-based simulator, not an AI model. Tool results below are real._"

_MATH = re.compile(r"(?<![\w.])(\(?\s*-?\d[\d\s.,]*(?:\s*[-+*/^%×÷]\s*\(?\s*-?\d[\d\s.]*\)?)+)")
_DATE_WORDS = re.compile(r"\b(time|date|today|now|weekday|what day)\b", re.I)
_SUMMARY_WORDS = re.compile(r"\b(summari[sz]e|summary|tl;dr|key points)\b", re.I)
_WEB_WORDS = re.compile(r"\b(latest|news|search the web|web search|current|recent|online)\b", re.I)


def _plan(prompt: str, tools: list[str]) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    math = _MATH.search(prompt)
    if math and "calculator" in tools:
        expr = math.group(1).strip().rstrip("?.! ")
        steps.append({"title": "Evaluate the arithmetic expression", "kind": "execution", "tool": "calculator", "input": {"expression": expr}})
    if _DATE_WORDS.search(prompt) and "datetime" in tools:
        steps.append({"title": "Look up the current date and time", "kind": "execution", "tool": "datetime", "input": {"operation": "now", "timezone": "UTC"}})
    stripped = prompt.strip()
    if stripped.startswith(("{", "[")) and "json_tool" in tools:
        steps.append({"title": "Validate and format the JSON", "kind": "execution", "tool": "json_tool", "input": {"json_text": stripped, "action": "format"}})
    elif _SUMMARY_WORDS.search(prompt) and len(prompt) > 200 and "text_summarizer" in tools:
        steps.append({"title": "Summarise the supplied text", "kind": "execution", "tool": "text_summarizer", "input": {"text": prompt, "max_sentences": 3}})
    leftover = _MATH.sub(" ", prompt) if math else prompt
    if not steps or len(re.findall(r"[A-Za-z]{3,}", leftover)) >= 3:
        if "knowledge_search" in tools:
            steps.insert(0, {"title": "Search the knowledge base", "kind": "research", "tool": "knowledge_search", "input": {"query": prompt[:200], "limit": 4}})
    if "web_search" in tools and _WEB_WORDS.search(prompt):
        steps.insert(0, {"title": "Search the web", "kind": "research", "tool": "web_search", "input": {"query": prompt[:200], "max_results": 4}})
    return {"objective": prompt[:160], "steps": steps[:6], "notes": "Plan produced by the demo simulator."}


def _fmt_obs(o: dict[str, Any]) -> str:
    if not o.get("ok"):
        return f"- `{o['tool']}` failed: {o.get('error', 'unknown error')}"
    out = o.get("output") or {}
    t = o["tool"]
    if t == "calculator":
        return f"- Calculator: `{out.get('expression')}` = **{out.get('formatted')}**"
    if t == "datetime":
        r = out.get("result", {})
        return f"- Date/time ({out.get('operation')}): {r.get('iso') or r.get('date') or r}"
    if t == "knowledge_search":
        hits = out.get("results", [])
        if not hits:
            return "- Knowledge base: no matching documents."
        return "- Knowledge base matches: " + "; ".join(f"**{h['title']}**" for h in hits[:4])
    if t == "web_search":
        hits = out.get("results", [])
        return "- Web results: " + "; ".join(f"[{h['title']}]({h['url']})" for h in hits[:4]) if hits else "- Web search returned no results."
    if t == "json_tool":
        return "- JSON is valid and has been formatted." if out.get("valid") else f"- JSON is invalid: {out.get('error')} (line {out.get('error_line')}, column {out.get('error_column')})"
    if t == "text_summarizer":
        return f"- Summary: {out.get('summary')}"
    return f"- `{t}` returned data."


class DemoProvider:
    name = "demo-simulator"
    simulated = True

    def __init__(self, settings: Settings):
        self._delay = settings.demo_step_delay

    async def chat(self, req: LLMRequest) -> LLMResponse:
        if self._delay > 0:
            await asyncio.sleep(self._delay)
        p = req.payload
        if req.purpose == "planner":
            text = json.dumps(_plan(p.get("prompt", ""), p.get("tools", [])))
        elif req.purpose == "analysis":
            obs = p.get("observations", [])
            lines = [_fmt_obs(o) for o in obs] or ["- No tools were needed for this request."]
            text = "Findings from the tool observations:\n" + "\n".join(lines)
        elif req.purpose == "validation":
            obs = p.get("observations", [])
            issues = [f"Tool '{o['tool']}' failed: {o.get('error')}" for o in obs if not o.get("ok")]
            text = json.dumps({"passed": not issues, "score": 1.0 if not issues else 0.5, "issues": issues,
                               "summary": "All tool calls succeeded." if not issues else "Some tool calls failed; the answer may be incomplete."})
        else:
            obs = p.get("observations", [])
            lines = [_fmt_obs(o) for o in obs]
            body = "\n".join(lines) if lines else "No tools were required. In live mode a real model would answer this directly."
            issues = p.get("issues") or []
            warn = "\n\n**Limitations:** " + "; ".join(issues) if issues else ""
            text = f"{DEMO_NOTE}\n\n**Request:** {p.get('prompt', '')[:300]}\n\n**Results**\n{body}{warn}"
        return LLMResponse(text=text, prompt_tokens=0, completion_tokens=0, model="demo-simulator", simulated=True)
