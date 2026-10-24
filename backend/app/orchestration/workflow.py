"""Server-side workflow validation. The backend never trusts the graph sent by the browser."""
from __future__ import annotations

from collections import defaultdict, deque

from pydantic import ValidationError

from app.schemas.workflow import ValidationIssue, ValidationResult, WorkflowDefinition
from app.tools.registry import ToolRegistry

NODE_TYPES = {"planner", "research", "execution", "analysis", "validation", "response"}
TOOLS_BY_TYPE = {
    "research": {"knowledge_search", "web_search"},
    "execution": {"calculator", "datetime", "text_summarizer", "json_tool"},
}
MAX_NODES = 20


def validate_definition(defn: WorkflowDefinition, registry: ToolRegistry) -> ValidationResult:
    issues: list[ValidationIssue] = []

    def add(code: str, message: str, node: str | None = None) -> None:
        issues.append(ValidationIssue(code=code, message=message, node=node))

    nodes = {}
    if not defn.nodes:
        add("empty", "A workflow needs at least one node")
    for n in defn.nodes:
        if n.id in nodes:
            add("duplicate_node", f"Duplicate node id '{n.id}'", n.id)
            continue
        nodes[n.id] = n
        if n.type not in NODE_TYPES:
            add("unknown_type", f"Unsupported agent type '{n.type}'", n.id)
            continue
        cfg = n.config or {}
        allowed_keys = {"instruction", "model"} | ({"tool", "tool_input"} if n.type in TOOLS_BY_TYPE else set())
        for k in cfg:
            if k not in allowed_keys:
                add("invalid_config", f"Option '{k}' is not supported on a {n.type} node", n.id)
        if "instruction" in cfg and (not isinstance(cfg["instruction"], str) or len(cfg["instruction"]) > 500):
            add("invalid_config", "instruction must be text of at most 500 characters", n.id)
        if "model" in cfg and (not isinstance(cfg["model"], str) or len(cfg["model"]) > 120):
            add("invalid_config", "model must be text of at most 120 characters", n.id)
        tool = cfg.get("tool")
        if n.type == "execution" and not tool:
            add("missing_tool", "Execution nodes need a tool", n.id)
        if tool:
            if tool not in TOOLS_BY_TYPE.get(n.type, set()):
                add("tool_not_allowed", f"Tool '{tool}' is not allowed on a {n.type} node", n.id)
            else:
                t = registry.get(tool)
                if t is None:
                    add("unknown_tool", f"Unknown tool '{tool}'", n.id)
                elif cfg.get("tool_input") is not None:
                    if not isinstance(cfg["tool_input"], dict):
                        add("invalid_config", "tool_input must be a JSON object", n.id)
                    else:
                        try:
                            t.InputModel.model_validate(cfg["tool_input"])
                        except ValidationError as exc:
                            add("invalid_tool_input", "Invalid tool_input: " + "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())[:200], n.id)

    if len(defn.nodes) > MAX_NODES:
        add("too_many_nodes", f"At most {MAX_NODES} nodes are allowed")

    out: dict[str, list[str]] = defaultdict(list)
    indeg: dict[str, int] = {nid: 0 for nid in nodes}
    seen_edges: set[tuple[str, str]] = set()
    for e in defn.edges:
        if e.source not in nodes or e.target not in nodes:
            add("dangling_edge", f"Edge {e.source} → {e.target} references a missing node")
            continue
        if e.source == e.target:
            add("self_loop", "A node cannot connect to itself", e.source)
            continue
        if (e.source, e.target) in seen_edges:
            add("duplicate_edge", f"Duplicate edge {e.source} → {e.target}")
            continue
        seen_edges.add((e.source, e.target))
        out[e.source].append(e.target)
        indeg[e.target] += 1

    # Kahn's algorithm (stable by node order) -> execution order + cycle detection
    order: list[str] = []
    if nodes:
        q = deque([nid for nid in nodes if indeg[nid] == 0])
        d = dict(indeg)
        while q:
            cur = q.popleft()
            order.append(cur)
            for nxt in out[cur]:
                d[nxt] -= 1
                if d[nxt] == 0:
                    q.append(nxt)
        if len(order) != len(nodes):
            add("cycle", "The workflow contains a cycle; it must be a directed acyclic graph")
            order = []

        entries = [nid for nid in nodes if indeg[nid] == 0]
        sinks = [nid for nid in nodes if not out[nid]]
        if len(entries) != 1:
            add("entry_count", f"Exactly one entry node (no incoming edges) is required; found {len(entries)}")
        if len(sinks) != 1:
            add("sink_count", f"Exactly one final node (no outgoing edges) is required; found {len(sinks)}")
        elif nodes[sinks[0]].type != "response":
            add("sink_not_response", "The final node must be a Response agent", sinks[0])
        if len(entries) == 1 and order:
            reach, stack = set(), [entries[0]]
            while stack:
                cur = stack.pop()
                if cur in reach:
                    continue
                reach.add(cur)
                stack.extend(out[cur])
            for nid in nodes:
                if nid not in reach:
                    add("unreachable", f"Node '{nid}' is not reachable from the entry node", nid)

    return ValidationResult(valid=not issues, issues=issues, order=order if not issues else [])


def parse_and_validate(raw: dict, registry: ToolRegistry) -> tuple[WorkflowDefinition | None, ValidationResult]:
    try:
        defn = WorkflowDefinition.model_validate(raw)
    except ValidationError as exc:
        return None, ValidationResult(valid=False, issues=[ValidationIssue(code="schema", message=f"{'.'.join(map(str, e['loc']))}: {e['msg']}") for e in exc.errors()[:10]])
    return defn, validate_definition(defn, registry)
