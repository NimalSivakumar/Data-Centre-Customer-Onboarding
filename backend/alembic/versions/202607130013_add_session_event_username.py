"""add username snapshot to user session events

Revision ID: 202607130013
Revises: 202607130012
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130013"
down_revision: Union[str, None] = "202607130012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_session_events", sa.Column("username_snapshot", sa.String(length=255), nullable=True))
    op.execute(
        """
        update user_session_events
        set username_snapshot = coalesce(actor_email_snapshot, actor_name_snapshot, actor_subject)
        where username_snapshot is null
        """
    )
    op.alter_column("user_session_events", "username_snapshot", nullable=False)
    op.create_index(op.f("ix_user_session_events_username_snapshot"), "user_session_events", ["username_snapshot"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_session_events_username_snapshot"), table_name="user_session_events")
    op.drop_column("user_session_events", "username_snapshot")
