"""add must_change_password to users

Revision ID: 202607130007
Revises: 202607130006
Create Date: 2026-07-24 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "202607130007"
down_revision = "202607130006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("users", "must_change_password", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
