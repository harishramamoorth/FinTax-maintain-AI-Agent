from __future__ import annotations

from app.core.config import Settings
from app.tools.base import Tool
from app.tools.builtin import (
    CalculatorTool,
    DateTimeTool,
    JsonTool,
    KnowledgeSearchTool,
    SummarizerTool,
    WebSearchTool,
)


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Duplicate tool {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return list(self._tools)

    def usable(self, settings: Settings, granted: set[str]) -> list[Tool]:
        """Tools that are configured and whose permissions are all granted."""
        return [t for t in self._tools.values() if t.available(settings) and set(t.permissions) <= granted]

    def describe_all(self, settings: Settings) -> list[dict]:
        return [{**t.describe(), "available": t.available(settings)} for t in self._tools.values()]


def build_registry() -> ToolRegistry:
    reg = ToolRegistry()
    for t in (CalculatorTool(), DateTimeTool(), SummarizerTool(), JsonTool(), KnowledgeSearchTool(), WebSearchTool()):
        reg.register(t)
    return reg


registry = build_registry()
