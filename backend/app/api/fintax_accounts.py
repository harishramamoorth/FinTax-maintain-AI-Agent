from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import active_user, admin_user, staff_user
from app.core.passwords import hash_password
from app.db.session import get_db
from app.models import FinTaxAuditEvent, FinTaxClient, FinTaxUser
from app.schemas.fintax import AccountCreateIn
from app.services.fintax_auth import public_user

router = APIRouter(tags=["FinTax accounts"])


@router.get("/clients")
def list_clients(
    user: FinTaxUser = Depends(staff_user),
    db: Session = Depends(get_db),
):
    query = select(FinTaxClient).order_by(FinTaxClient.company_name)
    if user.role == "staff":
        query = query.where(FinTaxClient.staff_users.any(FinTaxUser.id == user.id))
    clients = db.execute(query).scalars()
    return [
        {
            "id": client.id,
            "client_number": client.client_number,
            "company_name": client.company_name,
            "email": client.email,
            "created_at": client.created_at,
        }
        for client in clients
    ]


@router.post("/accounts", status_code=201)
def create_account(
    body: AccountCreateIn,
    actor: FinTaxUser = Depends(staff_user),
    db: Session = Depends(get_db),
):
    if actor.role != "admin" and body.role != "client":
        raise HTTPException(status_code=403, detail="Staff may create client accounts only")
    if body.role == "client" and (not body.company_name or not body.client_number):
        raise HTTPException(status_code=422, detail="Client accounts require a company name and client number")
    if body.role == "staff" and not body.email:
        raise HTTPException(status_code=422, detail="Staff accounts require an email address")

    temporary_password = body.initial_password or secrets.token_urlsafe(18)
    client = None
    if body.role == "client":
        client = FinTaxClient(
            client_number=body.client_number or "",
            company_name=body.company_name or "",
            email=body.email,
        )
        db.add(client)
        db.flush()
    user = FinTaxUser(
        username=body.username,
        email=body.email,
        password_hash=hash_password(temporary_password),
        role=body.role,
        client_id=client.id if client else None,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    db.add(FinTaxAuditEvent(
        user_id=actor.id,
        client_id=client.id if client else None,
        action="account_create",
        target_id=user.id,
        details={"role": body.role},
    ))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username, email, or client number is already in use") from exc
    db.refresh(user)
    if client and actor.role == "staff":
        actor.assigned_clients.append(client)
        db.commit()
    return {"user": public_user(user), "temporary_password": temporary_password}


@router.get("/accounts")
def list_accounts(
    _admin: FinTaxUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    users = db.execute(select(FinTaxUser).order_by(FinTaxUser.created_at.desc())).scalars()
    return [public_user(user) for user in users]


@router.patch("/accounts/{user_id}/disable")
def disable_account(
    user_id: str,
    admin: FinTaxUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    user = db.get(FinTaxUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.id == admin.id:
        raise HTTPException(status_code=422, detail="Administrators cannot deactivate their own account")
    if user.role == "admin":
        active_admins = db.execute(
            select(FinTaxUser.id).where(FinTaxUser.role == "admin", FinTaxUser.enabled.is_(True))
        ).scalars().all()
        if len(active_admins) <= 1:
            raise HTTPException(status_code=409, detail="The last active administrator cannot be deactivated")
    user.enabled = False
    if user.session:
        db.delete(user.session)
    db.add(FinTaxAuditEvent(user_id=admin.id, client_id=user.client_id, action="account_disable", target_id=user.id))
    db.commit()
    return {"id": user.id, "enabled": user.enabled}


@router.put("/accounts/{user_id}/clients/{client_id}", status_code=204)
def assign_client(
    user_id: str,
    client_id: str,
    _admin: FinTaxUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    staff = db.get(FinTaxUser, user_id)
    client = db.get(FinTaxClient, client_id)
    if staff is None or staff.role != "staff":
        raise HTTPException(status_code=404, detail="Staff account not found")
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    if client not in staff.assigned_clients:
        staff.assigned_clients.append(client)
        db.add(FinTaxAuditEvent(
            user_id=_admin.id,
            client_id=client.id,
            action="staff_client_assignment",
            target_id=staff.id,
        ))
        db.commit()


@router.post("/accounts/{user_id}/reset-password")
def reset_password(
    user_id: str,
    admin: FinTaxUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    user = db.get(FinTaxUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.id == admin.id:
        raise HTTPException(status_code=422, detail="Use your signed-in session to change your own password")
    temporary_password = secrets.token_urlsafe(18)
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    if user.session:
        db.delete(user.session)
    db.add(FinTaxAuditEvent(
        user_id=admin.id,
        client_id=user.client_id,
        action="account_password_reset",
        target_id=user.id,
    ))
    db.commit()
    return {"temporary_password": temporary_password}


@router.get("/audit")
def list_audit_events(
    _admin: FinTaxUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    events = db.execute(
        select(FinTaxAuditEvent).order_by(FinTaxAuditEvent.created_at.desc()).limit(500)
    ).scalars()
    return [
        {
            "id": event.id,
            "user_id": event.user_id,
            "client_id": event.client_id,
            "action": event.action,
            "target_id": event.target_id,
            "details": event.details,
            "created_at": event.created_at,
        }
        for event in events
    ]


@router.get("/client/home")
def client_home(user: FinTaxUser = Depends(active_user)):
    if user.role != "client" or user.client is None:
        raise HTTPException(status_code=403, detail="Client access is required")
    return {
        "client_number": user.client.client_number,
        "company_name": user.client.company_name,
    }
