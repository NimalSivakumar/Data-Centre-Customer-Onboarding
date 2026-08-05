from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel

from app.shared.enums import RequestStatus, VisitStatus


class SecurityVisitorResponse(BaseModel):
    visitor_access_id: UUID
    request_id: UUID
    request_number: str
    request_status: RequestStatus
    company_id: UUID
    visit_date: date
    expected_arrival_time: time
    expected_departure_time: time
    site_location: str | None
    host_contact_name: str | None
    visitor_full_name: str
    visitor_id_number: str
    visitor_phone: str | None
    visitor_email: str | None
    visitor_address: str | None
    visitor_company: str | None
    vehicle_registration: str | None
    equipment_carried: str | None
    special_instructions: str | None
    visit_status: VisitStatus
    checked_in_at: datetime | None
    checked_out_at: datetime | None
    security_notes: str | None


class CheckInRequest(BaseModel):
    identity_verified: bool
    security_notes: str | None = None


class SecurityActionRequest(BaseModel):
    security_notes: str | None = None
