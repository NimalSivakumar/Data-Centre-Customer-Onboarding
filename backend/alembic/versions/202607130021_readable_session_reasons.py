"""use readable session reason values

Revision ID: 202607130021
Revises: 202607130020
Create Date: 2026-09-25

"""
from typing import Sequence, Union

from alembic import op

revision: str = "202607130021"
down_revision: Union[str, None] = "202607130020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("update user_session_events set reason = 'USER_SIGNED_OUT' where reason = 'EXPLICIT_LOGOUT'")
    op.execute("update user_session_events set reason = 'SESSION_TIMED_OUT' where reason = 'INACTIVITY_TIMEOUT'")


def downgrade() -> None:
    op.execute("update user_session_events set reason = 'EXPLICIT_LOGOUT' where reason = 'USER_SIGNED_OUT'")
    op.execute("update user_session_events set reason = 'INACTIVITY_TIMEOUT' where reason = 'SESSION_TIMED_OUT'")
