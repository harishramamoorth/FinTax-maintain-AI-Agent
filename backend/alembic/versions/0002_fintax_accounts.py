"""Add FinTax clients, role accounts, and single-account sessions.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fintax_clients",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("client_number", sa.String(length=32), nullable=False),
        sa.Column("company_name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_number"),
    )
    op.create_index("ix_fintax_clients_client_number", "fintax_clients", ["client_number"], unique=True)
    op.create_table(
        "fintax_users",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("password_hash", sa.String(length=256), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("client_id", sa.String(length=32), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["fintax_clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_fintax_users_role", "fintax_users", ["role"], unique=False)
    op.create_index("ix_fintax_users_username", "fintax_users", ["username"], unique=True)
    op.create_table(
        "fintax_sessions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["fintax_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_fintax_sessions_expires_at", "fintax_sessions", ["expires_at"], unique=False)
    op.create_index("ix_fintax_sessions_user_id", "fintax_sessions", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_fintax_sessions_user_id", table_name="fintax_sessions")
    op.drop_index("ix_fintax_sessions_expires_at", table_name="fintax_sessions")
    op.drop_table("fintax_sessions")
    op.drop_index("ix_fintax_users_username", table_name="fintax_users")
    op.drop_index("ix_fintax_users_role", table_name="fintax_users")
    op.drop_table("fintax_users")
    op.drop_index("ix_fintax_clients_client_number", table_name="fintax_clients")
    op.drop_table("fintax_clients")
