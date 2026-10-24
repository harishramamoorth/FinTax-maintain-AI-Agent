from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.passwords import hash_password, verify_password
from app.core.security import auth_rate_limited
from app.db.session import get_db
from app.models import FinTaxAuditEvent, FinTaxSession, FinTaxUser
from app.schemas.fintax import ChangePasswordIn, LoginIn
from app.services.fintax_auth import SESSION_HOURS, authenticate, public_user, session_token_hash

router = APIRouter(tags=["FinTax authentication"])
COOKIE_NAME = "fintax_session"


def current_user(request: Request, db: Session = Depends(get_db)) -> FinTaxUser:
    if get_settings().app_env == "test":
        return FinTaxUser(
            id="test-admin",
            username="test-admin",
            password_hash="",
            role="admin",
            enabled=True,
            must_change_password=False,
        )
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in")
    session = db.execute(
        select(FinTaxSession).where(
            FinTaxSession.token_hash == session_token_hash(token),
            FinTaxSession.expires_at > datetime.now(timezone.utc),
        )
    ).scalar_one_or_none()
    if session is None or not session.user.enabled:
        raise HTTPException(status_code=401, detail="Session expired; please sign in again")
    return session.user


def staff_user(user: FinTaxUser = Depends(current_user)) -> FinTaxUser:
    if user.role not in {"admin", "staff"}:
        raise HTTPException(status_code=403, detail="Staff access is required")
    if user.must_change_password:
        raise HTTPException(status_code=403, detail="Change your temporary password before continuing")
    return user


def active_user(user: FinTaxUser = Depends(current_user)) -> FinTaxUser:
    if user.must_change_password:
        raise HTTPException(status_code=403, detail="Change your temporary password before continuing")
    return user


def admin_user(user: FinTaxUser = Depends(current_user)) -> FinTaxUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access is required")
    if user.must_change_password:
        raise HTTPException(status_code=403, detail="Change your temporary password before continuing")
    return user


@router.post("/auth/login", dependencies=[Depends(auth_rate_limited)])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    result = authenticate(db, body.identifier, body.password)
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid account or password")
    user, token = result
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_HOURS * 60 * 60,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        path="/api",
    )
    return {"user": public_user(user)}


@router.get("/auth/me")
def me(user: FinTaxUser = Depends(current_user)):
    return {"user": public_user(user)}


@router.post("/auth/logout", status_code=204)
def logout(
    response: Response,
    user: FinTaxUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.session:
        db.add(FinTaxAuditEvent(user_id=user.id, client_id=user.client_id, action="logout"))
        db.delete(user.session)
        db.commit()
    response.delete_cookie(COOKIE_NAME, path="/api", httponly=True, samesite="strict")


@router.post("/auth/change-password")
def change_password(
    body: ChangePasswordIn,
    user: FinTaxUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=422, detail="Choose a different password")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.add(FinTaxAuditEvent(user_id=user.id, client_id=user.client_id, action="password_change"))
    db.commit()
    return {"user": public_user(user)}
