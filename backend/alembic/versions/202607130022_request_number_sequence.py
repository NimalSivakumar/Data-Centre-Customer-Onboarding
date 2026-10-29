"""add request number sequence

Revision ID: 202607130022
Revises: 202607130021
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op

revision: str = "202607130022"
down_revision: Union[str, None] = "202607130021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS request_number_seq")
    op.execute(
        """
        SELECT setval(
            'request_number_seq',
            COALESCE(
                (
                    SELECT max((substring(request_number from '-([0-9]+)$'))::bigint)
                    FROM requests
                    WHERE request_number ~ '-[0-9]+$'
                ),
                0
            ) + 1,
            false
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP SEQUENCE IF EXISTS request_number_seq")
