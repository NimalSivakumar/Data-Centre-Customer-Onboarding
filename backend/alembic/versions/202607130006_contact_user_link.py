"""contact user link

Revision ID: 202607130006
Revises: 202607130005
Create Date: 2026-07-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130006"
down_revision: Union[str, None] = "202607130005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint("uq_contacts_user_id", "contacts", ["user_id"])
    op.create_foreign_key("fk_contacts_user_id_users", "contacts", "users", ["user_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_contacts_user_id_users", "contacts", type_="foreignkey")
    op.drop_constraint("uq_contacts_user_id", "contacts", type_="unique")
    op.drop_column("contacts", "user_id")
