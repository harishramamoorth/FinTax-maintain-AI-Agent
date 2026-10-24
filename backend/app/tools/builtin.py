"""Built-in tools. None of them runs shell commands, arbitrary code or touches the filesystem."""
from __future__ import annotations

import ast
import json
import math
import operator
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import Settings
from app.db.session import session_scope
from app.repositories.knowledge import search_documents
from app.tools.base import PERM_COMPUTE, PERM_NET_SEARCH, PERM_READ_KB, Tool, ToolContext


class ToolFailure(Exception):
    """Expected, user-presentable tool failure (bad input, upstream error)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# --------------------------------------------------------------------- calculator
_BIN = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow,
}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_FUNCS = {
    "sqrt": math.sqrt, "abs": abs, "round": round, "min": min, "max": max, "sin": math.sin, "cos": math.cos,
    "tan": math.tan, "log": math.log, "log10": math.log10, "exp": math.exp, "floor": math.floor, "ceil": math.ceil,
}
_CONSTS = {"pi": math.pi, "e": math.e}
_MAX_NODES = 100


def safe_eval(expression: str) -> float | int:
    expr = expression.replace("^", "**").replace("×", "*").replace("÷", "/")
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as exc:
        raise ToolFailure("invalid_expression", f"Could not parse expression: {exc.msg}") from exc
    if sum(1 for _ in ast.walk(tree)) > _MAX_NODES:
        raise ToolFailure("expression_too_complex", "Expression is too complex")

    def ev(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        if isinstance(node, ast.Name) and node.id in _CONSTS:
            return _CONSTS[node.id]
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
            return _UNARY[type(node.op)](ev(node.operand))
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and (abs(right) > 1000 or abs(left) > 1e6):
                raise ToolFailure("operand_too_large", "Exponent or base is too large")
            return _BIN[type(node.op)](left, right)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS and not node.keywords:
            return _FUNCS[node.func.id](*[ev(a) for a in node.args])
        raise ToolFailure("unsupported_syntax", "Only numbers, + - * / // % **, parentheses and basic math functions are allowed")

    try:
        result = ev(tree)
    except ZeroDivisionError as exc:
        raise ToolFailure("division_by_zero", "Division by zero") from exc
    except (ValueError, OverflowError, TypeError) as exc:
        raise ToolFailure("math_error", f"Math error: {exc}") from exc
    if isinstance(result, float) and (math.isnan(result) or math.isinf(result)):
        raise ToolFailure("math_error", "Result is not a finite number")
    return result


class CalcIn(BaseModel):
    expression: str = Field(min_length=1, max_length=200)


class CalcOut(BaseModel):
    expression: str
    result: float | int
    formatted: str


class CalculatorTool(Tool):
    name = "calculator"
    description = "Evaluate an arithmetic expression (+ - * / // % ** , parentheses, sqrt, abs, round, min, max, sin, cos, tan, log, log10, exp, floor, ceil, pi, e)."
    InputModel, OutputModel = CalcIn, CalcOut
    permissions = (PERM_COMPUTE,)

    async def run(self, data: CalcIn, ctx: ToolContext):
        result = safe_eval(data.expression)
        if isinstance(result, float) and result.is_integer() and abs(result) < 1e15:
            result = int(result)
        formatted = f"{result:,}" if isinstance(result, int) else f"{result:,.10g}"
        return {"expression": data.expression, "result": result, "formatted": formatted}


# ---------------------------------------------------------------------- datetime
class DateTimeIn(BaseModel):
    operation: Literal["now", "add_days", "diff_days"] = "now"
    timezone: str = Field(default="UTC", max_length=64)
    date: str | None = Field(default=None, description="ISO date YYYY-MM-DD (add_days)")
    days: int | None = Field(default=None, ge=-36500, le=36500)
    start: str | None = None
    end: str | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.operation == "add_days" and (self.date is None or self.days is None):
            raise ValueError("add_days requires 'date' and 'days'")
        if self.operation == "diff_days" and (self.start is None or self.end is None):
            raise ValueError("diff_days requires 'start' and 'end'")
        return self


class DateTimeOut(BaseModel):
    operation: str
    result: dict[str, Any]


class DateTimeTool(Tool):
    name = "datetime"
    description = "Current date/time in a timezone, add days to a date, or the number of days between two dates."
    InputModel, OutputModel = DateTimeIn, DateTimeOut

    async def run(self, data: DateTimeIn, ctx: ToolContext):
        try:
            tz = ZoneInfo(data.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ToolFailure("unknown_timezone", f"Unknown timezone '{data.timezone}'") from exc
        try:
            if data.operation == "now":
                now = datetime.now(timezone.utc).astimezone(tz)
                return {"operation": "now", "result": {"iso": now.isoformat(timespec="seconds"), "date": now.date().isoformat(),
                                                        "time": now.strftime("%H:%M:%S"), "weekday": now.strftime("%A"), "timezone": data.timezone}}
            if data.operation == "add_days":
                d = date.fromisoformat(data.date or "") + timedelta(days=data.days or 0)
                return {"operation": "add_days", "result": {"date": d.isoformat(), "weekday": d.strftime("%A")}}
            a, b = date.fromisoformat(data.start or ""), date.fromisoformat(data.end or "")
            return {"operation": "diff_days", "result": {"days": (b - a).days, "start": a.isoformat(), "end": b.isoformat()}}
        except (ValueError, OverflowError) as exc:
            raise ToolFailure("invalid_date", f"Invalid date: {exc}") from exc


# -------------------------------------------------------------------- summarizer
_STOP = set("""a an and are as at be but by for from has have he her his i in is it its of on or our she that the their them they this to was we were what when which who will with you your not can do does did if into than then so such these those there here been being also more most other some any each about over under after before between during while just very""".split())


class SummIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    max_sentences: int = Field(default=3, ge=1, le=10)


class SummOut(BaseModel):
    summary: str
    key_points: list[str]
    keywords: list[str]
    word_count: int
    sentence_count: int
    method: str


class SummarizerTool(Tool):
    name = "text_summarizer"
    description = "Extractive structured summary of a text: top sentences, key points and keywords. Runs locally without an AI model."
    InputModel, OutputModel = SummIn, SummOut

    async def run(self, data: SummIn, ctx: ToolContext):
        text = data.text.strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n{2,}", text) if len(s.strip()) > 0]
        words = [w for w in re.findall(r"[^\W\d_]{3,}", text.lower()) if w not in _STOP]
        freq = Counter(words)
        scored = []
        for i, s in enumerate(sentences):
            toks = [w for w in re.findall(r"[^\W\d_]{3,}", s.lower()) if w not in _STOP]
            score = sum(freq[t] for t in toks) / (len(toks) ** 0.5 + 1) if toks else 0
            scored.append((score, i, s))
        top = sorted(sorted(scored, reverse=True)[: data.max_sentences], key=lambda x: x[1])
        picks = [s for _, _, s in top]
        return {
            "summary": " ".join(picks),
            "key_points": picks,
            "keywords": [w for w, _ in freq.most_common(8)],
            "word_count": len(re.findall(r"\S+", text)),
            "sentence_count": len(sentences),
            "method": "extractive-frequency",
        }


# -------------------------------------------------------------------------- json
class JsonIn(BaseModel):
    json_text: str = Field(min_length=1, max_length=50000)
    action: Literal["format", "validate", "minify"] = "format"
    indent: int = Field(default=2, ge=0, le=8)


class JsonOut(BaseModel):
    valid: bool
    formatted: str | None = None
    error: str | None = None
    error_line: int | None = None
    error_column: int | None = None
    top_level_type: str | None = None


class JsonTool(Tool):
    name = "json_tool"
    description = "Validate, pretty-print or minify JSON text and report syntax errors with their position."
    InputModel, OutputModel = JsonIn, JsonOut

    async def run(self, data: JsonIn, ctx: ToolContext):
        try:
            parsed = json.loads(data.json_text)
        except json.JSONDecodeError as exc:
            return {"valid": False, "error": exc.msg, "error_line": exc.lineno, "error_column": exc.colno}
        out: dict[str, Any] = {"valid": True, "top_level_type": type(parsed).__name__}
        if data.action == "format":
            out["formatted"] = json.dumps(parsed, indent=data.indent, ensure_ascii=False)
        elif data.action == "minify":
            out["formatted"] = json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
        return out


# --------------------------------------------------------------- knowledge search
class KBIn(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=5, ge=1, le=10)


class KBHit(BaseModel):
    id: str
    title: str
    snippet: str
    score: float


class KBOut(BaseModel):
    results: list[KBHit]
    total: int
    method: str = "keyword"


class KnowledgeSearchTool(Tool):
    name = "knowledge_search"
    description = "Read-only keyword search over knowledge-base documents that are marked as agent-accessible."
    InputModel, OutputModel = KBIn, KBOut
    permissions = (PERM_READ_KB,)
    untrusted_output = True

    async def run(self, data: KBIn, ctx: ToolContext):
        with session_scope() as s:
            hits = search_documents(s, data.query, agent_only=True, limit=data.limit)
        return {"results": hits, "total": len(hits), "method": "keyword"}


# ------------------------------------------------------------------- web search
class WebIn(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    max_results: int = Field(default=5, ge=1, le=8)

    @field_validator("query")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class WebHit(BaseModel):
    title: str
    url: str
    snippet: str


class WebOut(BaseModel):
    results: list[WebHit]
    provider: str


_TAG = re.compile(r"<[^>]+>")


class WebSearchTool(Tool):
    name = "web_search"
    description = "Search the public web (Brave Search API). Only available when SEARCH_API_KEY is configured and the task allows web search."
    InputModel, OutputModel = WebIn, WebOut
    permissions = (PERM_NET_SEARCH,)
    timeout = 15.0
    untrusted_output = True

    def available(self, settings: Settings) -> bool:
        return settings.search_configured

    async def run(self, data: WebIn, ctx: ToolContext):
        s = ctx.settings
        if not s.search_configured:
            raise ToolFailure("not_configured", "Web search is not configured (set SEARCH_API_KEY)")
        try:
            async with httpx.AsyncClient(timeout=s.search_timeout_seconds) as client:
                resp = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params={"q": data.query, "count": data.max_results},
                    headers={"X-Subscription-Token": s.search_api_key.get_secret_value(), "Accept": "application/json"},  # type: ignore[union-attr]
                )
        except httpx.HTTPError as exc:
            raise ToolFailure("search_unreachable", f"Search provider unreachable ({type(exc).__name__})") from exc
        if resp.status_code == 429:
            raise ToolFailure("search_rate_limited", "Search provider rate limit reached")
        if resp.status_code >= 400:
            raise ToolFailure("search_error", f"Search provider returned HTTP {resp.status_code}")
        try:
            items = resp.json().get("web", {}).get("results", [])
        except ValueError as exc:
            raise ToolFailure("search_malformed", "Search provider returned malformed data") from exc
        hits = [
            {"title": _TAG.sub("", str(i.get("title", "")))[:200], "url": str(i.get("url", "")), "snippet": _TAG.sub("", str(i.get("description", "")))[:400]}
            for i in items[: data.max_results]
            if i.get("url")
        ]
        return {"results": hits, "provider": "brave"}
