"""merge heartbeat rows into login rows

Revision ID: 202607130015
Revises: 202607130014
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op

revision: str = "202607130015"
down_revision: Union[str, None] = "202607130014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        update user_session_events login_row
        set heartbeat_date_time = heartbeat_row.latest_heartbeat
        from (
            select
                login_row.id as login_id,
                max(heartbeat_row.heartbeat_date_time) as latest_heartbeat
            from user_session_events login_row
            join user_session_events heartbeat_row
                on heartbeat_row.username = login_row.username
                and heartbeat_row.login_date_time is null
                and heartbeat_row.heartbeat_date_time is not null
                and heartbeat_row.heartbeat_date_time >= login_row.login_date_time
            where login_row.login_date_time is not null
            group by login_row.id
        ) heartbeat_row
        where login_row.id = heartbeat_row.login_id
        """
    )
    op.execute(
        """
        delete from user_session_events
        where login_date_time is null
        and heartbeat_date_time is not null
        and exists (
            select 1
            from user_session_events login_row
            where login_row.username = user_session_events.username
            and login_row.login_date_time is not null
            and login_row.login_date_time <= user_session_events.heartbeat_date_time
        )
        """
    )


def downgrade() -> None:
    pass
