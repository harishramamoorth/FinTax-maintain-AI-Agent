from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import session_scope

router = APIRouter(tags=["system"])
VERSION = "1.0.0"


@router.get("/health")
def health():
    settings = get_settings()
    db_ok = True
    try:
        with session_scope() as s:
            s.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "version": VERSION,
        "time": datetime.now(timezone.utc).isoformat(),
        "database": "ok" if db_ok else "unavailable",
        "mode": "demo" if settings.demo_active else "live",
        "provider_configured": settings.provider_configured,
        "search_configured": settings.search_configured,
        "auth_required": settings.auth_required,
    }
