"""requests visitor access audit

Revision ID: 202607130003
Revises: 202607130002
Create Date: 2026-07-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "202607130003"
down_revision: Union[str, None] = "202607130002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_number", sa.String(length=50), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_id", sa.Uuid(), nullable=True),
        sa.Column("request_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_number"),
    )
    op.create_index(op.f("ix_requests_company_id"), "requests", ["company_id"], unique=False)
    op.create_index(op.f("ix_requests_request_number"), "requests", ["request_number"], unique=False)

    op.create_table(
        "visitor_access_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("expected_arrival_time", sa.Time(), nullable=False),
        sa.Column("expected_departure_time", sa.Time(), nullable=False),
        sa.Column("site_location", sa.String(length=255), nullable=True),
        sa.Column("host_contact_name", sa.String(length=255), nullable=True),
        sa.Column("visitor_full_name", sa.String(length=255), nullable=False),
        sa.Column("visitor_id_number", sa.String(length=100), nullable=False),
        sa.Column("visitor_phone", sa.String(length=50), nullable=True),
        sa.Column("visitor_email", sa.String(length=255), nullable=True),
        sa.Column("visitor_company", sa.String(length=255), nullable=True),
        sa.Column("vehicle_registration", sa.String(length=100), nullable=True),
        sa.Column("equipment_carried", sa.Text(), nullable=True),
        sa.Column("special_instructions", sa.Text(), nullable=True),
        sa.Column("visit_status", sa.String(length=50), nullable=False),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_in_by_id", sa.Uuid(), nullable=True),
        sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_out_by_id", sa.Uuid(), nullable=True),
        sa.Column("security_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["checked_in_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["checked_out_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_id"),
    )
    op.create_index(
        op.f("ix_visitor_access_requests_request_id"),
        "visitor_access_requests",
        ["request_id"],
        unique=False,
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_index(
        op.f("ix_visitor_access_requests_request_id"),
        table_name="visitor_access_requests",
    )
    op.drop_table("visitor_access_requests")
    op.drop_index(op.f("ix_requests_request_number"), table_name="requests")
    op.drop_index(op.f("ix_requests_company_id"), table_name="requests")
    op.drop_table("requests")
