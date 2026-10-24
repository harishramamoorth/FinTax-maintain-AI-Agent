"""Provider-independent LLM layer.

* OpenAICompatProvider talks to any OpenAI-compatible /chat/completions endpoint over HTTP.
* DemoProvider produces clearly labelled, SIMULATED output for development without credentials.
"""
from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("nexus.llm")


class LLMError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass
class LLMRequest:
    purpose: str  # planner | analysis | validation | response  (used by the demo provider & logging)
    messages: list[dict[str, str]]
    model: str
    temperature: float = 0.2
    max_tokens: int = 1024
    payload: dict[str, Any] = field(default_factory=dict)  # structured context for the DEMO provider only


@dataclass
class LLMResponse:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""
    simulated: bool = False

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class LLMProvider(Protocol):
    name: str
    simulated: bool

    async def chat(self, req: LLMRequest) -> LLMResponse: ...


def provider_not_configured_error() -> AppError:
    return AppError(
        503,
        "provider_not_configured",
        "No AI provider is configured. Set AI_API_KEY (and optionally AI_BASE_URL and AI_MODEL) in the server environment, "
        "or set DEMO_MODE=true to use clearly labelled simulated responses.",
    )


class OpenAICompatProvider:
    name = "openai-compatible"
    simulated = False

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        if not settings.provider_configured:
            raise provider_not_configured_error()
        self._settings = settings
        self._transport = transport

    async def chat(self, req: LLMRequest) -> LLMResponse:
        s = self._settings
        body = {"model": req.model, "messages": req.messages, "temperature": req.temperature, "max_tokens": req.max_tokens}
        headers = {"Authorization": f"Bearer {s.ai_api_key.get_secret_value()}", "Content-Type": "application/json"}  # type: ignore[union-attr]
        url = f"{s.ai_base_url}/chat/completions"
        attempts = s.ai_max_retries + 1
        last: LLMError | None = None
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=s.ai_timeout_seconds, transport=self._transport) as client:
                    resp = await client.post(url, json=body, headers=headers)
                return self._parse(resp, req.model)
            except LLMError as exc:
                last = exc
                if not exc.retryable or attempt == attempts - 1:
                    raise
                delay = getattr(exc, "retry_after", None) or min(8.0, 0.8 * (2**attempt)) + random.random() * 0.2
                log.warning("LLM call failed (%s); retrying in %.1fs", exc.code, delay)
                await asyncio.sleep(delay if self._transport is None else 0)
            except httpx.TimeoutException as exc:
                last = LLMError("provider_timeout", "The AI provider timed out", retryable=True)
                if attempt == attempts - 1:
                    raise last from exc
                await asyncio.sleep(0 if self._transport else 0.8 * (2**attempt))
            except httpx.HTTPError as exc:
                last = LLMError("provider_unreachable", f"Could not reach the AI provider ({type(exc).__name__})", retryable=True)
                if attempt == attempts - 1:
                    raise last from exc
                await asyncio.sleep(0 if self._transport else 0.8 * (2**attempt))
        raise last or LLMError("provider_error", "Unknown provider failure")  # pragma: no cover

    @staticmethod
    def _parse(resp: httpx.Response, model: str) -> LLMResponse:
        if resp.status_code == 429:
            err = LLMError("provider_rate_limited", "The AI provider rate limit was reached", retryable=True)
            try:
                err.retry_after = min(10.0, float(resp.headers.get("retry-after", "0")))  # type: ignore[attr-defined]
            except ValueError:
                pass
            raise err
        if resp.status_code in (401, 403):
            raise LLMError("provider_auth", "The AI provider rejected the credentials. Check AI_API_KEY.")
        if resp.status_code >= 500:
            raise LLMError("provider_unavailable", f"The AI provider returned HTTP {resp.status_code}", retryable=True)
        if resp.status_code >= 400:
            raise LLMError("provider_bad_request", f"The AI provider rejected the request (HTTP {resp.status_code})")
        try:
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            if not isinstance(text, str):
                raise TypeError("content is not text")
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError("malformed_response", "The AI provider returned a response in an unexpected format") from exc
        usage = data.get("usage") or {}
        return LLMResponse(
            text=text,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            model=str(data.get("model") or model),
        )


def get_provider(settings: Settings) -> LLMProvider:
    if settings.demo_active:
        from app.services.demo_provider import DemoProvider

        return DemoProvider(settings)
    return OpenAICompatProvider(settings)
