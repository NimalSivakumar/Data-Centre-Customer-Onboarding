"""rename heartbeat timestamp to last active timestamp

Revision ID: 202607130017
Revises: 202607130016
Create Date: 2026-09-24

"""
from typing import Sequence, Union

from alembic import op

revision: str = "202607130017"
down_revision: Union[str, None] = "202607130016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f("ix_user_session_events_heartbeat_date_time"), table_name="user_session_events")
    op.alter_column("user_session_events", "heartbeat_date_time", new_column_name="last_active_date_time")
    op.create_index(
        op.f("ix_user_session_events_last_active_date_time"),
        "user_session_events",
        ["last_active_date_time"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_session_events_last_active_date_time"), table_name="user_session_events")
    op.alter_column("user_session_events", "last_active_date_time", new_column_name="heartbeat_date_time")
    op.create_index(
        op.f("ix_user_session_events_heartbeat_date_time"),
        "user_session_events",
        ["heartbeat_date_time"],
        unique=False,
    )
