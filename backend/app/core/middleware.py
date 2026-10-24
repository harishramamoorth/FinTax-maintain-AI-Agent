"""ASGI middleware: request IDs, security headers, body size limit."""
from __future__ import annotations

import json
import uuid
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send
from starlette.responses import JSONResponse


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        rid = uuid.uuid4().hex[:12]
        scope.setdefault("state", {})["request_id"] = rid

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", rid.encode()))
                headers.append((b"x-content-type-options", b"nosniff"))
                headers.append((b"referrer-policy", b"same-origin"))
                headers.append((b"x-frame-options", b"DENY"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


class OriginCheckMiddleware:
    """Reject cross-origin state-changing API requests, including same-site subdomains."""

    _SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

    def __init__(self, app: ASGIApp, allowed_origins: list[str]) -> None:
        self.app = app
        self.allowed_origins = {origin.rstrip("/").lower() for origin in allowed_origins}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") in self._SAFE_METHODS:
            return await self.app(scope, receive, send)
        if not scope.get("path", "").startswith("/api/"):
            return await self.app(scope, receive, send)

        headers = {name.decode("latin1").lower(): value.decode("latin1") for name, value in scope.get("headers", [])}
        origin = headers.get("origin")
        if origin:
            origin_host = urlsplit(origin).netloc.lower()
            request_host = headers.get("host", "").lower()
            if origin.rstrip("/").lower() not in self.allowed_origins and origin_host != request_host:
                response = JSONResponse(
                    {"error": {"code": "origin_forbidden", "message": "Request origin is not allowed", "details": None}},
                    status_code=403,
                )
                return await response(scope, receive, send)
        await self.app(scope, receive, send)


class BodySizeLimitMiddleware:
    """Rejects request bodies larger than `max_bytes` (by header and by streamed byte count)."""

    def __init__(self, app: ASGIApp, max_bytes: int, upload_max_bytes: int | None = None) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.upload_max_bytes = upload_max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        limit = self.max_bytes
        if scope.get("path") == "/api/documents" and scope.get("method") == "POST":
            limit = self.upload_max_bytes or self.max_bytes

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > limit:
                        return await self._reject(send, limit)
                except ValueError:
                    return await self._reject(send, limit)

        received = 0
        too_big = False
        started = False

        async def limited_receive() -> Message:
            nonlocal received, too_big
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    too_big = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if too_big:
                if not started:
                    started = True
                    await self._reject(send, limit)
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        await self.app(scope, limited_receive, guarded_send)

    async def _reject(self, send: Send, limit: int) -> None:
        body = json.dumps(
            {"error": {"code": "payload_too_large", "message": f"Request body exceeds {limit} bytes", "details": None}, "request_id": None}
        ).encode()
        await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
