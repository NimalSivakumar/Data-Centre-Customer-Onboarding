"""drop legacy identity structures

Revision ID: 202607130011
Revises: 202607130010
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130011"
down_revision: Union[str, None] = "202607130010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("company_users")

    op.drop_constraint("fk_contacts_user_id_users", "contacts", type_="foreignkey")
    op.drop_constraint("uq_contacts_user_id", "contacts", type_="unique")
    op.drop_column("contacts", "user_id")

    op.drop_constraint("companies_created_by_id_fkey", "companies", type_="foreignkey")
    op.drop_constraint("companies_updated_by_id_fkey", "companies", type_="foreignkey")
    op.drop_column("companies", "created_by_id")
    op.drop_column("companies", "updated_by_id")

    op.drop_constraint("requests_requested_by_id_fkey", "requests", type_="foreignkey")
    op.drop_constraint("requests_reviewed_by_id_fkey", "requests", type_="foreignkey")
    op.drop_column("requests", "requested_by_id")
    op.drop_column("requests", "reviewed_by_id")

    op.drop_constraint("visitor_access_requests_checked_in_by_id_fkey", "visitor_access_requests", type_="foreignkey")
    op.drop_constraint("visitor_access_requests_checked_out_by_id_fkey", "visitor_access_requests", type_="foreignkey")
    op.drop_column("visitor_access_requests", "checked_in_by_id")
    op.drop_column("visitor_access_requests", "checked_out_by_id")

    op.drop_table("user_roles")
    op.drop_table("roles")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")


def downgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("auth_provider", sa.String(length=50), nullable=False, server_default="local"),
        sa.Column("external_subject", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)

    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    op.add_column("visitor_access_requests", sa.Column("checked_out_by_id", sa.Uuid(), nullable=True))
    op.add_column("visitor_access_requests", sa.Column("checked_in_by_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("visitor_access_requests_checked_out_by_id_fkey", "visitor_access_requests", "users", ["checked_out_by_id"], ["id"])
    op.create_foreign_key("visitor_access_requests_checked_in_by_id_fkey", "visitor_access_requests", "users", ["checked_in_by_id"], ["id"])

    op.add_column("requests", sa.Column("reviewed_by_id", sa.Uuid(), nullable=True))
    op.add_column("requests", sa.Column("requested_by_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("requests_reviewed_by_id_fkey", "requests", "users", ["reviewed_by_id"], ["id"])
    op.create_foreign_key("requests_requested_by_id_fkey", "requests", "users", ["requested_by_id"], ["id"])

    op.add_column("companies", sa.Column("updated_by_id", sa.Uuid(), nullable=True))
    op.add_column("companies", sa.Column("created_by_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("companies_updated_by_id_fkey", "companies", "users", ["updated_by_id"], ["id"])
    op.create_foreign_key("companies_created_by_id_fkey", "companies", "users", ["created_by_id"], ["id"])

    op.add_column("contacts", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint("uq_contacts_user_id", "contacts", ["user_id"])
    op.create_foreign_key("fk_contacts_user_id_users", "contacts", "users", ["user_id"], ["id"])

    op.create_table(
        "company_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "user_id", name="uq_company_users_company_user"),
    )
    op.create_index(op.f("ix_company_users_company_id"), "company_users", ["company_id"], unique=False)
    op.create_index(op.f("ix_company_users_user_id"), "company_users", ["user_id"], unique=False)
