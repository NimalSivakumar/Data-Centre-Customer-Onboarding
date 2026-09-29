"""simplify user session events fields

Revision ID: 202607130014
Revises: 202607130013
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130014"
down_revision: Union[str, None] = "202607130013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_session_events", sa.Column("username", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("login_date_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_session_events", sa.Column("heartbeat_date_time", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        """
        update user_session_events
        set
            username = username_snapshot,
            login_date_time = case when event_type = 'LOGIN_SUCCESS' then created_at else null end,
            heartbeat_date_time = case when event_type = 'HEARTBEAT' then created_at else null end
        """
    )

    op.alter_column("user_session_events", "username", nullable=False)
    op.create_index(op.f("ix_user_session_events_username"), "user_session_events", ["username"], unique=False)
    op.create_index(op.f("ix_user_session_events_login_date_time"), "user_session_events", ["login_date_time"], unique=False)
    op.create_index(op.f("ix_user_session_events_heartbeat_date_time"), "user_session_events", ["heartbeat_date_time"], unique=False)

    op.drop_index(op.f("ix_user_session_events_actor_subject"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_tenant_id"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_created_at"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_event_type"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_username_snapshot"), table_name="user_session_events")

    op.drop_column("user_session_events", "actor_subject")
    op.drop_column("user_session_events", "actor_tenant_id")
    op.drop_column("user_session_events", "actor_email_snapshot")
    op.drop_column("user_session_events", "actor_name_snapshot")
    op.drop_column("user_session_events", "actor_roles_snapshot")
    op.drop_column("user_session_events", "event_type")
    op.drop_column("user_session_events", "access_token_expires_at")
    op.drop_column("user_session_events", "created_at")
    op.drop_column("user_session_events", "username_snapshot")


def downgrade() -> None:
    op.add_column("user_session_events", sa.Column("username_snapshot", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_session_events", sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_session_events", sa.Column("event_type", sa.String(length=50), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_roles_snapshot", sa.JSON(), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_name_snapshot", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_email_snapshot", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_tenant_id", sa.String(length=64), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_subject", sa.String(length=255), nullable=True))

    op.execute(
        """
        update user_session_events
        set
            username_snapshot = username,
            actor_subject = username,
            actor_tenant_id = '',
            actor_email_snapshot = username,
            actor_name_snapshot = username,
            actor_roles_snapshot = '[]'::json,
            event_type = case when login_date_time is not null then 'LOGIN_SUCCESS' else 'HEARTBEAT' end,
            created_at = coalesce(login_date_time, heartbeat_date_time)
        """
    )

    op.alter_column("user_session_events", "actor_subject", nullable=False)
    op.alter_column("user_session_events", "actor_tenant_id", nullable=False)
    op.alter_column("user_session_events", "actor_name_snapshot", nullable=False)
    op.alter_column("user_session_events", "actor_roles_snapshot", nullable=False)
    op.alter_column("user_session_events", "event_type", nullable=False)
    op.alter_column("user_session_events", "created_at", nullable=False)
    op.alter_column("user_session_events", "username_snapshot", nullable=False)

    op.create_index(op.f("ix_user_session_events_actor_subject"), "user_session_events", ["actor_subject"], unique=False)
    op.create_index(op.f("ix_user_session_events_actor_tenant_id"), "user_session_events", ["actor_tenant_id"], unique=False)
    op.create_index(op.f("ix_user_session_events_created_at"), "user_session_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_event_type"), "user_session_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_user_session_events_username_snapshot"), "user_session_events", ["username_snapshot"], unique=False)

    op.drop_index(op.f("ix_user_session_events_heartbeat_date_time"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_login_date_time"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_username"), table_name="user_session_events")
    op.drop_column("user_session_events", "heartbeat_date_time")
    op.drop_column("user_session_events", "login_date_time")
    op.drop_column("user_session_events", "username")
