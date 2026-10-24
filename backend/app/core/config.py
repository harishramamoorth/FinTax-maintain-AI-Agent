"""Application settings, loaded from environment variables (and an optional .env file).

Secrets (AI_API_KEY, SEARCH_API_KEY, ACCESS_TOKEN) are held as SecretStr and are
never serialised into API responses or logs.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_DIR / ".env"), str(ROOT_DIR / "backend" / ".env")),
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    # --- Database -------------------------------------------------------
    database_url: str = f"sqlite:///{(ROOT_DIR / 'data' / 'nexus.db').as_posix()}"
    auto_migrate: bool = True
    document_storage_dir: str = str(ROOT_DIR / "data" / "documents")
    max_document_upload_bytes: int = 50 * 1024 * 1024

    # --- AI provider (OpenAI-compatible chat completions) ---------------
    ai_api_key: SecretStr | None = None
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 60.0
    ai_max_retries: int = 2

    # --- Demo mode ("auto": demo when no API key; "true": force; "false": never)
    demo_mode: Literal["auto", "true", "false"] = "auto"
    demo_step_delay: float = 0.9

    # --- Optional web search (Brave Search API) -------------------------
    search_api_key: SecretStr | None = None
    search_timeout_seconds: float = 10.0

    # --- Access control / network --------------------------------------
    access_token: SecretStr | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Limits ----------------------------------------------------------
    max_request_bytes: int = 1_000_000
    max_prompt_chars: int = 4000
    max_tokens_per_task: int = 20_000
    max_llm_calls_per_task: int = 12
    max_tool_calls_per_task: int = 8
    task_timeout_seconds: float = 180.0
    tool_timeout_seconds: float = 10.0
    max_concurrent_tasks: int = 3
    rate_limit_per_minute: int = 20

    # --- Static frontend (production) ---------------------------------
    frontend_dist: str | None = None

    @field_validator("ai_api_key", "search_api_key", "access_token", mode="before")
    @classmethod
    def _empty_secret_is_none(cls, v):
        # `AI_API_KEY=` in a .env file means "not set", not "set to an empty string".
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @property
    def auth_required(self) -> bool:
        return self.access_token is not None

    @field_validator("database_url")
    @classmethod
    def _normalise_db_url(cls, v: str) -> str:
        # Hosting platforms commonly hand out postgres:// or postgresql:// URLs.
        if v.startswith("postgres://"):
            v = "postgresql+psycopg://" + v[len("postgres://"):]
        elif v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @field_validator("ai_base_url")
    @classmethod
    def _strip_base(cls, v: str) -> str:
        return v.rstrip("/")

    # -- derived ---------------------------------------------------------
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def provider_configured(self) -> bool:
        return bool(self.ai_api_key and self.ai_api_key.get_secret_value().strip())

    @property
    def search_configured(self) -> bool:
        return bool(self.search_api_key and self.search_api_key.get_secret_value().strip())

    @property
    def demo_active(self) -> bool:
        if self.demo_mode == "true":
            return True
        if self.demo_mode == "false":
            return False
        return not self.provider_configured

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def dist_path(self) -> Path:
        if self.frontend_dist:
            return Path(self.frontend_dist)
        return ROOT_DIR / "frontend" / "dist"

    def secret_values(self) -> list[str]:
        out: list[str] = []
        for s in (self.ai_api_key, self.search_api_key, self.access_token):
            if s and s.get_secret_value():
                out.append(s.get_secret_value())
        return out


@lru_cache
def get_settings() -> Settings:
    return Settings()
