"""Tool abstraction. Every tool declares schemas, permissions and a timeout; inputs and
outputs are validated by pydantic in the runner, never trusted from the model."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar

from pydantic import BaseModel

from app.core.config import Settings

# Permission vocabulary. A task is granted a subset at creation time.
PERM_COMPUTE = "compute"
PERM_READ_KB = "read:knowledge"
PERM_NET_SEARCH = "network:search"
PERM_WRITE_EXTERNAL = "write:external"  # reserved for tools with external side effects (none shipped)

DEFAULT_PERMISSIONS = [PERM_COMPUTE, PERM_READ_KB]


@dataclass
class ToolContext:
    settings: Settings
    task_id: str | None = None


class Tool:
    name: ClassVar[str]
    description: ClassVar[str]
    InputModel: ClassVar[type[BaseModel]]
    OutputModel: ClassVar[type[BaseModel]]
    permissions: ClassVar[tuple[str, ...]] = (PERM_COMPUTE,)
    side_effects: ClassVar[bool] = False
    timeout: ClassVar[float | None] = None  # None -> settings.tool_timeout_seconds
    untrusted_output: ClassVar[bool] = False  # output contains third-party text (web / documents)

    def available(self, settings: Settings) -> bool:
        return True

    async def run(self, data: Any, ctx: ToolContext) -> dict[str, Any] | BaseModel:  # pragma: no cover - abstract
        raise NotImplementedError

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "permissions": list(self.permissions),
            "side_effects": self.side_effects,
            "input_schema": self.InputModel.model_json_schema(),
            "output_schema": self.OutputModel.model_json_schema(),
        }
