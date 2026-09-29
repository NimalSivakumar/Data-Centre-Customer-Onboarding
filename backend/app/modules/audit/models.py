import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    actor_subject: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    actor_tenant_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_email_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_roles_snapshot: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
