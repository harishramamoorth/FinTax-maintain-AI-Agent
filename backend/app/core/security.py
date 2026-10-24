"""Optional shared access token + simple in-memory rate limiter.

This is NOT multi-user authentication. If ACCESS_TOKEN is set, every /api route except
/api/health requires `Authorization: Bearer <token>`. Leave it unset only for local use.
"""
from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request

from app.core.config import Settings, get_settings


def require_access(request: Request, settings: Settings = Depends(get_settings)) -> None:
    if not settings.access_token:
        return
    header = request.headers.get("authorization", "")
    supplied = header[7:].strip() if header.lower().startswith("bearer ") else ""
    expected = settings.access_token.get_secret_value()
    if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="A valid access token is required", headers={"WWW-Authenticate": "Bearer"})


class SlidingWindowLimiter:
    """Per-process sliding-window limiter. Use a shared store (e.g. Redis) when running several workers."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: float = 60.0) -> float | None:
        """Returns None if allowed, otherwise seconds until the next slot."""
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return max(0.1, window - (now - q[0]))
        q.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindowLimiter()


def rate_limited(request: Request, settings: Settings = Depends(get_settings)) -> None:
    ip = request.client.host if request.client else "unknown"
    retry = limiter.check(f"expensive:{ip}", settings.rate_limit_per_minute)
    if retry is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please slow down.",
            headers={"Retry-After": str(int(retry) + 1)},
        )


def auth_rate_limited(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    retry = limiter.check(f"auth:{ip}", 5)
    if retry is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many sign-in attempts. Please try again later.",
            headers={"Retry-After": str(int(retry) + 1)},
        )
