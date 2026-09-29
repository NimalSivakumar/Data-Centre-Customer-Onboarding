"""reliable Entra application sessions

Revision ID: 202607130018
Revises: 202607130017
Create Date: 2026-09-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130018"
down_revision: Union[str, None] = "202607130017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("delete from user_session_events")

    op.drop_index(op.f("ix_user_session_events_last_active_date_time"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_login_date_time"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_username"), table_name="user_session_events")

    op.drop_column("user_session_events", "last_active_date_time")
    op.drop_column("user_session_events", "login_date_time")
    op.drop_column("user_session_events", "username")

    op.add_column("user_session_events", sa.Column("actor_tenant_id", sa.String(length=64), nullable=False))
    op.add_column("user_session_events", sa.Column("actor_object_id", sa.String(length=64), nullable=False))
    op.add_column("user_session_events", sa.Column("actor_subject", sa.String(length=255), nullable=False))
    op.add_column("user_session_events", sa.Column("actor_email_snapshot", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_name_snapshot", sa.String(length=255), nullable=False))
    op.add_column("user_session_events", sa.Column("login_at", sa.DateTime(timezone=True), nullable=False))
    op.add_column("user_session_events", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False))
    op.add_column("user_session_events", sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_session_events", sa.Column("detected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_session_events", sa.Column("status", sa.String(length=32), nullable=False))
    op.add_column("user_session_events", sa.Column("end_reason", sa.String(length=64), nullable=True))

    op.create_index(op.f("ix_user_session_events_actor_tenant_id"), "user_session_events", ["actor_tenant_id"], unique=False)
    op.create_index(op.f("ix_user_session_events_actor_object_id"), "user_session_events", ["actor_object_id"], unique=False)
    op.create_index(op.f("ix_user_session_events_actor_subject"), "user_session_events", ["actor_subject"], unique=False)
    op.create_index(op.f("ix_user_session_events_login_at"), "user_session_events", ["login_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_last_seen_at"), "user_session_events", ["last_seen_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_ended_at"), "user_session_events", ["ended_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_status"), "user_session_events", ["status"], unique=False)
    op.create_index(op.f("ix_user_session_events_end_reason"), "user_session_events", ["end_reason"], unique=False)


def downgrade() -> None:
    op.execute("delete from user_session_events")

    op.drop_index(op.f("ix_user_session_events_end_reason"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_status"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_ended_at"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_last_seen_at"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_login_at"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_subject"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_object_id"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_tenant_id"), table_name="user_session_events")

    op.drop_column("user_session_events", "end_reason")
    op.drop_column("user_session_events", "status")
    op.drop_column("user_session_events", "detected_at")
    op.drop_column("user_session_events", "ended_at")
    op.drop_column("user_session_events", "last_seen_at")
    op.drop_column("user_session_events", "login_at")
    op.drop_column("user_session_events", "actor_name_snapshot")
    op.drop_column("user_session_events", "actor_email_snapshot")
    op.drop_column("user_session_events", "actor_subject")
    op.drop_column("user_session_events", "actor_object_id")
    op.drop_column("user_session_events", "actor_tenant_id")

    op.add_column("user_session_events", sa.Column("username", sa.String(length=255), nullable=False))
    op.add_column("user_session_events", sa.Column("login_date_time", sa.DateTime(timezone=False), nullable=True))
    op.add_column("user_session_events", sa.Column("last_active_date_time", sa.DateTime(timezone=False), nullable=True))

    op.create_index(op.f("ix_user_session_events_username"), "user_session_events", ["username"], unique=False)
    op.create_index(op.f("ix_user_session_events_login_date_time"), "user_session_events", ["login_date_time"], unique=False)
    op.create_index(op.f("ix_user_session_events_last_active_date_time"), "user_session_events", ["last_active_date_time"], unique=False)
