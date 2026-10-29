"""Bind application sessions to Entra identity and track real activity.

Revision ID: 202610290023
Revises: 202607130022
"""
from alembic import op
import sqlalchemy as sa

revision = "202610290023"
down_revision = "202607130022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy rows intentionally remain NULL: email is not a safe identity backfill.
    # These historical tracking records cannot authorize application access.
    op.add_column("user_session_events", sa.Column("actor_subject", sa.String(255), nullable=True))
    op.add_column("user_session_events", sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_user_session_events_actor_subject", "user_session_events", ["actor_subject"])
    op.create_index("ix_user_session_events_last_activity_at", "user_session_events", ["last_activity_at"])


def downgrade() -> None:
    op.drop_index("ix_user_session_events_last_activity_at", table_name="user_session_events")
    op.drop_index("ix_user_session_events_actor_subject", table_name="user_session_events")
    op.drop_column("user_session_events", "last_activity_at")
    op.drop_column("user_session_events", "actor_subject")
