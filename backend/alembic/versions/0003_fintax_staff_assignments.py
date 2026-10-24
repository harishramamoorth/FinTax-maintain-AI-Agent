"""Add staff-to-client assignments.

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fintax_staff_assignments",
        sa.Column("staff_id", sa.String(length=32), nullable=False),
        sa.Column("client_id", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["fintax_clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["fintax_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("staff_id", "client_id"),
    )


def downgrade() -> None:
    op.drop_table("fintax_staff_assignments")
