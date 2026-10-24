"""Logging setup with secret redaction."""
from __future__ import annotations

import logging
import re

from app.core.config import get_settings

_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-~+/=]{8,}"),
    re.compile(r"(?i)((?:api[_-]?key|token|secret|password|authorization)[\"']?\s*[:=]\s*[\"']?)(?!\[REDACTED\]|(?i:bearer)\b)[^\s\"',}&]+"),
]


def redact(text: str, extra_secrets: list[str] | None = None) -> str:
    for secret in extra_secrets or []:
        if secret and len(secret) >= 4:
            text = text.replace(secret, "[REDACTED]")
    text = _PATTERNS[0].sub("[REDACTED]", text)
    text = _PATTERNS[1].sub("Bearer [REDACTED]", text)
    text = _PATTERNS[2].sub(r"\1[REDACTED]", text)
    return text


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:  # pragma: no cover - malformed log call
            return True
        secrets = get_settings().secret_values()
        record.msg = redact(msg, secrets)
        record.args = ()
        if record.exc_info:
            fmt = logging.Formatter().formatException(record.exc_info)
            record.exc_text = redact(fmt, secrets)
            record.exc_info = None
        return True


def setup_logging() -> None:
    settings = get_settings()
    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
        root.addHandler(handler)
    for handler in root.handlers:
        if not any(isinstance(f, RedactingFilter) for f in handler.filters):
            handler.addFilter(RedactingFilter())
    logging.getLogger("httpx").setLevel(logging.WARNING)
