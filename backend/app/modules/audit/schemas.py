from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    actor_email: str | None = None
    actor_full_name: str | None = None
    action: str
    entity_type: str
    entity_id: UUID | None
    summary: str
    metadata_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
