from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Position(BaseModel):
    x: float = 0
    y: float = 0


class WorkflowNode(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,40}$")
    type: str = Field(max_length=32)
    label: str | None = Field(default=None, max_length=80)
    position: Position = Field(default_factory=Position)
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowEdge(BaseModel):
    id: str | None = Field(default=None, max_length=100)
    source: str = Field(max_length=40)
    target: str = Field(max_length=40)


class WorkflowDefinition(BaseModel):
    nodes: list[WorkflowNode] = Field(default_factory=list, max_length=20)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=60)


class WorkflowIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    definition: WorkflowDefinition


class WorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    definition: dict[str, Any]
    version: int
    created_at: datetime
    updated_at: datetime


class ValidationIssue(BaseModel):
    code: str
    message: str
    node: str | None = None


class ValidationResult(BaseModel):
    valid: bool
    issues: list[ValidationIssue]
    order: list[str] = Field(default_factory=list)


class WorkflowExecuteIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    allow_web_search: bool = False
