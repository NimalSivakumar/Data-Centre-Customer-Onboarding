"""reorder session tracker display columns

Revision ID: 202607130020
Revises: 202607130019
Create Date: 2026-09-24

"""
from typing import Sequence, Union

from alembic import op

revision: str = "202607130020"
down_revision: Union[str, None] = "202607130019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        create table user_session_events_reordered (
            id uuid primary key,
            name varchar(255) not null,
            email varchar(255),
            login_at timestamp not null,
            last_seen_at timestamp not null,
            ended_at timestamp,
            reason varchar(64)
        )
        """
    )
    op.execute(
        """
        insert into user_session_events_reordered (id, name, email, login_at, last_seen_at, ended_at, reason)
        select id, name, email, login_at, last_seen_at, ended_at, reason
        from user_session_events
        """
    )
    op.drop_table("user_session_events")
    op.rename_table("user_session_events_reordered", "user_session_events")
    op.create_index(op.f("ix_user_session_events_email"), "user_session_events", ["email"], unique=False)
    op.create_index(op.f("ix_user_session_events_login_at"), "user_session_events", ["login_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_last_seen_at"), "user_session_events", ["last_seen_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_ended_at"), "user_session_events", ["ended_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_reason"), "user_session_events", ["reason"], unique=False)


def downgrade() -> None:
    op.execute(
        """
        create table user_session_events_previous_order (
            id uuid primary key,
            login_at timestamp not null,
            last_seen_at timestamp not null,
            ended_at timestamp,
            name varchar(255) not null,
            email varchar(255),
            reason varchar(64)
        )
        """
    )
    op.execute(
        """
        insert into user_session_events_previous_order (id, login_at, last_seen_at, ended_at, name, email, reason)
        select id, login_at, last_seen_at, ended_at, name, email, reason
        from user_session_events
        """
    )
    op.drop_table("user_session_events")
    op.rename_table("user_session_events_previous_order", "user_session_events")
    op.create_index(op.f("ix_user_session_events_email"), "user_session_events", ["email"], unique=False)
    op.create_index(op.f("ix_user_session_events_login_at"), "user_session_events", ["login_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_last_seen_at"), "user_session_events", ["last_seen_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_ended_at"), "user_session_events", ["ended_at"], unique=False)
    op.create_index(op.f("ix_user_session_events_reason"), "user_session_events", ["reason"], unique=False)
