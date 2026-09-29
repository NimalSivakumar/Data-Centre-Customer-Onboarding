"""store session tracker times as Seychelles local time

Revision ID: 202607130016
Revises: 202607130015
Create Date: 2026-09-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130016"
down_revision: Union[str, None] = "202607130015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "user_session_events",
        "login_date_time",
        type_=sa.DateTime(timezone=False),
        postgresql_using="login_date_time AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=True,
    )
    op.alter_column(
        "user_session_events",
        "heartbeat_date_time",
        type_=sa.DateTime(timezone=False),
        postgresql_using="heartbeat_date_time AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "user_session_events",
        "login_date_time",
        type_=sa.DateTime(timezone=True),
        postgresql_using="login_date_time AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=True,
    )
    op.alter_column(
        "user_session_events",
        "heartbeat_date_time",
        type_=sa.DateTime(timezone=True),
        postgresql_using="heartbeat_date_time AT TIME ZONE 'Indian/Mahe'",
        existing_nullable=True,
    )
