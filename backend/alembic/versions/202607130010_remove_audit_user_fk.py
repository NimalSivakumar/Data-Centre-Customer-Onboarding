"""remove audit user foreign key

Revision ID: 202607130010
Revises: 202607130009
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130010"
down_revision: Union[str, None] = "202607130009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE audit_logs AS audit
        SET
            actor_subject = COALESCE(audit.actor_subject, 'legacy-user:' || audit.actor_user_id::text),
            actor_email_snapshot = COALESCE(audit.actor_email_snapshot, users.email),
            actor_name_snapshot = COALESCE(audit.actor_name_snapshot, users.full_name),
            actor_roles_snapshot = COALESCE(audit.actor_roles_snapshot, legacy_roles.roles)
        FROM users
        LEFT JOIN (
            SELECT
                user_roles.user_id,
                json_agg(roles.name ORDER BY roles.name) AS roles
            FROM user_roles
            JOIN roles ON roles.id = user_roles.role_id
            GROUP BY user_roles.user_id
        ) AS legacy_roles ON legacy_roles.user_id = users.id
        WHERE audit.actor_user_id = users.id
        """
    )
    op.drop_constraint("audit_logs_actor_user_id_fkey", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "actor_user_id")


def downgrade() -> None:
    op.add_column("audit_logs", sa.Column("actor_user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "audit_logs_actor_user_id_fkey",
        "audit_logs",
        "users",
        ["actor_user_id"],
        ["id"],
    )
