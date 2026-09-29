"""simplify session tracker display fields

Revision ID: 202607130019
Revises: 202607130018
Create Date: 2026-09-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130019"
down_revision: Union[str, None] = "202607130018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_session_events", sa.Column("name", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("reason", sa.String(length=64), nullable=True))

    op.execute(
        """
        update user_session_events
        set
            name = actor_name_snapshot,
            email = actor_email_snapshot,
            reason = end_reason
        """
    )
    op.alter_column("user_session_events", "name", nullable=False)

    op.alter_column(
        "user_session_events",
        "login_at",
        type_=sa.DateTime(timezone=False),
        postgresql_using="login_at AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=False,
    )
    op.alter_column(
        "user_session_events",
        "last_seen_at",
        type_=sa.DateTime(timezone=False),
        postgresql_using="last_seen_at AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=False,
    )
    op.alter_column(
        "user_session_events",
        "ended_at",
        type_=sa.DateTime(timezone=False),
        postgresql_using="ended_at AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=True,
    )

    op.drop_index(op.f("ix_user_session_events_actor_tenant_id"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_object_id"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_actor_subject"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_status"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_end_reason"), table_name="user_session_events")

    op.drop_column("user_session_events", "actor_tenant_id")
    op.drop_column("user_session_events", "actor_object_id")
    op.drop_column("user_session_events", "actor_subject")
    op.drop_column("user_session_events", "actor_email_snapshot")
    op.drop_column("user_session_events", "actor_name_snapshot")
    op.drop_column("user_session_events", "detected_at")
    op.drop_column("user_session_events", "status")
    op.drop_column("user_session_events", "end_reason")

    op.create_index(op.f("ix_user_session_events_email"), "user_session_events", ["email"], unique=False)
    op.create_index(op.f("ix_user_session_events_reason"), "user_session_events", ["reason"], unique=False)


def downgrade() -> None:
    op.add_column("user_session_events", sa.Column("end_reason", sa.String(length=64), nullable=True))
    op.add_column("user_session_events", sa.Column("status", sa.String(length=32), nullable=True))
    op.add_column("user_session_events", sa.Column("detected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_name_snapshot", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_email_snapshot", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_subject", sa.String(length=255), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_object_id", sa.String(length=64), nullable=True))
    op.add_column("user_session_events", sa.Column("actor_tenant_id", sa.String(length=64), nullable=True))

    op.execute(
        """
        update user_session_events
        set
            end_reason = reason,
            status = case when ended_at is null then 'ACTIVE' else 'ENDED' end,
            detected_at = ended_at,
            actor_name_snapshot = name,
            actor_email_snapshot = email,
            actor_subject = coalesce(email, name),
            actor_object_id = '',
            actor_tenant_id = ''
        """
    )

    op.alter_column("user_session_events", "status", nullable=False)
    op.alter_column("user_session_events", "actor_name_snapshot", nullable=False)
    op.alter_column("user_session_events", "actor_subject", nullable=False)
    op.alter_column("user_session_events", "actor_object_id", nullable=False)
    op.alter_column("user_session_events", "actor_tenant_id", nullable=False)

    op.alter_column(
        "user_session_events",
        "login_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="login_at AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=False,
    )
    op.alter_column(
        "user_session_events",
        "last_seen_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="last_seen_at AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=False,
    )
    op.alter_column(
        "user_session_events",
        "ended_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="ended_at AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=True,
    )

    op.create_index(op.f("ix_user_session_events_actor_tenant_id"), "user_session_events", ["actor_tenant_id"], unique=False)
    op.create_index(op.f("ix_user_session_events_actor_object_id"), "user_session_events", ["actor_object_id"], unique=False)
    op.create_index(op.f("ix_user_session_events_actor_subject"), "user_session_events", ["actor_subject"], unique=False)
    op.create_index(op.f("ix_user_session_events_status"), "user_session_events", ["status"], unique=False)
    op.create_index(op.f("ix_user_session_events_end_reason"), "user_session_events", ["end_reason"], unique=False)

    op.drop_index(op.f("ix_user_session_events_reason"), table_name="user_session_events")
    op.drop_index(op.f("ix_user_session_events_email"), table_name="user_session_events")
    op.drop_column("user_session_events", "reason")
    op.drop_column("user_session_events", "email")
    op.drop_column("user_session_events", "name")
