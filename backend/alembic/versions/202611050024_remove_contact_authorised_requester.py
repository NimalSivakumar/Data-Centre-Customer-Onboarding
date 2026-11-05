"""Remove unused authorised requester flag from contacts.

Revision ID: 202611050024
Revises: 202610290023
"""
from alembic import op
import sqlalchemy as sa

revision = "202611050024"
down_revision = "202610290023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("contacts", "is_authorised_requester")


def downgrade() -> None:
    # Removed values cannot be recovered; restore the old default for all rows.
    op.add_column(
        "contacts",
        sa.Column("is_authorised_requester", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("contacts", "is_authorised_requester", server_default=None)
