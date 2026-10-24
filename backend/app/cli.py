from __future__ import annotations

import argparse
from getpass import getpass

from sqlalchemy import select

from app.core.config import get_settings
from app.core.passwords import hash_password
from app.db.session import init_engine, session_scope
from app.models import FinTaxUser


def create_admin(username: str, email: str) -> None:
    password = getpass("Administrator password (12+ characters): ")
    confirmation = getpass("Confirm password: ")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters.")
    if password != confirmation:
        raise SystemExit("Passwords did not match.")

    with session_scope() as db:
        existing = db.execute(select(FinTaxUser.id).where(FinTaxUser.role == "admin").limit(1)).scalar_one_or_none()
        if existing:
            raise SystemExit("An administrator already exists.")
        db.add(
            FinTaxUser(
                username=username,
                email=email.lower(),
                password_hash=hash_password(password),
                role="admin",
                must_change_password=False,
            )
        )
    print(f"Administrator account '{username}' created.")


def main() -> None:
    parser = argparse.ArgumentParser(description="FinTax account administration")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="Create the initial administrator account")
    admin.add_argument("--username", required=True)
    admin.add_argument("--email", required=True)
    args = parser.parse_args()
    from app.main import run_migrations

    run_migrations(get_settings().database_url)
    init_engine()
    if args.command == "create-admin":
        create_admin(args.username, args.email)


if __name__ == "__main__":
    main()
