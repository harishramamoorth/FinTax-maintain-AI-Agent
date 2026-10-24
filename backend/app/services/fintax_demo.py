from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.passwords import hash_password
from app.models import FinTaxClient, FinTaxUser

DEMO_CLIENT_NUMBER = "FT-DEMO-2024"


def seed_demo_accounts(db: Session) -> None:
    client = db.execute(
        select(FinTaxClient).where(FinTaxClient.client_number == DEMO_CLIENT_NUMBER)
    ).scalar_one_or_none()
    if client is None:
        client = FinTaxClient(
            client_number=DEMO_CLIENT_NUMBER,
            company_name="FinTax Demo Company",
        )
        db.add(client)
        db.flush()

    accounts = (
        ("demo-admin", "demo-admin@example.test", "admin@2026", "admin"),
        ("demo-staff", "demo-staff@example.test", "staff@2026", "staff"),
    )
    created_staff: FinTaxUser | None = None
    for username, email, password, role in accounts:
        existing = db.execute(
            select(FinTaxUser.id).where(
                or_(FinTaxUser.username == username, FinTaxUser.email == email)
            )
        ).first()
        if existing:
            continue
        user = FinTaxUser(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role=role,
            must_change_password=False,
        )
        db.add(user)
        if role == "staff":
            created_staff = user

    client_account_exists = db.execute(
        select(FinTaxUser.id).where(
            or_(
                FinTaxUser.username == "demo-client",
                FinTaxUser.client_id == client.id,
            )
        )
    ).first()
    if not client_account_exists:
        db.add(FinTaxUser(
            username="demo-client",
            password_hash=hash_password("client@2024"),
            role="client",
            client_id=client.id,
            must_change_password=False,
        ))

    if created_staff is not None:
        created_staff.assigned_clients.append(client)
