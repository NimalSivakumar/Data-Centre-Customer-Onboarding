"""visitor address

Revision ID: 202607130005
Revises: 202607130004
Create Date: 2026-07-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130005"
down_revision: Union[str, None] = "202607130004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("visitor_access_requests", sa.Column("visitor_address", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("visitor_access_requests", "visitor_address")
