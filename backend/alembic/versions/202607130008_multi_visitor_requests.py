"""allow multiple visitors per request

Revision ID: 202607130008
Revises: 202607130007
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op

revision: str = "202607130008"
down_revision: Union[str, None] = "202607130007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("visitor_access_requests_request_id_key", "visitor_access_requests", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("visitor_access_requests_request_id_key", "visitor_access_requests", ["request_id"])
