"""Add private FinTax document records and audit events.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fintax_documents",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("client_id", sa.String(length=32), nullable=False),
        sa.Column("uploaded_by_user_id", sa.String(length=32), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=96), nullable=False),
        sa.Column("media_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["fintax_clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["fintax_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_fintax_documents_category", "fintax_documents", ["category"], unique=False)
    op.create_index("ix_fintax_documents_client_id", "fintax_documents", ["client_id"], unique=False)
    op.create_index("ix_fintax_documents_created_at", "fintax_documents", ["created_at"], unique=False)
    op.create_index("ix_fintax_documents_status", "fintax_documents", ["status"], unique=False)
    op.create_index("ix_fintax_documents_uploaded_by_user_id", "fintax_documents", ["uploaded_by_user_id"], unique=False)
    op.create_table(
        "fintax_audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=True),
        sa.Column("client_id", sa.String(length=32), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=32), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["fintax_clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["fintax_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fintax_audit_events_action", "fintax_audit_events", ["action"], unique=False)
    op.create_index("ix_fintax_audit_events_client_id", "fintax_audit_events", ["client_id"], unique=False)
    op.create_index("ix_fintax_audit_events_created_at", "fintax_audit_events", ["created_at"], unique=False)
    op.create_index("ix_fintax_audit_events_user_id", "fintax_audit_events", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_fintax_audit_events_user_id", table_name="fintax_audit_events")
    op.drop_index("ix_fintax_audit_events_created_at", table_name="fintax_audit_events")
    op.drop_index("ix_fintax_audit_events_client_id", table_name="fintax_audit_events")
    op.drop_index("ix_fintax_audit_events_action", table_name="fintax_audit_events")
    op.drop_table("fintax_audit_events")
    op.drop_index("ix_fintax_documents_uploaded_by_user_id", table_name="fintax_documents")
    op.drop_index("ix_fintax_documents_status", table_name="fintax_documents")
    op.drop_index("ix_fintax_documents_created_at", table_name="fintax_documents")
    op.drop_index("ix_fintax_documents_client_id", table_name="fintax_documents")
    op.drop_index("ix_fintax_documents_category", table_name="fintax_documents")
    op.drop_table("fintax_documents")
