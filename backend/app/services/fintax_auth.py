from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.passwords import hash_password, verify_password
from app.models import FinTaxAuditEvent, FinTaxClient, FinTaxSession, FinTaxUser

SESSION_HOURS = 8


def session_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(user: FinTaxUser) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "client_id": user.client_id,
        "client_number": user.client.client_number if user.client else None,
        "company_name": user.client.company_name if user.client else None,
        "must_change_password": user.must_change_password,
        "enabled": user.enabled,
        "assigned_client_ids": [client.id for client in user.assigned_clients] if user.role == "staff" else [],
    }


def authenticate(db: Session, identifier: str, password: str) -> tuple[FinTaxUser, str] | None:
    normalized = identifier.strip()
    user = db.execute(
        select(FinTaxUser)
        .outerjoin(FinTaxClient, FinTaxUser.client_id == FinTaxClient.id)
        .where(
            or_(
                FinTaxUser.username == normalized,
                FinTaxUser.email == normalized.lower(),
                FinTaxClient.client_number == normalized,
            )
        )
    ).scalar_one_or_none()
    if user is None or not user.enabled or not verify_password(password, user.password_hash):
        return None

    token = secrets.token_urlsafe(32)
    if user.session:
        db.delete(user.session)
        db.flush()
    db.add(
        FinTaxSession(
            user_id=user.id,
            token_hash=session_token_hash(token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS),
        )
    )
    db.add(FinTaxAuditEvent(user_id=user.id, client_id=user.client_id, action="login"))
    db.commit()
    return user, token


def create_user(
    db: Session,
    *,
    username: str,
    email: str | None,
    password: str,
    role: str,
    client_id: str | None = None,
) -> FinTaxUser:
    if role not in {"admin", "staff", "client"}:
        raise ValueError("Unsupported account role")
    if (role == "client") != (client_id is not None):
        raise ValueError("Client accounts must have exactly one client record")
    user = FinTaxUser(
        username=username.strip(),
        email=email.strip().lower() if email else None,
        password_hash=hash_password(password),
        role=role,
        client_id=client_id,
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
