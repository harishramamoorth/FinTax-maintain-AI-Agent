from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.auth import staff_user
from app.core.security import require_access

# Existing operational APIs are staff-only; client APIs are defined separately.
def protected_router(**kw) -> APIRouter:
    return APIRouter(dependencies=[Depends(require_access), Depends(staff_user)], **kw)
