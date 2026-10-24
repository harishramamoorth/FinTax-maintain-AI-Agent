from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class TaskCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=20000)
    workflow_id: str | None = Field(default=None, max_length=32)
    allow_web_search: bool = False

    @field_validator("prompt")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Prompt must not be blank")
        return v


class TaskOut(BaseModel):
    id: str
    prompt: str
    status: str
    mode: str
    workflow_id: str | None = None
    workflow_snapshot: dict[str, Any] | None = None
    permissions: list[str] = []
    result: str | None = None
    result_data: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    retry_of: str | None = None
    tokens_used: int = 0
    llm_calls: int = 0
    tool_calls: int = 0
    duration_ms: int | None = None
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None


class EventOut(BaseModel):
    id: int
    task_id: str
    seq: int
    type: str
    agent: str | None = None
    node: str | None = None
    tool: str | None = None
    message: str
    data: dict[str, Any] = {}
    simulated: bool = False
    created_at: str


class KnowledgeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=50000)
    tags: list[str] = Field(default_factory=list, max_length=10)
    agent_accessible: bool = True

    @field_validator("title", "content")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for t in v:
            t = t.strip()[:40]
            if t and t.lower() not in {x.lower() for x in out}:
                out.append(t)
        return out


class KnowledgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    content: str
    tags: list[str]
    agent_accessible: bool
    owner: str
    created_at: datetime
    updated_at: datetime


class KnowledgeListItem(BaseModel):
    id: str
    title: str
    snippet: str
    tags: list[str]
    agent_accessible: bool
    updated_at: datetime
    score: float | None = None


class AgentConfigIn(BaseModel):
    model: str | None = Field(default=None, max_length=120)
    temperature: float = Field(default=0.2, ge=0, le=1.5)
    max_tokens: int = Field(default=1024, ge=64, le=4096)
    enabled: bool = True


class PreferencesIn(BaseModel):
    animation_level: Literal["full", "reduced", "off"] | None = None
    log_verbosity: Literal["normal", "verbose"] | None = None
