from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.visitor_access.schemas import VisitorAccessResponse
from app.shared.enums import RequestStatus, RequestType


class ReviewRequest(BaseModel):
    review_notes: str | None = None


class RequestResponse(BaseModel):
    id: UUID
    request_number: str
    company_id: UUID
    requested_by_id: UUID | None
    request_type: RequestType
    title: str
    description: str | None
    status: RequestStatus
    submitted_at: datetime | None
    reviewed_by_id: UUID | None
    reviewed_at: datetime | None
    review_notes: str | None
    created_at: datetime
    updated_at: datetime
    visitor_access: VisitorAccessResponse | None = None
    visitor_accesses: list[VisitorAccessResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
