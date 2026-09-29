from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    actor_subject: str | None = None
    actor_tenant_id: str | None = None
    actor_email_snapshot: str | None = None
    actor_name_snapshot: str | None = None
    actor_roles_snapshot: list[str] | None = None
    actor_email: str | None = None
    actor_full_name: str | None = None
    action: str
    entity_type: str
    entity_id: UUID | None
    summary: str
    metadata_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
