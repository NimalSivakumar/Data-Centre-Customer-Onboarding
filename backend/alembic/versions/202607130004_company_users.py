"""company users

Revision ID: 202607130004
Revises: 202607130003
Create Date: 2026-07-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130004"
down_revision: Union[str, None] = "202607130003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "user_id", name="uq_company_users_company_user"),
    )
    op.create_index(op.f("ix_company_users_company_id"), "company_users", ["company_id"], unique=False)
    op.create_index(op.f("ix_company_users_user_id"), "company_users", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_company_users_user_id"), table_name="company_users")
    op.drop_index(op.f("ix_company_users_company_id"), table_name="company_users")
    op.drop_table("company_users")
