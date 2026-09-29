"""add audit actor snapshots

Revision ID: 202607130009
Revises: 202607130008
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130009"
down_revision: Union[str, None] = "202607130008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("actor_subject", sa.String(length=255), nullable=True))
    op.add_column("audit_logs", sa.Column("actor_tenant_id", sa.String(length=64), nullable=True))
    op.add_column("audit_logs", sa.Column("actor_email_snapshot", sa.String(length=255), nullable=True))
    op.add_column("audit_logs", sa.Column("actor_name_snapshot", sa.String(length=255), nullable=True))
    op.add_column("audit_logs", sa.Column("actor_roles_snapshot", sa.JSON(), nullable=True))
    op.create_index(op.f("ix_audit_logs_actor_subject"), "audit_logs", ["actor_subject"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_actor_subject"), table_name="audit_logs")
    op.drop_column("audit_logs", "actor_roles_snapshot")
    op.drop_column("audit_logs", "actor_name_snapshot")
    op.drop_column("audit_logs", "actor_email_snapshot")
    op.drop_column("audit_logs", "actor_tenant_id")
    op.drop_column("audit_logs", "actor_subject")
