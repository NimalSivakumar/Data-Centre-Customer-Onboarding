"""create user session events table

Revision ID: 202607130012
Revises: 202607130011
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130012"
down_revision: Union[str, None] = "202607130011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_session_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_subject", sa.String(length=255), nullable=False),
        sa.Column("actor_tenant_id", sa.String(length=64), nullable=False),
        sa.Column("actor_email_snapshot", sa.String(length=255), nullable=True),
        sa.Column("actor_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("actor_roles_snapshot", sa.JSON(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_session_events_actor_subject"), "user_session_events", ["actor_subject"], unique=False)
    op.create_index(op.f("ix_user_session_events_actor_tenant_id"), "user_session_events", ["actor_tenant_id"], unique=False)
    op.create_index(op.f("ix_user_session_events_created_at"), "user_session_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_event_type"), "user_session_events", ["event_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_session_events_event_type"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_created_at"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_tenant_id"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_subject"), table_name="user_session_events")
    op.drop_table("user_session_events")
