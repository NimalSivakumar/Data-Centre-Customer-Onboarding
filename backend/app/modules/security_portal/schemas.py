from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel

from app.shared.enums import VisitStatus


class SecurityVisitorResponse(BaseModel):
    visitor_access_id: UUID
    request_number: str
    customer_company_name: str | None
    visit_date: date
    expected_arrival_time: time
    expected_departure_time: time
    visitor_full_name: str
    visitor_id_number: str
    equipment_carried: str | None
    visit_status: VisitStatus
    checked_in_at: datetime | None
    checked_out_at: datetime | None


class CheckInRequest(BaseModel):
    identity_verified: bool
    security_notes: str | None = None


class SecurityActionRequest(BaseModel):
    security_notes: str | None = None
