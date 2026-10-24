"""Knowledge-base persistence and keyword search (no embeddings / semantic search)."""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import KnowledgeDocument

_WORD = re.compile(r"[\w\-]+", re.UNICODE)


def tokenize(q: str) -> list[str]:
    return [t.lower() for t in _WORD.findall(q) if len(t) > 1]


def _snippet(content: str, terms: list[str], width: int = 220) -> str:
    low = content.lower()
    pos = -1
    for t in terms:
        pos = low.find(t)
        if pos >= 0:
            break
    if pos < 0:
        return content[:width].strip()
    start = max(0, pos - width // 3)
    end = min(len(content), start + width)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(content) else ""
    return f"{prefix}{content[start:end].strip()}{suffix}"


def search_documents(session: Session, query: str, *, agent_only: bool = False, limit: int = 10) -> list[dict[str, Any]]:
    """Keyword scoring: title x3, tags x2, content x1. Returns [] for an empty query."""
    terms = tokenize(query)
    if not terms:
        return []
    stmt = select(KnowledgeDocument)
    if agent_only:
        stmt = stmt.where(KnowledgeDocument.agent_accessible.is_(True))
    results: list[dict[str, Any]] = []
    for doc in session.execute(stmt).scalars():
        title, content, tags = doc.title.lower(), doc.content.lower(), " ".join(doc.tags or []).lower()
        score = 0
        for t in terms:
            score += 3 * title.count(t) + 2 * tags.count(t) + min(content.count(t), 10)
        if score > 0:
            results.append({"id": doc.id, "title": doc.title, "snippet": _snippet(doc.content, terms), "score": float(score)})
    results.sort(key=lambda r: (-r["score"], r["title"]))
    return results[:limit]


def count_documents(session: Session) -> int:
    return session.execute(select(func.count(KnowledgeDocument.id))).scalar() or 0
